const { useState, useEffect } = React;
const {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Button, Input, Label, Loader2,
} = window.AgentSpacesUI;

// 添加订阅源弹窗：URL（必填）+ 自定义标题（选填）+ 分类（选填）
// open / onOpenChange 由父级控制；onSubmit(url, {title, category}) 返回 Promise<boolean>
export function AddFeedDialog({ open, onOpenChange, onSubmit, categories = [] }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  // 每次打开时重置表单
  useEffect(() => {
    if (open) {
      setUrl('');
      setTitle('');
      setCategory('');
      setErr('');
      setSubmitting(false);
    }
  }, [open]);

  const canSubmit = url.trim().length > 0 && !submitting;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    const u = url.trim();
    if (!u) { setErr('请输入订阅源 URL'); return; }
    setErr('');
    setSubmitting(true);
    try {
      const ok = await onSubmit(u, { title: title.trim(), category: category.trim() });
      if (ok) {
        onOpenChange(false);
      }
    } catch (e2) {
      setErr(e2?.message || String(e2));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[560px]">
        <DialogHeader>
          <DialogTitle>添加订阅源</DialogTitle>
          <DialogDescription>
            填写 RSS / Atom / RDF / JSON Feed 地址，添加后自动拉取一次。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 py-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="feed-url" className="text-xs">订阅源 URL *</Label>
            <Input
              id="feed-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/feed.xml"
              autoFocus
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="feed-title" className="text-xs">自定义标题（选填）</Label>
            <Input
              id="feed-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="留空则自动使用订阅源标题"
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="feed-category" className="text-xs">分类（选填）</Label>
            <Input
              id="feed-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="如：技术 / 新闻 / 设计"
              list="feed-category-list"
              disabled={submitting}
            />
            {categories.length > 0 && (
              <datalist id="feed-category-list">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            )}
            <p className="text-[11px] text-muted-foreground">相同分类会折叠到同一分组</p>
          </div>

          {err && <div className="text-xs text-destructive">{err}</div>}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? '添加中…' : '添加并拉取'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
