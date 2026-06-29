// 单张贴图卡片：缩略图 + 风格标签 + 时间 + 操作按钮
const { Button, Badge, Download, Trash2, ExternalLink, Maximize2 } = window.AgentSpacesUI;

export default function StickerCard({ item, onPreview, onDelete }) {
  return (
    <article className="sg-card">
      <button type="button" className="sg-card-thumb" onClick={() => onPreview?.(item)}>
        <img src={item.url} alt={item.prompt || 'sticker'} loading="lazy" />
        <span className="sg-card-zoom"><Maximize2 className="sg-icon-sm" /></span>
      </button>
      <div className="sg-card-body">
        <div className="sg-card-meta">
          {item.styleName ? <Badge variant="secondary">{item.styleName}</Badge> : null}
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
          <Button size="sm" variant="ghost" onClick={() => onDelete?.(item.id)}>
            <Trash2 className="sg-icon-xs" />
          </Button>
        </div>
      </div>
    </article>
  );
}
