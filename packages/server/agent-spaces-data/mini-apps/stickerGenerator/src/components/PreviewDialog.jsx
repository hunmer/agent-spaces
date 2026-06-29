// 贴图预览大图弹窗：左图右信息
const {
  Dialog, DialogContent, DialogHeader, DialogTitle, Badge, Button, X, Download, Trash2,
} = window.AgentSpacesUI;

export default function PreviewDialog({ item, onClose, onDelete }) {
  if (!item) return null;
  return (
    <Dialog open={!!item} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent className="sg-preview-dialog">
        <DialogHeader className="sg-preview-header">
          <DialogTitle>贴图详情</DialogTitle>
          <Button size="icon" variant="ghost" onClick={onClose}><X className="sg-icon-sm" /></Button>
        </DialogHeader>
        <div className="sg-preview-body">
          <div className="sg-preview-img-wrap">
            <img src={item.url} alt={item.prompt || 'sticker'} />
          </div>
          <div className="sg-preview-info">
            <div className="sg-preview-meta">
              {item.styleName && <Badge variant="secondary">{item.styleName}</Badge>}
              {item.kind && <Badge>{item.kind === 'text_to_image' ? '文生图' : '图生图'}</Badge>}
            </div>
            {item.prompt && (
              <div className="sg-preview-block">
                <label>提示词</label>
                <p>{item.prompt}</p>
              </div>
            )}
            <div className="sg-preview-block">
              <label>生成时间</label>
              <p className="sg-preview-time">{item.createdAt}</p>
            </div>
            <a className="sg-preview-dl" href={item.url} download={`sticker-${item.id}.png`} target="_blank" rel="noreferrer">
              <Download className="sg-icon-sm" /> 下载 PNG
            </a>
            <Button variant="outline" onClick={() => { onDelete?.(item.id); onClose?.(); }}>
              <Trash2 className="sg-icon-sm" /> 删除
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
