const { useState, useEffect } = React;
const {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Button, Input, Label, Trash2,
} = window.AgentSpacesUI;

// 编辑订阅源弹窗：标题/分类可改，URL 只读；底部含删除按钮
export function EditFeedDialog({ open, feed, categories = [], onClose, onSave, onDelete }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 每次打开/切换 feed 时同步表单
  useEffect(() => {
    if (open && feed) {
      setTitle(feed.title || '');
      setCategory(feed.category || '');
      setConfirmDelete(false);
    }
  }, [open, feed]);

  if (!feed) return null;

  const handleSave = () => {
    onSave(feed.id, { title: title.trim(), category: category.trim() });
    onClose();
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete(feed.id);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[520px]">
        <DialogHeader>
          <DialogTitle>编辑订阅源</DialogTitle>
          <DialogDescription>修改标题与分类，或删除该订阅</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-title" className="text-xs">标题</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="订阅源标题"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-category" className="text-xs">分类</Label>
            <Input
              id="edit-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="如：技术 / 新闻 / 设计"
              list="edit-category-list"
            />
            {categories.length > 0 && (
              <datalist id="edit-category-list">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-url" className="text-xs">订阅源 URL（不可修改）</Label>
            <Input
              id="edit-url"
              value={feed.url || ''}
              readOnly
              className="text-muted-foreground text-xs"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {/* 左侧删除 */}
          <Button
            type="button"
            variant={confirmDelete ? 'destructive' : 'ghost'}
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4" />
            {confirmDelete ? '确认删除' : '删除订阅'}
          </Button>

          {/* 右侧取消/保存 */}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>取消</Button>
            <Button type="button" onClick={handleSave}>保存</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
