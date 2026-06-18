import { useState } from 'react';
const { Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } = window.AgentSpacesUI;
const { FileAudio, FileVideo, FileText, Play, RefreshCw, Loader2, Database, MoreHorizontal, Copy, Trash2, PlusCircle, Pencil } = window.AgentSpacesUI;

const TYPE_META = {
  audio: { label: '音频', Icon: FileAudio },
  video: { label: '视频', Icon: FileVideo },
  text: { label: '文本', Icon: FileText },
};

const KB_STATUS = {
  indexed: { label: '已入库', className: 'border-emerald-500/40 text-emerald-600' },
  indexing: { label: '入库中', className: 'border-blue-500/40 text-blue-600' },
  pending: { label: '待入库', className: 'border-muted-foreground/30 text-muted-foreground' },
  failed: { label: '入库失败', className: 'border-destructive/40 text-destructive' },
};

function previewText(item) {
  return item.type === 'text' ? (item.content || '') : (item.transcription || '');
}

function fmtDate(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleString('zh-CN'); } catch { return ''; }
}

export default function CopywritingCard({
  item,
  onEdit,
  onPlay,
  onRetry,
  onDelete,
  onCopy,
  onAddToReference,
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = TYPE_META[item.type] || TYPE_META.text;
  const kb = KB_STATUS[item.kb_status || 'pending'] || KB_STATUS.pending;
  const { Icon } = meta;
  const isMedia = item.type === 'audio' || item.type === 'video';
  const transcribing = item.status === 'transcribing';
  const failed = item.status === 'failed';
  const tags = String(item.tags || '').split(',').map((s) => s.trim()).filter(Boolean);
  const preview = previewText(item);

  return (
    <div
      className={`break-inside-avoid mb-3 rounded-lg border bg-card text-card-foreground p-3 cursor-pointer hover:border-primary/50 transition-colors ${expanded ? 'border-primary ring-1 ring-primary/30' : ''}`}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="font-medium truncate">{item.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="shrink-0">{meta.label}</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => onEdit(item)}>
                <Pencil className="size-4" />编辑
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCopy(item)}>
                <Copy className="size-4" />复制文案
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddToReference(item)}>
                <PlusCircle className="size-4" />添加到参考列表
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => onDelete(item)}>
                <Trash2 className="size-4" />删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div
        className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap"
        style={
          expanded
            ? undefined
            : { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 10, overflow: 'hidden' }
        }
      >
        {transcribing ? (
          <span className="flex items-center gap-1.5 text-primary">
            <Loader2 className="size-3.5 animate-spin" /> 转写中...
          </span>
        ) : failed ? (
          <span className="text-destructive">转写失败，可重试</span>
        ) : preview ? preview : <span className="opacity-60">（无内容）</span>}
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        <Badge variant="outline" className={`text-xs gap-1 ${kb.className}`} title={item.kb_error || ''}>
          <Database className="size-3" />{kb.label}
        </Badge>
        {tags.map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
      </div>

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
