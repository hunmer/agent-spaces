import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Toolbar from './components/Toolbar';
import CreationPanel from './components/CreationPanel';
import CopywritingCard from './components/CopywritingCard';
import CopywritingForm from './components/CopywritingForm';
import PlayerDialog from './components/PlayerDialog';
import UploadSettingsDialog from './components/UploadSettingsDialog';
import ReferenceGroupsDialog from './components/ReferenceGroupsDialog';
import { useCopywritingDb } from './hooks/useCopywritingDb';
import { useSettings } from './hooks/useSettings';
import { recognize, getMediaDuration, genTaskId } from './utils/transcribe';
import { uploadToCloud, readUploadSettings } from './utils/upload';
import { addCopywritingToKnowledgeBase, queryCopywritingKnowledgeBase, deleteCopywritingKnowledgeBaseFile } from './utils/knowledge-base';
import { loadReferenceGroups, saveReferenceGroups, makeGroupId } from './utils/reference-list';
import { loadAgentConfig, saveAgentConfig } from './utils/agent-config';

const { FileText, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Slider, Badge } = window.AgentSpacesUI;

const BUILTIN_PLUGIN = '@agent-spaces/builtin';
const { getUserSetting, saveUserSettings } = window.AgentSpaces;

const DEFAULT_FILTER = { keyword: '', type: '', tag: '', durationSort: '' };

function uniqById(items) {
  const map = new Map();
  for (const item of items) map.set(item.id, item);
  return [...map.values()];
}

function toRefItem(item, groupId) {
  const text = item.type === 'text' ? (item.content || '') : (item.transcription || '');
  return {
    id: item.id,
    groupId,
    title: item.title || '',
    preview: String(text || '').slice(0, 200),
  };
}

// 基于种子（结果 id）的确定性浅色：色相由 hash 推出，高亮度低饱和，每次渲染颜色稳定
function softColorFromSeed(seed) {
  let hash = 0;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return {
    bg: `hsl(${hue} 75% 95%)`,
    border: `hsl(${hue} 55% 82%)`,
    dot: `hsl(${hue} 55% 55%)`,
  };
}

// 待生成文案的骨架占位符
function CreationSkeletonCard() {
  return (
    <div className="space-y-2 rounded-md border bg-background p-3">
      <div className="flex items-center gap-2">
        <span className="size-2 animate-pulse rounded-full bg-muted-foreground/40" />
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-11/12 animate-pulse rounded bg-muted" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

export default function App() {
  const dbq = useCopywritingDb();
  const { settings, ready: settingsReady, update: updateSettings } = useSettings();

  const [filter, setFilter] = useState(DEFAULT_FILTER);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [unindexedCount, setUnindexedCount] = useState(0);
  const [viewMode, setViewMode] = useState('manage');

  const [referenceGroups, setReferenceGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [referenceDialogOpen, setReferenceDialogOpen] = useState(false);
  const [referenceDialogItemId, setReferenceDialogItemId] = useState('');
  const [referenceItems, setReferenceItems] = useState([]);

  const [creationAgentMeta, setCreationAgentMeta] = useState(null);
  const [creationInput, setCreationInput] = useState('');
  const [creationOutputCount, setCreationOutputCount] = useState(3);
  const [creationRunning, setCreationRunning] = useState(false);
  const [creationResults, setCreationResults] = useState(() => {
    try { return getUserSetting('creationResults', []) || []; } catch { return []; }
  });
  const cancelCreationRef = useRef(false);

  const refreshAll = useCallback(() => {
    dbq.refresh(filter);
    dbq.refreshTags();
    dbq.count();
  }, [dbq, filter]);

  useEffect(() => {
    (async () => {
      try {
        const groups = await loadReferenceGroups();
        setReferenceGroups(groups);
        if (!selectedGroupId && groups[0]) setSelectedGroupId(groups[0].id);
      } catch {
        setReferenceGroups([]);
      }
    })();
  }, []);

  // 用户偏好（settings.json）：筛选词、视图模式等个人状态
  useEffect(() => {
    if (!settingsReady) return;
    setFilter({
      keyword: settings.keyword || '',
      type: settings.type || '',
      tag: settings.tag || '',
      durationSort: settings.durationSort || '',
    });
    setViewMode(settings.viewMode || 'manage');
    setSelectedGroupId(settings.creationGroupId || '');
    setCreationOutputCount(settings.creationOutputCount || 3);
  }, [settingsReady]);

  useEffect(() => {
    if (!dbq.ready) return;
    dbq.refresh(filter);
    updateSettings({
      keyword: filter.keyword,
      type: filter.type,
      tag: filter.tag,
      durationSort: filter.durationSort,
      viewMode,
      creationGroupId: selectedGroupId,
      creationOutputCount,
    });
  }, [dbq.ready, filter.keyword, filter.type, filter.tag, filter.durationSort, viewMode, selectedGroupId, creationOutputCount]);

  // 创作 Agent 配置（共享 config：configs/agent.json，所有用户共用同一份）
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const cfg = await loadAgentConfig();
        if (active && cfg.configId) {
          setCreationAgentMeta({ id: cfg.configId, name: cfg.name || cfg.configId });
        }
      } catch {
        /* 首次打开尚无配置 */
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const unsub = window.AgentSpaces.onTaskEvent((event, data) => {
      if (event === 'miniApp.taskFinished' || event === 'miniApp.taskFailed') {
        dbq.refresh(filter);
      } else if (event === 'miniApp.clientRequest' && data?.type === 'copywritingKnowledgeBase') {
        const query = String(data.payload?.query || '').trim();
        const topK = Number.isFinite(Number(data.payload?.topK)) ? Number(data.payload.topK) : 5;

        queryCopywritingKnowledgeBase(query, topK)
          .then((result) => {
            const matches = Array.isArray(result)
              ? result
              : Array.isArray(result?.matches)
                ? result.matches
                : Array.isArray(result?.results)
                  ? result.results
                  : Array.isArray(result?.items)
                    ? result.items
                    : Array.isArray(result?.documents)
                      ? result.documents
                      : [];
            window.AgentSpaces.respondClientRequest(data.requestId, {
              query,
              count: matches.length,
              matches,
              raw: result,
            });
          })
          .catch((error) => {
            window.AgentSpaces.respondClientRequest(
              data.requestId,
              null,
              false,
              error instanceof Error ? error.message : String(error),
            );
          });
      }
    });
    return unsub;
  }, [dbq, filter]);

  const syncToKnowledgeBase = useCallback((item) => {
    dbq.update(item.id, { kb_status: 'indexing', kb_error: '' }).then(refreshAll);
    addCopywritingToKnowledgeBase(item)
      .then((result) => dbq.update(item.id, {
        kb_status: result?.status || 'indexed',
        kb_file_id: result?.fileId || '',
        kb_error: result?.error || '',
      }))
      .catch((error) => dbq.update(item.id, {
        kb_status: 'failed',
        kb_error: error instanceof Error ? error.message : String(error),
      }))
      .finally(refreshAll);
  }, [dbq, refreshAll]);

  // 存储设置弹窗打开时刷新「未入库」计数（供批量扫描按钮展示）
  useEffect(() => {
    if (!settingsOpen) return;
    dbq.countUnindexed().then(setUnindexedCount).catch(() => {});
  }, [settingsOpen, dbq]);

  // 批量扫描：把未入库（kb_status !== 'indexed'）的文案逐条同步到知识库。
  // 状态机与 syncToKnowledgeBase 一致：indexing → 入库 → indexed / failed，空内容跳过。
  const handleScanUnindexed = async () => {
    const pending = await dbq.listUnindexed();
    let success = 0;
    let failed = 0;
    let skipped = 0;
    for (const item of pending) {
      const text = item.type === 'text' ? (item.content || '') : (item.transcription || '');
      if (!String(text).trim()) { skipped++; continue; }
      await dbq.update(item.id, { kb_status: 'indexing', kb_error: '' });
      try {
        const result = await addCopywritingToKnowledgeBase(item);
        const isFailed = result?.status === 'failed' || !!result?.error;
        await dbq.update(item.id, {
          kb_status: isFailed ? 'failed' : (result?.status || 'indexed'),
          kb_file_id: result?.fileId || item.kb_file_id || '',
          kb_error: result?.error || '',
        });
        if (isFailed) failed++; else success++;
      } catch (error) {
        await dbq.update(item.id, {
          kb_status: 'failed',
          kb_error: error instanceof Error ? error.message : String(error),
        });
        failed++;
      }
    }
    refreshAll();
    setUnindexedCount(await dbq.countUnindexed().catch(() => 0));
    return { total: pending.length, success, failed, skipped };
  };

  const openNew = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (item) => { setEditing(item); setFormOpen(true); };

  const runTranscribe = (id, cloudUrl, title, type) => {
    const taskId = genTaskId('asr');
    dbq.update(id, { status: 'transcribing' }).then(refreshAll);
    recognize(cloudUrl, { taskId, meta: { id, title } })
      .then((text) => dbq.update(id, { transcription: text, status: 'done' })
        .then(() => syncToKnowledgeBase({ id, title, type, transcription: text })))
      .catch(() => dbq.update(id, { status: 'failed' }))
      .finally(refreshAll);
  };

  const getMediaType = (file) => (file?.type?.startsWith('video/') ? 'video' : 'audio');

  const handleSubmit = async (data) => {
    if (editing) {
      await dbq.update(editing.id, {
        title: data.title,
        content: data.content,
        transcription: data.transcription,
        tags: data.tags,
        kb_status: 'pending',
        kb_error: '',
      });
      syncToKnowledgeBase({ ...editing, ...data, id: editing.id });
      refreshAll();
      return;
    }

    const { provider } = await readUploadSettings();
    const files = Array.isArray(data.mediaFiles) ? data.mediaFiles : [];
    for (const file of files) {
      const type = getMediaType(file);
      const cloudUrl = await uploadToCloud(file.uploadedPath, provider, file.name);
      const duration = await getMediaDuration(file);
      const id = await dbq.add({
        title: files.length > 1 ? `${data.title}-${file.name}` : data.title,
        type,
        media_url: file.uploadedHttpPath || file.uploadedUrl || '',
        oss_url: cloudUrl,
        duration,
        tags: data.tags,
        status: 'transcribing',
        kb_status: 'pending',
      });
      runTranscribe(id, cloudUrl, files.length > 1 ? `${data.title}-${file.name}` : data.title, type);
    }
    refreshAll();
  };

  const handleDelete = async (item) => {
    try {
      if (item.kb_file_id) {
        await deleteCopywritingKnowledgeBaseFile(item.kb_file_id);
      }
    } finally {
      await dbq.remove(item.id);
      refreshAll();
    }
  };

  const handleCopy = async (item) => {
    const text = item.type === 'text' ? (item.content || '') : (item.transcription || '');
    await navigator.clipboard.writeText(text || '');
  };

  const handleAddToReference = (item) => {
    setReferenceDialogItemId(String(item.id));
    setReferenceDialogOpen(true);
  };

  const saveGroups = useCallback(async (nextGroups) => {
    const groups = uniqById(nextGroups);
    setReferenceGroups(groups);
    await saveReferenceGroups(groups);
    if (!selectedGroupId && groups[0]) setSelectedGroupId(groups[0].id);
  }, [selectedGroupId]);

  useEffect(() => {
    const selectedGroup = referenceGroups.find((group) => group.id === selectedGroupId);
    if (!selectedGroup) {
      setReferenceItems([]);
      return;
    }
    const items = selectedGroup.itemIds
      .map((id) => dbq.items.find((item) => String(item.id) === String(id)))
      .filter(Boolean)
      .map((item) => toRefItem(item, selectedGroup.id));
    setReferenceItems(items);
  }, [referenceGroups, selectedGroupId, dbq.items]);

  const openAgentPicker = useCallback(async () => {
    const saved = await window.AgentSpaces.openAgentEditor({
      initialName: creationAgentMeta?.name || '创作 Agent',
      initialPrompt: '你是一个文案创作助手。',
      agentId: creationAgentMeta?.id || undefined,
    });
    if (!saved) return;
    setCreationAgentMeta({ id: saved.id, name: saved.name || '创作 Agent', modelProvider: saved.modelProvider });
    saveAgentConfig({ configId: saved.id, name: saved.name || '创作 Agent' });
  }, [creationAgentMeta]);

  function stripThink(text) {
    return String(text || '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<think>[\s\S]*$/gi, '')
      .trim();
  }

  const cancelCreation = () => {
    cancelCreationRef.current = true;
    setCreationRunning(false);
  };

  const runCreation = async () => {
    const group = referenceGroups.find((item) => item.id === selectedGroupId);
    if (!group || !creationAgentMeta?.id) return;
    const refs = group.itemIds
      .map((id) => dbq.items.find((item) => String(item.id) === String(id)))
      .filter(Boolean)
      .map((item) => `标题：${item.title}\n内容：${item.type === 'text' ? item.content : item.transcription}`)
      .join('\n\n');
    const requirement = creationInput.trim();
    const basePrompt = [
      `参考文案分组：${group.name}`,
      '参考内容：',
      refs || '无',
      '',
      requirement
        ? `创作要求：\n${requirement}`
        : '创作要求：无（请基于上述参考内容自由创作 1 篇风格相近的文案）',
      '',
      '请只生成 1 篇文案。直接输出文案正文，不要输出编号、标题、解释或 <think> 内容。',
    ].join('\n');

    cancelCreationRef.current = false;
    setCreationRunning(true);
    setCreationResults([]);
    try {
      for (let index = 0; index < creationOutputCount; index++) {
        if (cancelCreationRef.current) break;
        const taskId = `copywriting-${Date.now()}-${index}`;
        const prompt = `${basePrompt}\n\n本次生成第 ${index + 1} 篇，请和前面批次保持差异。`;
        const resp = await window.AgentSpaces.callPluginTool(
          BUILTIN_PLUGIN,
          'agent_run',
          {
            agentConfigId: creationAgentMeta.id,
            prompt,
            permissionMode: 'bypassPermissions',
          },
          { taskId, meta: { mode: 'copywriting-create', groupId: group.id, batch: index + 1 } },
        );
        if (cancelCreationRef.current) break;
        const text = stripThink(resp?.result?.result || resp?.result || '');
        if (text) {
          setCreationResults((prev) => [...prev, { id: taskId, text }]);
        }
      }
    } finally {
      setCreationRunning(false);
    }
  };

  // 生成结果持久化到用户 localStorage（per-project），下次打开自动恢复
  useEffect(() => {
    try { saveUserSettings({ creationResults }); } catch { /* noop */ }
  }, [creationResults]);

  const clearFilter = () => setFilter({ ...DEFAULT_FILTER });

  const currentGroup = referenceGroups.find((group) => group.id === selectedGroupId) || null;

  return (
    <main className="min-h-full bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl p-4">
        <Toolbar
          total={dbq.total}
          onNew={openNew}
          onOpenSettings={() => setSettingsOpen(true)}
          filter={filter}
          onFilterChange={setFilter}
          onClearFilter={clearFilter}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />

        {viewMode === 'manage' ? (
          <>
            {/* mini-app 在宿主 document 内直接渲染，不走 Tailwind JIT 扫描，
                任意值 / 响应式 class 不会被编译，故用内联 <style> 定义滚动容器与两列瀑布流 */}
            <style>{`
              .cw-scroll{max-height:calc(100vh - 125px);overflow-y:auto;padding-right:.25rem}
              .cw-grid{column-count:1;column-gap:.75rem}
              .cw-grid>*{break-inside:avoid}
              @media(min-width:640px){.cw-grid{column-count:2}}
            `}</style>
            <div className="mt-4 cw-scroll">
            {!dbq.ready ? (
              <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
            ) : dbq.error ? (
              <div className="py-16 text-center text-sm text-destructive">数据库初始化失败：{dbq.error}</div>
            ) : dbq.items.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-2 text-center">
                <FileText className="size-10 text-muted-foreground" />
                <p className="text-sm font-medium">暂无文案</p>
                <p className="text-xs text-muted-foreground">点击「新建文案」开始</p>
              </div>
            ) : (
              <div className="cw-grid">
                {dbq.items.map((it) => (
                  <CopywritingCard
                    key={it.id}
                    item={it}
                    onEdit={openEdit}
                    onPlay={setPlaying}
                    onRetry={(item) => item.oss_url && runTranscribe(item.id, item.oss_url, item.title, item.type)}
                    onDelete={handleDelete}
                    onCopy={handleCopy}
                    onAddToReference={handleAddToReference}
                  />
                ))}
              </div>
            )}
          </div>
          </>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <CreationPanel
              referenceGroups={referenceGroups}
              selectedGroupId={selectedGroupId}
              onSelectedGroupIdChange={setSelectedGroupId}
              creationAgentMeta={creationAgentMeta}
              creationAgentLabel={creationAgentMeta?.name || ''}
              onPickAgent={openAgentPicker}
              creationInput={creationInput}
              onCreationInputChange={setCreationInput}
              creationOutputCount={creationOutputCount}
              onCreationOutputCountChange={setCreationOutputCount}
              creationGroupIds={currentGroup ? [currentGroup.id] : []}
              referenceItems={referenceItems}
              onRunCreation={runCreation}
              onCancelCreation={cancelCreation}
              onOpenGroupDialog={() => { setReferenceDialogItemId(''); setReferenceDialogOpen(true); }}
              creationRunning={creationRunning}
            />
            <div className="flex flex-col rounded-lg border bg-card p-3" style={{ maxHeight: 'calc(100vh - 125px)', overflowY: 'scroll' }}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">结果卡片列表</div>
                {creationRunning && <Badge variant="secondary">生成中</Badge>}
              </div>
              <div className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2" style={{ minHeight: 0 }}>
                {creationResults.length === 0 && !creationRunning ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">暂无结果</div>
                ) : (
                  <>
                    {creationResults.map((item) => {
                      const color = softColorFromSeed(item.id);
                      return (
                        <div
                          key={item.id}
                          className="rounded-md border p-3"
                          style={{ backgroundColor: color.bg, borderColor: color.border }}
                        >
                          <div className="whitespace-pre-wrap text-sm text-foreground">{item.text}</div>
                          <div className="mt-2 flex items-center justify-between">
                            <span className="size-2 rounded-full" style={{ backgroundColor: color.dot }} />
                            <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(item.text)}>
                              复制文案
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    {creationRunning &&
                      Array.from({ length: Math.max(0, creationOutputCount - creationResults.length) }).map((_, i) => (
                        <CreationSkeletonCard key={`skeleton-${creationResults.length + i}`} />
                      ))}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <CopywritingForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
      />
      <PlayerDialog item={playing} onClose={() => setPlaying(null)} />
      <UploadSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        unindexedCount={unindexedCount}
        onScanUnindexed={handleScanUnindexed}
      />
      <ReferenceGroupsDialog
        open={referenceDialogOpen}
        onOpenChange={setReferenceDialogOpen}
        groups={referenceGroups}
        currentItemId={referenceDialogItemId}
        onSaveGroups={saveGroups}
      />
    </main>
  );
}
