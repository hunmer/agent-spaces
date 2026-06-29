// 拆分前数量选择对话框：默认用生成时的 collectionCount，可调整
const {
  Dialog, DialogContent, DialogHeader, DialogTitle, Button, Label,
} = window.AgentSpacesUI;

export default function SplitConfirmDialog({ open, item, defaultCount, onConfirm, onClose }) {
  const [count, setCount] = React.useState(defaultCount || 6);
  const presets = [4, 6, 9, 12];

  // 每次打开重置为默认值
  React.useEffect(() => {
    if (open) setCount(defaultCount || 6);
  }, [open, defaultCount]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="sg-split-confirm">
        <DialogHeader>
          <DialogTitle>拆分贴纸集合</DialogTitle>
        </DialogHeader>

        {item?.url && (
          <div className="sg-split-confirm-thumb">
            <img src={item.url} alt="预览" />
          </div>
        )}

        <div className="sg-split-confirm-field">
          <Label>拆分数量</Label>
          <div className="sg-split-confirm-presets">
            {presets.map((n) => (
              <button
                type="button"
                key={n}
                className={`sg-count-btn${count === n ? ' is-selected' : ''}`}
                onClick={() => setCount(n)}
              >{n}</button>
            ))}
            <input
              type="number"
              min={2}
              max={12}
              value={count}
              onChange={(e) => setCount(Math.max(2, Math.min(12, Number(e.target.value) || 6)))}
              className="sg-count-input"
            />
          </div>
          <div className="sg-style-hint">
            {item?.collectionCount
              ? `生成时为 ${item.collectionCount} 宫格，默认按此数量拆分。`
              : '选择期望拆出的贴纸数量。'}
          </div>
        </div>

        <div className="sg-set-foot">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => onConfirm(count)}>开始拆分</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
