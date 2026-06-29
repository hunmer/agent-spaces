// 单张贴图卡片：缩略图 + 风格标签 + 时间 + 操作按钮（纯图标）
// 下载走宿主 downloadFile 落到 data 目录
const { Button, Badge, Download, Trash2, ExternalLink, Maximize2, Scissors, Loader2 } = window.AgentSpacesUI;

export default function StickerCard({ item, onPreview, onDelete, onSplit, splitting }) {
  const AS = window.AgentSpaces;
  const isSplitting = !!splitting;
  const [downloading, setDownloading] = React.useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await AS.downloadFile(item.url, `stickers/sticker-${item.id}.png`);
    } catch (err) {
      window.alert?.('下载失败：' + (err?.message || err));
    } finally {
      setDownloading(false);
    }
  };

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
          <Button size="icon" variant="outline" onClick={() => window.open(item.url, '_blank')} title="打开">
            <ExternalLink className="sg-icon-sm" />
          </Button>
          <Button size="icon" variant="outline" onClick={handleDownload} disabled={downloading} title="下载">
            {downloading ? <Loader2 className="sg-icon-sm sg-spin" /> : <Download className="sg-icon-sm" />}
          </Button>
          {onSplit && (
            <Button size="icon" variant="outline" onClick={() => onSplit(item)} disabled={isSplitting} title="一键拆分">
              {isSplitting ? <Loader2 className="sg-icon-sm sg-spin" /> : <Scissors className="sg-icon-sm" />}
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={() => onDelete?.(item.id)} title="删除">
            <Trash2 className="sg-icon-sm" />
          </Button>
        </div>
      </div>
    </article>
  );
}
