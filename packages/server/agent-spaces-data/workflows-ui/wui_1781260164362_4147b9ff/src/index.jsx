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

  // 恢复上次筛选
  useEffect(() => {
    if (!settingsReady) return;
    setFilter({
      keyword: settings.keyword || '',
      type: settings.type || '',
      tag: settings.tag || '',
      durationSort: settings.durationSort || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsReady]);

  const refreshAll = useCallback(() => {
    dbq.refresh(filter);
    dbq.refreshTags();
    dbq.count();
  }, [dbq, filter]);

  // filter 变化 → 刷新列表 + 持久化偏好
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

  // 跨标签 / 刷新恢复：他方完成转写时刷新本端视图
  useEffect(() => {
    const unsub = window.AgentSpaces.onTaskEvent((event) => {
      if (event === 'workflowUi.taskFinished' || event === 'workflowUi.taskFailed') {
        dbq.refresh(filter);
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbq, filter]);

  const openNew = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (item) => { setEditing(item); setFormOpen(true); };

  // 后台转写：不阻塞调用方；完成 / 失败落库后刷新
  const runTranscribe = (id, cloudUrl, title) => {
    const taskId = genTaskId('asr');
    dbq.update(id, { status: 'transcribing' }).then(refreshAll);
    recognize(cloudUrl, { taskId, meta: { id, title } })
      .then((text) => dbq.update(id, { transcription: text, status: 'done' }))
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
      });
      refreshAll();
      return;
    }
    if (!isMedia) {
      await dbq.add({ title: data.title, type: 'text', content: data.content, tags: data.tags, status: 'done' });
      refreshAll();
      return;
    }
    // 音视频：FileUpload 已落盘 → 按存储设置转存云 → 落库(transcribing) → 后台 ASR
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
    });
    refreshAll();
    runTranscribe(id, cloudUrl, data.title);
  };

  const handleDelete = async (item) => {
    await dbq.remove(item.id);
    refreshAll();
  };

  const handleRetry = (item) => {
    if (!item.oss_url) return;
    runTranscribe(item.id, item.oss_url, item.title);
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
            {!dbq.ready ? (
              <div className="py-16 text-center text-sm text-muted-foreground">加载中…</div>
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
