import { useEffect, useState } from 'react';

const {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Input, Textarea, Label, Badge, FileUpload,
} = window.AgentSpacesUI;
const { Loader2, X } = window.AgentSpacesUI;

const TYPES = [
  { value: 'text', label: '文本' },
  { value: 'audio', label: '音频' },
  { value: 'video', label: '视频' },
];

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
  const isMedia = form.type === 'audio' || form.type === 'video';

  const upFile = uploadItems[0]?.file;
  const uploading = !!upFile?.uploading;

  const submit = async () => {
    setErr('');
    if (!form.title.trim()) { setErr('请输入标题'); return; }
    if (!isEdit && isMedia) {
      if (!upFile) { setErr('请选择音视频文件'); return; }
      if (upFile.uploading) { setErr('文件上传中，请稍候'); return; }
      if (upFile.uploadError) { setErr('文件上传失败：' + upFile.uploadError); return; }
      if (!upFile.uploadedPath) { setErr('文件尚未上传完成'); return; }
    }
    setBusy(true);
    try {
      await onSubmit({
        title: form.title,
        type: form.type,
        content: form.content,
        transcription: form.transcription,
        tags: form.tags.join(','),
        uploadedPath: !isEdit ? upFile?.uploadedPath : null,
        uploadedHttpPath: !isEdit ? (upFile?.uploadedHttpPath || upFile?.uploadedUrl) : null,
        mediaFile: !isEdit ? upFile : null,
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

          <div>
            <Label>类型</Label>
            <div className="mt-1 flex gap-1.5">
              {TYPES.map((t) => {
                const active = form.type === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    disabled={isEdit}
                    onClick={() => { set({ type: t.value }); setUploadItems([]); }}
                    className={`px-3 py-1 rounded-md text-sm border transition-colors disabled:opacity-50 ${
                      active ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {!isMedia && (
            <div>
              <Label>内容</Label>
              <Textarea
                value={form.content}
                onChange={(e) => set({ content: e.target.value })}
                rows={6}
                placeholder="输入文案内容"
                className="mt-1"
              />
            </div>
          )}

          {isMedia && !isEdit && (
            <div>
              <Label>选择文件</Label>
              <div className="mt-1">
                <FileUpload
                  value={uploadItems}
                  onChange={setUploadItems}
                  autoUpload
                  maxFiles={1}
                  accept={form.type === 'video' ? { 'video/*': [] } : { 'audio/*': [] }}
                  placeholder="拖拽音视频文件到此处，或点击选择"
                />
              </div>
              {uploading && <p className="mt-1 text-xs text-primary">上传中…</p>}
            </div>
          )}

          {isMedia && isEdit && (
            <div>
              <Label>转写文稿</Label>
              <Textarea
                value={form.transcription}
                onChange={(e) => set({ transcription: e.target.value })}
                rows={8}
                placeholder="转写文字（可编辑）"
                className="mt-1"
              />
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
