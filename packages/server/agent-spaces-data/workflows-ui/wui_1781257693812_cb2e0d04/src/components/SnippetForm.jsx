import { useEffect, useState } from 'react';
import { LANGUAGES } from '../utils/settings';

const {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Label, Input, Textarea, Button,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} = window.AgentSpacesUI;

const DEFAULT_LANGUAGE = 'javascript';

// 新增 / 编辑片段表单。editing 非空时进入编辑模式（回填字段）。
export default function SnippetForm({ open, onOpenChange, editing, onSubmit }) {
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [tags, setTags] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? '');
    setCode(editing?.code ?? '');
    setLanguage(editing?.language ?? DEFAULT_LANGUAGE);
    setTags(editing?.tags ?? '');
  }, [open, editing]);

  const submit = async () => {
    if (!title.trim()) return;
    await onSubmit({ title, code, language, tags });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? '编辑片段' : '新建片段'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>标题</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="片段名称" />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>语言</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>标签（逗号分隔）</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="utils, 前端" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>代码</Label>
            <Textarea value={code} onChange={(e) => setCode(e.target.value)} rows={8} className="font-mono text-sm" placeholder="// 在此输入代码" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={submit} disabled={!title.trim()}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
