const { Badge, Button } = window.AgentSpacesUI;
const { FileAudio, FileVideo, FileText, Play, RefreshCw, Loader2 } = window.AgentSpacesUI;

const TYPE_META = {
  audio: { label: '音频', Icon: FileAudio },
  video: { label: '视频', Icon: FileVideo },
  text: { label: '文本', Icon: FileText },
};

function previewText(item) {
  return item.type === 'text' ? (item.content || '') : (item.transcription || '');
}

function fmtDate(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleString('zh-CN'); } catch { return ''; }
}

export default function CopywritingCard({ item, onEdit, onPlay, onRetry }) {
  const meta = TYPE_META[item.type] || TYPE_META.text;
  const { Icon } = meta;
  const isMedia = item.type === 'audio' || item.type === 'video';
  const transcribing = item.status === 'transcribing';
  const failed = item.status === 'failed';
  const tags = String(item.tags || '').split(',').map((s) => s.trim()).filter(Boolean);
  const preview = previewText(item);

  return (
    <div
      className="break-inside-avoid mb-3 rounded-lg border bg-card text-card-foreground p-3 cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => onEdit(item)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="font-medium truncate">{item.title}</span>
        </div>
        <Badge variant="secondary" className="shrink-0">{meta.label}</Badge>
      </div>

      <div className="mt-2 text-sm text-muted-foreground line-clamp-5 whitespace-pre-wrap">
        {transcribing ? (
          <span className="flex items-center gap-1.5 text-primary">
            <Loader2 className="size-3.5 animate-spin" /> 转写中…
          </span>
        ) : failed ? (
          <span className="text-destructive">转写失败，可重试</span>
        ) : preview ? preview : <span className="opacity-60">（无内容）</span>}
      </div>

      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{fmtDate(item.created_at)}</span>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {isMedia && item.media_url && !transcribing && (
            <Button size="sm" variant="ghost" onClick={() => onPlay(item)}>
              <Play className="size-3.5" />播放
            </Button>
          )}
          {failed && (
            <Button size="sm" variant="ghost" onClick={() => onRetry(item)}>
              <RefreshCw className="size-3.5" />重试
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
