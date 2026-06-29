// 单张贴图卡片：缩略图 + 风格标签 + 时间 + 操作按钮（含一键拆分）
const { Button, Badge, Download, Trash2, ExternalLink, Maximize2, Scissors, Loader2 } = window.AgentSpacesUI;

export default function StickerCard({ item, onPreview, onDelete, onSplit, splitting }) {
  const isSplitting = !!splitting;
  return (
    <article className="sg-card">
      <button type="button" className="sg-card-thumb" onClick={() => onPreview?.(item)}>
        <img src={item.url} alt={item.prompt || 'sticker'} loading="lazy" />
        <span className="sg-card-zoom"><Maximize2 className="sg-icon-sm" /></span>
        {item.isSplitPiece && <span className="sg-card-split-tag">拆分</span>}
      </button>
      <div className="sg-card-body">
        <div className="sg-card-meta">
          {item.styleName ? <Badge variant="secondary">{item.styleName}</Badge> : null}
          {item.kind && (
            <Badge variant="outline">
              {item.kind === 'text_to_image' ? '文生图' : item.kind === 'edit_image' ? '图生图' : item.kind === 'split' ? '拆分' : ''}
            </Badge>
          )}
          <span className="sg-card-time">{item.createdAt}</span>
        </div>
        {item.prompt && <p className="sg-card-prompt">{item.prompt}</p>}
        <div className="sg-card-actions">
          <Button size="sm" variant="outline" onClick={() => window.open(item.url, '_blank')}>
            <ExternalLink className="sg-icon-xs" /> 打开
          </Button>
          <a className="sg-card-dl" href={item.url} download={`sticker-${item.id}.png`} target="_blank" rel="noreferrer">
            <Download className="sg-icon-xs" /> 下载
          </a>
          {onSplit && (
            <Button size="sm" variant="outline" onClick={() => onSplit(item)} disabled={isSplitting} title="一键拆分贴纸集合">
              {isSplitting ? <Loader2 className="sg-icon-xs sg-spin" /> : <Scissors className="sg-icon-xs" />}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onDelete?.(item.id)}>
            <Trash2 className="sg-icon-xs" />
          </Button>
        </div>
      </div>
    </article>
  );
}
