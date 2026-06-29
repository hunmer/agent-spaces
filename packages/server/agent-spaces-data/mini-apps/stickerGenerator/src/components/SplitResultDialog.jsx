// 拆分结果对话框：展示子贴纸网格，默认全选，可单独取消，一键下载 zip / 单独下载
import { downloadToBrowser } from '../utils/download';
const {
  Dialog, DialogContent, DialogHeader, DialogTitle, Button, Badge,
  Check, Download, Loader2, CheckSquare, Square,
} = window.AgentSpacesUI;

export default function SplitResultDialog({ open, pieces = [], sourcePrompt = '', onClose }) {
  const AS = window.AgentSpaces;
  const [selected, setSelected] = React.useState(() => pieces.map((_, i) => true));
  const [zipping, setZipping] = React.useState(false);
  const [downloadingIdx, setDownloadingIdx] = React.useState(null);
  const [error, setError] = React.useState('');

  // pieces 变化时重置为全选
  React.useEffect(() => {
    setSelected(pieces.map((_, i) => true));
    setError('');
  }, [pieces]);

  const toggle = (i) => setSelected((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  const allSelected = selected.length > 0 && selected.every(Boolean);
  const toggleAll = () => setSelected((prev) => prev.map(() => !allSelected));
  const selectedCount = selected.filter(Boolean).length;

  const downloadZip = async () => {
    if (!selectedCount) { setError('请至少选择一张'); return; }
    setZipping(true);
    setError('');
    try {
      const files = pieces
        .map((p, i) => ({ url: p.dataUrl || p.url, filename: `sticker-${String(i + 1).padStart(2, '0')}.png` }))
        .filter((_, i) => selected[i]);
      await AS.downloadZip(files, 'stickers.zip');
    } catch (err) {
      setError('打包失败：' + (err?.message || err));
    } finally {
      setZipping(false);
    }
  };

  // 单独下载某一张（触发浏览器原生下载）
  const downloadOne = async (i) => {
    setDownloadingIdx(i);
    setError('');
    try {
      const url = pieces[i].dataUrl || pieces[i].url;
      await downloadToBrowser(url, `sticker-${String(i + 1).padStart(2, '0')}.png`);
    } catch (err) {
      setError('下载失败：' + (err?.message || err));
    } finally {
      setDownloadingIdx(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="sg-split-dialog">
        <DialogHeader>
          <DialogTitle>拆分结果 · {pieces.length} 张</DialogTitle>
        </DialogHeader>

        <div className="sg-split-toolbar">
          <button type="button" className="sg-split-selectall" onClick={toggleAll}>
            {allSelected ? <CheckSquare className="sg-icon-sm" /> : <Square className="sg-icon-sm" />}
            {allSelected ? '取消全选' : '全选'}
          </button>
          <Badge variant="secondary">已选 {selectedCount}</Badge>
          <Button size="sm" onClick={downloadZip} disabled={zipping || !selectedCount} className="sg-split-zip">
            {zipping ? <Loader2 className="sg-icon-sm sg-spin" /> : <Download className="sg-icon-sm" />}
            {zipping ? '打包中...' : '下载 ZIP'}
          </Button>
        </div>

        {sourcePrompt && <div className="sg-split-prompt">来源：{sourcePrompt}</div>}
        {error && <div className="sg-split-error">{error}</div>}

        <div className="sg-split-grid">
          {pieces.map((p, i) => (
            <div key={i} className={`sg-split-cell${selected[i] ? ' is-selected' : ''}`}>
              <button
                type="button"
                className="sg-split-cell-img"
                onClick={() => toggle(i)}
                title={selected[i] ? '点击取消选择' : '点击选择'}
              >
                <img src={p.dataUrl || p.url} alt={`sticker ${i + 1}`} />
                <span className={`sg-split-check${selected[i] ? ' is-on' : ''}`}>
                  {selected[i] && <Check className="sg-icon-sm" />}
                </span>
                <span className="sg-split-idx">{i + 1}</span>
              </button>
              <button
                type="button"
                className="sg-split-dl-one"
                onClick={() => downloadOne(i)}
                disabled={downloadingIdx === i}
                title="单独下载"
              >
                {downloadingIdx === i ? <Loader2 className="sg-icon-xs sg-spin" /> : <Download className="sg-icon-xs" />}
              </button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
