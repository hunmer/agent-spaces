import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Toolbar from './components/Toolbar';
import CreationPanel from './components/CreationPanel';
import CopywritingCard from './components/CopywritingCard';
import CopywritingForm from './components/CopywritingForm';
import PlayerDialog from './components/PlayerDialog';
import UploadSettingsDialog from './components/UploadSettingsDialog';
import ImportJsonDialog from './components/ImportJsonDialog';
import ReferenceGroupsDialog from './components/ReferenceGroupsDialog';
import { useCopywritingDb } from './hooks/useCopywritingDb';
import { useSettings } from './hooks/useSettings';
import { recognize, getMediaDuration, genTaskId, getMediaType } from './utils/transcribe';
import { uploadToCloud, readUploadSettings } from './utils/upload';
import { addCopywritingToKnowledgeBase, queryCopywritingKnowledgeBase, deleteCopywritingKnowledgeBaseFile } from './utils/knowledge-base';
import { loadReferenceGroups, saveReferenceGroups, makeGroupId, toRefItem } from './utils/reference-list';
import { loadAgentConfig, saveAgentConfig } from './utils/agent-config';
import { DEFAULT_FILTER, PAGE_SIZE, pageWindow, uniqById } from './utils/list';
import { softColorFromSeed } from './utils/colors';
import { BUILTIN_PLUGIN, stripThink, normalizeKnowledgeBaseMatches, knowledgeMatchToPromptText } from './utils/creation';
import CreationSkeletonCard from './components/CreationSkeletonCard';

const { FileText, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Slider, Badge, Trash2, ChevronLeft, ChevronRight, Masonry } = window.AgentSpacesUI;

const { getUserSetting, saveUserSettings } = window.AgentSpaces;

export default function App() {
  const dbq = useCopywritingDb();
  const { settings, ready: settingsReady, update: updateSettings } = useSettings();

  const [filter, setFilter] = useState(DEFAULT_FILTER);
  const filterRef = useRef(DEFAULT_FILTER);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [unindexedCount, setUnindexedCount] = useState(0);
  const [viewMode, setViewMode] = useState('manage');
  const [creationSourceMode, setCreationSourceMode] = useState('group');
  const [page, setPage] = useState(1);
  const listRef = useRef(null);
  const [colCount, setColCount] = useState(4);

  const [referenceGroups, setReferenceGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [referenceDialogOpen, setReferenceDialogOpen] = useState(false);
  const [referenceDialogItemId, setReferenceDialogItemId] = useState('');
  const [referenceItems, setReferenceItems] = useState([]);

  // 瀑布流卡片展开/折叠（受控）：展开态占更大格子高度，点击卡片在两档尺寸间切换
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const toggleExpand = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const [creationAgentMeta, setCreationAgentMeta] = useState(null);
  const [creationInput, setCreationInput] = useState('');
  const [creationOutputCount, setCreationOutputCount] = useState(3);
  const [creationRunning, setCreationRunning] = useState(false);
  const [creationResults, setCreationResults] = useState(() => {
    try { return getUserSetting('creationResults', []) || []; } catch { return []; }
  });
  const cancelCreationRef = useRef(false);

  const handleFilterChange = useCallback((nextFilter) => {
    const normalized = { ...DEFAULT_FILTER, ...(nextFilter || {}) };
    filterRef.current = normalized;
    setFilter(normalized);
  }, []);

  const refreshAll = useCallback(() => {
    dbq.refresh(filterRef.current);
    dbq.refreshTags();
    dbq.count();
  }, [dbq]);

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
    handleFilterChange({
      keyword: settings.keyword || '',
      type: settings.type || '',
      tag: settings.tag || '',
      durationSort: settings.durationSort || '',
    });
    setViewMode(settings.viewMode || 'manage');
    setSelectedGroupId(settings.creationGroupId || '');
    setCreationOutputCount(settings.creationOutputCount || 3);
  }, [settingsReady, handleFilterChange]);

  useEffect(() => {
    if (!dbq.ready) return;
    filterRef.current = filter;
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
        dbq.refresh(filterRef.current);
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
  }, [dbq]);

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

  const handleImport = useCallback(async (data) => {
    await dbq.add(data);
  }, [dbq]);

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

  const removeReferenceItem = useCallback((itemId) => {
    if (!selectedGroupId) return;
    saveGroups(referenceGroups.map((group) =>
      group.id === selectedGroupId
        ? { ...group, itemIds: group.itemIds.filter((id) => String(id) !== String(itemId)) }
        : group,
    ));
  }, [referenceGroups, selectedGroupId, saveGroups]);

  const clearReferenceItems = useCallback(() => {
    if (!selectedGroupId) return;
    saveGroups(referenceGroups.map((group) =>
      group.id === selectedGroupId ? { ...group, itemIds: [] } : group,
    ));
  }, [referenceGroups, selectedGroupId, saveGroups]);

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

  const cancelCreation = () => {
    cancelCreationRef.current = true;
    setCreationRunning(false);
  };

  const runCreation = async () => {
    const group = referenceGroups.find((item) => item.id === selectedGroupId);
    if (!creationAgentMeta?.id) return;
    if (creationSourceMode === 'group' && !group) return;
    cancelCreationRef.current = false;
    setCreationRunning(true);
    setCreationResults([]);
    try {
      const requirement = creationInput.trim();
      let referenceTitle = group ? `参考文案分组：${group.name}` : '参考来源：知识库';
      let refs = '';

      if (creationSourceMode === 'knowledge') {
        const kbResult = await queryCopywritingKnowledgeBase(requirement || '文案创作参考', 8);
        const matches = normalizeKnowledgeBaseMatches(kbResult);
        referenceTitle = '参考来源：知识库检索结果';
        refs = matches.map(knowledgeMatchToPromptText).filter(Boolean).join('\n\n');
      } else {
        refs = group.itemIds
          .map((id) => dbq.items.find((item) => String(item.id) === String(id)))
          .filter(Boolean)
          .map((item) => `标题：${item.title}\n内容：${item.type === 'text' ? item.content : item.transcription}`)
          .join('\n\n');
      }

      const basePrompt = [
        referenceTitle,
        '参考内容：',
        refs || '无',
        '',
        requirement
          ? `创作要求：\n${requirement}`
          : '创作要求：无（请基于上述参考内容自由创作 1 篇风格相近的文案）',
        '',
        '请只生成 1 篇文案。直接输出文案正文，不要输出编号、标题、解释或 <think> 内容。',
      ].join('\n');

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
          { taskId, meta: { mode: 'copywriting-create', sourceMode: creationSourceMode, groupId: group?.id || '', batch: index + 1 } },
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

  // 分页：每页 PAGE_SIZE 条，列表在前端切片；筛选条件变化时回到第 1 页
  useEffect(() => { setPage(1); }, [filter.keyword, filter.type, filter.tag, filter.durationSort]);
  const totalPages = Math.max(1, Math.ceil(dbq.items.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = useMemo(
    () => dbq.items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [dbq.items, currentPage],
  );
  const gotoPage = useCallback((next) => {
    setPage(next);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, []);

  // 容器宽度 → 列数（与 Masonry 断点一致），用于判断「最后一列」
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const resolve = (w) => (w >= 1024 ? 4 : w >= 768 ? 3 : w >= 640 ? 2 : 1);
    const update = () => {
      const n = resolve(el.clientWidth);
      setColCount((prev) => (prev === n ? prev : n));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 瀑布流布局元信息：折叠 1×1；展开 2×2，但最后一列展开降级为 2×1（纵向 2 行不跨列，避免换行）
  const getMeta = useCallback((item, index) => {
    if (!expandedIds.has(String(item.id))) return { colSpan: 1, rowSpan: 1 };
    if (colCount > 1 && index % colCount === colCount - 1) return { colSpan: 1, rowSpan: 2 };
    return { colSpan: 2, rowSpan: 2 };
  }, [expandedIds, colCount]);

  const renderCard = (item) => (
    <CopywritingCard
      item={item}
      expanded={expandedIds.has(String(item.id))}
      onToggleExpand={toggleExpand}
      onEdit={openEdit}
      onPlay={setPlaying}
      onRetry={(it) => it.oss_url && runTranscribe(it.id, it.oss_url, it.title, it.type)}
      onDelete={handleDelete}
      onCopy={handleCopy}
      onAddToReference={handleAddToReference}
    />
  );

  // 创作结果瀑布流：结果卡 + 生成中骨架合并为统一 data
  const resultList = useMemo(() => {
    const skeletons = creationRunning
      ? Array.from({ length: Math.max(0, creationOutputCount - creationResults.length) }, (_, i) => ({
          id: `__skeleton_${creationResults.length + i}`,
          __skeleton: true,
        }))
      : [];
    return [...creationResults, ...skeletons];
  }, [creationResults, creationRunning, creationOutputCount]);

  const renderResult = (item) => {
    if (item.__skeleton) return <CreationSkeletonCard />;
    const color = softColorFromSeed(item.id);
    return (
      <div className="flex h-full w-full flex-col rounded-md border p-3" style={{ backgroundColor: color.bg, borderColor: color.border }}>
        <div className="flex-1 min-h-0 whitespace-pre-wrap text-sm text-foreground" style={{ overflowY: 'auto', paddingRight: '0.25rem' }}>
          {item.text}
        </div>
        <div className="mt-2 flex items-center justify-between shrink-0">
          <span className="size-2 rounded-full" style={{ backgroundColor: color.dot }} />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(item.text)}>
              复制文案
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreationResults((prev) => prev.filter((r) => r.id !== item.id))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // 结果卡高度按文本长度估算（每行约 24 字），长文案更高，超出格子可滚动
  const getResultMeta = useCallback((item) => {
    if (item.__skeleton) return { height: 200 };
    const lines = Math.ceil((item.text || '').length / 24);
    return { height: Math.max(180, Math.min(560, lines * 22 + 96)) };
  }, []);

  const clearFilter = () => {
    handleFilterChange(DEFAULT_FILTER);
    dbq.refresh(DEFAULT_FILTER);
  };

  const currentGroup = referenceGroups.find((group) => group.id === selectedGroupId) || null;

  return (
    <main className="min-h-full bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl p-4">
        <Toolbar
          total={dbq.total}
          onNew={openNew}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenImport={() => setImportOpen(true)}
          filter={filter}
          onFilterChange={handleFilterChange}
          onClearFilter={clearFilter}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />

        {viewMode === 'manage' ? (
          <>
            {/* mini-app 在宿主 document 内直接渲染，不走 Tailwind JIT 扫描，
                任意值 / 响应式 class 不会被编译，故用内联 <style> 定义滚动容器样式 */}
            <style>{`
              .cw-scroll{max-height:calc(100vh - 125px);overflow-y:auto;padding-right:.25rem}
            `}</style>
            <div className="mt-4 cw-scroll" ref={listRef} style={totalPages > 1 ? { maxHeight: 'calc(100vh - 160px)' } : undefined}>
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
              <Masonry
                data={pagedItems}
                renderItem={renderCard}
                getKey={(it) => it.id}
                getMeta={getMeta}
                columns={{ base: 1, sm: 2, md: 3, lg: 4 }}
                gap={12}
                rowHeight={240}
                enterAnimation={false}
                exitAnimation={false}
                scrollContainerRef={listRef}
              />
            )}
          </div>
          {totalPages > 1 && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1 text-sm">
              <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => gotoPage(currentPage - 1)}>
                <ChevronLeft className="size-4" />上一页
              </Button>
              {pageWindow(currentPage, totalPages).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={p === currentPage ? 'default' : 'outline'}
                  onClick={() => gotoPage(p)}
                >
                  {p}
                </Button>
              ))}
              <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => gotoPage(currentPage + 1)}>
                下一页<ChevronRight className="size-4" />
              </Button>
              <span className="ml-2 text-xs text-muted-foreground">
                第 {currentPage}/{totalPages} 页 · 共 {dbq.items.length} 条
              </span>
            </div>
          )}
          </>
        ) : (
          <div className="mt-4" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr)', gap: '0.75rem',  height: 'calc(100vh - 125px)', overflowY: 'auto' }}>
            <CreationPanel
              referenceGroups={referenceGroups}
              selectedGroupId={selectedGroupId}
              onSelectedGroupIdChange={setSelectedGroupId}
              sourceMode={creationSourceMode}
              onSourceModeChange={setCreationSourceMode}
              creationAgentMeta={creationAgentMeta}
              creationAgentLabel={creationAgentMeta?.name || ''}
              onPickAgent={openAgentPicker}
              creationInput={creationInput}
              onCreationInputChange={setCreationInput}
              creationOutputCount={creationOutputCount}
              onCreationOutputCountChange={setCreationOutputCount}
              creationGroupIds={currentGroup ? [currentGroup.id] : []}
              referenceItems={referenceItems}
              onRemoveReferenceItem={removeReferenceItem}
              onClearReferenceItems={clearReferenceItems}
              onRunCreation={runCreation}
              onCancelCreation={cancelCreation}
              onOpenGroupDialog={() => { setReferenceDialogItemId(''); setReferenceDialogOpen(true); }}
              creationRunning={creationRunning}
            />
            <div className="flex flex-col rounded-lg border bg-card p-3" style={{ maxHeight: 'calc(100vh - 125px)', overflowY: 'auto' }}>
              <div className="flex items-center justify-between gap-2 shrink-0">
                <div className="text-sm font-medium">结果卡片列表</div>
                <div className="flex items-center gap-2">
                  {creationRunning && <Badge variant="secondary">生成中</Badge>}
                  {!creationRunning && creationResults.length > 0 && (
                    <Button size="sm" variant="outline" onClick={() => setCreationResults([])}>
                      <Trash2 className="size-4" />清空
                    </Button>
                  )}
                </div>
              </div>
              {resultList.length === 0 ? (
                <div className="mt-3 rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
                  暂无结果
                </div>
              ) : (
                <div className="mt-3 min-h-0 flex-1">
                  <Masonry
                    data={resultList}
                    renderItem={renderResult}
                    getKey={(it) => it.id}
                    getMeta={getResultMeta}
                    columns={{ base: 1, sm: 2, xl: 3 }}
                    gap={8}
                    enterAnimation={false}
                    exitAnimation={false}
                  />
                </div>
              )}
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
      <ImportJsonDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={handleImport}
        onImported={refreshAll}
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
