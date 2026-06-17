import { useCallback, useEffect, useState } from 'react';
import Toolbar from './components/Toolbar';
import CopywritingCard from './components/CopywritingCard';
import FilterSidebar from './components/FilterSidebar';
import CopywritingForm from './components/CopywritingForm';
import PlayerDialog from './components/PlayerDialog';
import UploadSettingsDialog from './components/UploadSettingsDialog';
import { useCopywritingDb } from './hooks/useCopywritingDb';
import { useSettings } from './hooks/useSettings';
import { recognize, getMediaDuration, genTaskId } from './utils/transcribe';
import { uploadToCloud, readUploadSettings } from './utils/upload';
import { addCopywritingToKnowledgeBase, queryCopywritingKnowledgeBase } from './utils/knowledge-base';

const { FileText } = window.AgentSpacesUI;

const DEFAULT_FILTER = { keyword: '', type: '', tag: '', durationSort: '' };

export default function App() {
  const dbq = useCopywritingDb();
  const { settings, ready: settingsReady, update: updateSettings } = useSettings();
  const [filter, setFilter] = useState(DEFAULT_FILTER);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [kbQuery, setKbQuery] = useState('');
  const [kbResults, setKbResults] = useState([]);
  const [kbBusy, setKbBusy] = useState(false);
  const [kbError, setKbError] = useState('');

  useEffect(() => {
    if (!settingsReady) return;
    setFilter({
      keyword: settings.keyword || '',
      type: settings.type || '',
      tag: settings.tag || '',
      durationSort: settings.durationSort || '',
    });
  }, [settingsReady]);

  const refreshAll = useCallback(() => {
    dbq.refresh(filter);
    dbq.refreshTags();
    dbq.count();
  }, [dbq, filter]);

  useEffect(() => {
    if (!dbq.ready) return;
    dbq.refresh(filter);
    updateSettings({
      keyword: filter.keyword,
      type: filter.type,
      tag: filter.tag,
      durationSort: filter.durationSort,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbq.ready, filter.keyword, filter.type, filter.tag, filter.durationSort]);

  useEffect(() => {
    const unsub = window.AgentSpaces.onTaskEvent((event) => {
      if (event === 'miniApp.taskFinished' || event === 'miniApp.taskFailed') {
        dbq.refresh(filter);
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const runKbQuery = async () => {
    const query = kbQuery.trim();
    if (!query) return;
    setKbBusy(true);
    setKbError('');
    try {
      const result = await queryCopywritingKnowledgeBase(query, 5);
      setKbResults(result?.matches || []);
    } catch (error) {
      setKbResults([]);
      setKbError(error instanceof Error ? error.message : String(error));
    } finally {
      setKbBusy(false);
    }
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
    await dbq.remove(item.id);
    refreshAll();
  };

  const handleRetry = (item) => {
    if (!item.oss_url) return;
    runTranscribe(item.id, item.oss_url, item.title, item.type);
  };

  const clearFilter = () => setFilter({ ...DEFAULT_FILTER });

  return (
    <main className="min-h-full bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl p-4">
        <Toolbar
          total={dbq.total}
          onNew={openNew}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <div className="mt-4 flex flex-col lg:flex-row gap-4 items-start">
          <div className="flex-1 min-w-0">
            <section className="mb-4 rounded-lg border bg-card p-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={kbQuery}
                  onChange={(e) => setKbQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') runKbQuery(); }}
                  placeholder="输入文本查询知识库"
                  className="h-9 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={runKbQuery}
                  disabled={kbBusy || !kbQuery.trim()}
                  className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50"
                >
                  {kbBusy ? '查询中...' : '查询知识库'}
                </button>
              </div>
              {kbError && <p className="mt-2 text-xs text-destructive">{kbError}</p>}
              {kbResults.length > 0 && (
                <div className="mt-3 space-y-2">
                  {kbResults.map((match, index) => (
                    <div key={`${match.fileId}-${match.chunkIndex}-${index}`} className="rounded-md border bg-background p-2">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium truncate">{match.fileName}</span>
                        <span className="text-muted-foreground">score {Number(match.score || 0).toFixed(3)}</span>
                      </div>
                      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{match.chunkText}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

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
                    onRetry={handleRetry}
                  />
                ))}
              </div>
            )}
          </div>

          <FilterSidebar filter={filter} onChange={setFilter} tags={dbq.tags} onClear={clearFilter} />
        </div>
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
    </main>
  );
}
