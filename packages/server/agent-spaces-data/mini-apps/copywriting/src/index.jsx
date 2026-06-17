import { useCallback, useEffect, useMemo, useState } from 'react';
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

const { FileText, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Slider, Badge } = window.AgentSpacesUI;

const BUILTIN_PLUGIN = '@agent-spaces/builtin';

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

export default function App() {
  const dbq = useCopywritingDb();
  const { settings, ready: settingsReady, update: updateSettings } = useSettings();

  const [filter, setFilter] = useState(DEFAULT_FILTER);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const [creationResults, setCreationResults] = useState([]);

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
    if (settings.creationAgentConfigId) {
      setCreationAgentMeta({
        id: settings.creationAgentConfigId,
        name: settings.creationAgentConfigId,
      });
    }
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
      creationAgentConfigId: creationAgentMeta?.id || '',
      creationOutputCount,
    });
  }, [dbq.ready, filter.keyword, filter.type, filter.tag, filter.durationSort, viewMode, selectedGroupId, creationAgentMeta, creationOutputCount]);

  useEffect(() => {
    const unsub = window.AgentSpaces.onTaskEvent((event) => {
      if (event === 'miniApp.taskFinished' || event === 'miniApp.taskFailed') {
        dbq.refresh(filter);
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
    const isMedia = data.type === 'audio' || data.type === 'video';
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

    if (!isMedia) {
      const id = await dbq.add({
        title: data.title,
        type: 'text',
        content: data.content,
        tags: data.tags,
        status: 'done',
        kb_status: 'pending',
      });
      syncToKnowledgeBase({ id, title: data.title, type: 'text', content: data.content });
      refreshAll();
      return;
    }

    const { provider } = await readUploadSettings();
    const cloudUrl = await uploadToCloud(data.uploadedPath, provider, data.mediaFile?.name);
    const duration = await getMediaDuration(data.mediaFile);
    const id = await dbq.add({
      title: data.title,
      type: data.type,
      media_url: data.uploadedHttpPath || '',
      oss_url: cloudUrl,
      duration,
      tags: data.tags,
      status: 'transcribing',
      kb_status: 'pending',
    });
    refreshAll();
    runTranscribe(id, cloudUrl, data.title, data.type);
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
    updateSettings({ creationAgentConfigId: saved.id });
  }, [creationAgentMeta, updateSettings]);

  const runCreation = async () => {
    const group = referenceGroups.find((item) => item.id === selectedGroupId);
    if (!group || !creationAgentMeta?.id) return;
    const refs = group.itemIds
      .map((id) => dbq.items.find((item) => String(item.id) === String(id)))
      .filter(Boolean)
      .map((item) => `标题：${item.title}\n内容：${item.type === 'text' ? item.content : item.transcription}`)
      .join('\n\n');
    const prompt = [
      `参考文案分组：${group.name}`,
      '参考内容：',
      refs || '无',
      '',
      '创作要求：',
      creationInput.trim(),
      '',
      `输出数量：${creationOutputCount}`,
      '请直接输出多条文案，每条独立成段。',
    ].join('\n');

    setCreationRunning(true);
    setCreationResults([]);
    try {
      const taskId = `copywriting-${Date.now()}`;
      const resp = await window.AgentSpaces.callPluginTool(
        BUILTIN_PLUGIN,
        'agent_run',
        {
          agentConfigId: creationAgentMeta.id,
          prompt,
          permissionMode: 'bypassPermissions',
        },
        { taskId, meta: { mode: 'copywriting-create', groupId: group.id } },
      );
      const text = resp?.result?.result || resp?.result || '';
      const lines = String(text).split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, creationOutputCount);
      setCreationResults(lines.map((line, index) => ({ id: `${taskId}-${index}`, text: line })));
    } finally {
      setCreationRunning(false);
    }
  };

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
          <div className="mt-4">
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
              <div className="columns-1 sm:columns-2 xl:columns-3 gap-3">
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
        ) : (
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
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
              onOpenGroupDialog={() => setReferenceDialogOpen(true)}
            />
            <div className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">结果卡片列表</div>
                {creationRunning && <Badge variant="secondary">生成中</Badge>}
              </div>
              <div className="mt-3 grid gap-2">
                {creationResults.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">暂无结果</div>
                ) : creationResults.map((item) => (
                  <div key={item.id} className="rounded-md border bg-background p-3">
                    <div className="whitespace-pre-wrap text-sm">{item.text}</div>
                    <div className="mt-2 flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(item.text)}>
                        复制文案
                      </Button>
                    </div>
                  </div>
                ))}
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
      <UploadSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ReferenceGroupsDialog
        open={referenceDialogOpen}
        onOpenChange={setReferenceDialogOpen}
        groups={referenceGroups}
        items={dbq.items}
        currentItemId={referenceDialogItemId}
        onSaveGroups={saveGroups}
      />
    </main>
  );
}
