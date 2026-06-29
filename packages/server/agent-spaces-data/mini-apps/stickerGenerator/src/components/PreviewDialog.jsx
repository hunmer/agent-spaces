// 贴图预览大图弹窗：左图右信息（关闭用 Dialog 自带按钮）
// 下载触发浏览器原生下载
import { downloadToBrowser } from '../utils/download';
const {
  Dialog, DialogContent, DialogHeader, DialogTitle, Badge, Button, Download, Trash2,
} = window.AgentSpacesUI;

export default function PreviewDialog({ item, onClose, onDelete }) {
  if (!item) return null;

  const handleDownload = async () => {
    try {
      await downloadToBrowser(item.url, `sticker-${item.id}.png`);
    } catch (err) {
      window.alert?.('下载失败：' + (err?.message || err));
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent className="sg-preview-dialog">
        <DialogHeader>
          <DialogTitle>贴图详情</DialogTitle>
        </DialogHeader>
        <div className="sg-preview-body">
          <div className="sg-preview-img-wrap">
            <img src={item.url} alt={item.prompt || 'sticker'} />
          </div>
          <div className="sg-preview-info">
            <div className="sg-preview-meta">
              {item.styleName && <Badge variant="secondary">{item.styleName}</Badge>}
              {item.kind && <Badge>{item.kind === 'text_to_image' ? '文生图' : item.kind === 'edit_image' ? '图生图' : item.kind === 'split' ? '拆分' : ''}</Badge>}
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
            <button type="button" className="sg-preview-dl" onClick={handleDownload}>
              <Download className="sg-icon-sm" /> 下载 PNG
            </button>
            <Button variant="outline" onClick={() => { onDelete?.(item.id); onClose?.(); }}>
              <Trash2 className="sg-icon-sm" /> 删除
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
