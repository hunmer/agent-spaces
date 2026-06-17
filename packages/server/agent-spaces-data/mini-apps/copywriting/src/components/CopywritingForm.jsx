import { useEffect, useState } from 'react';

const {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Input, Label, Badge, FileUpload,
} = window.AgentSpacesUI;
const { Loader2, X } = window.AgentSpacesUI;

const EMPTY = { title: '', type: 'text', content: '', transcription: '', tags: [] };

export default function CopywritingForm({ open, onOpenChange, editing, onSubmit, onDelete }) {
  const isEdit = !!editing;
  const [form, setForm] = useState(EMPTY);
  const [tagInput, setTagInput] = useState('');
  const [uploadItems, setUploadItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setErr(''); setUploadItems([]); setBusy(false); setTagInput('');
    if (editing) {
      setForm({
        title: editing.title || '',
        type: editing.type || 'text',
        content: editing.content || '',
        transcription: editing.transcription || '',
        tags: String(editing.tags || '').split(',').map((s) => s.trim()).filter(Boolean),
      });
    } else {
      setForm({ ...EMPTY });
    }
  }, [open, editing]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) set({ tags: [...form.tags, t] });
    setTagInput('');
  };

  const mediaFiles = uploadItems.map((item) => item.file).filter(Boolean);
  const uploading = mediaFiles.some((file) => file.uploading);

  const submit = async () => {
    setErr('');
    if (!form.title.trim()) { setErr('请输入标题'); return; }
    if (!isEdit) {
      if (mediaFiles.length === 0) { setErr('请选择音视频文件'); return; }
      const uploadingFile = mediaFiles.find((file) => file.uploading);
      if (uploadingFile) { setErr('文件上传中，请稍候'); return; }
      const failedFile = mediaFiles.find((file) => file.uploadError);
      if (failedFile) { setErr('文件上传失败：' + failedFile.uploadError); return; }
      const pendingFile = mediaFiles.find((file) => !file.uploadedPath);
      if (pendingFile) { setErr('文件尚未上传完成'); return; }
    }
    setBusy(true);
    try {
      await onSubmit({
        title: form.title,
        type: form.type,
        content: form.content,
        transcription: form.transcription,
        tags: form.tags.join(','),
        mediaFiles: !isEdit ? mediaFiles : [],
      });
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = () => {
    if (!editing) return;
    if (!confirm('确定删除此文案？')) return;
    onDelete(editing);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑文案' : '新建文案'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>标题</Label>
            <Input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="输入文案标题" className="mt-1" />
          </div>

          {!isEdit && (
            <div>
              <Label>选择文件</Label>
              <div className="mt-1">
                <FileUpload
                  value={uploadItems}
                  onChange={setUploadItems}
                  autoUpload
                  accept={{ 'audio/*': [], 'video/*': [] }}
                  placeholder="拖拽音视频文件到此处，或点击选择"
                />
              </div>
              {uploading && <p className="mt-1 text-xs text-primary">上传中…</p>}
            </div>
          )}

          <div>
            <Label>标签</Label>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 p-1.5 border rounded-md min-h-9">
              {form.tags.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1">
                  {t}
                  <button type="button" onClick={() => set({ tags: form.tags.filter((x) => x !== t) })}>
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="输入标签后回车"
                className="flex-1 min-w-24 bg-transparent outline-none text-sm px-1"
              />
            </div>
          </div>

          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>

        <DialogFooter className="sm:justify-between gap-2">
          <div>
            {isEdit && (
              <Button variant="destructive" onClick={handleDelete} disabled={busy}>
                删除
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>取消</Button>
            <Button onClick={submit} disabled={busy || uploading}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? '处理中…' : '保存'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
