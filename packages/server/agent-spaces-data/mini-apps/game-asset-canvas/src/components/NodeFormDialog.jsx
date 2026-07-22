import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Label,
} from '@agent-spaces/ui';
import {
  ASPECT_OPTIONS, DEFAULT_MODEL, MODEL_OPTIONS, NODE_META, NODE_TYPES, SIZE_OPTIONS,
} from '../utils/constants';
import PromptPickerDialog from './PromptPickerDialog';

/**
 * 节点表单弹窗：从右侧【新增节点】tab 点文生图/编辑图片旁的按钮打开，
 * 填写表单后提交到执行队列。
 *
 * @param {{ open:boolean, nodeType:string, onClose:()=>void, onSubmit:(task)=>void }} props
 *   task = { nodeType, label, workflowId, input }
 */
export default function NodeFormDialog({ open, nodeType, onClose, onSubmit }) {
  const meta = NODE_META[nodeType] || {};
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [aspect, setAspect] = useState('1:1');
  const [size, setSize] = useState('1k');
  const [imagesText, setImagesText] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  // nodeType 变化时重置表单
  const [lastType, setLastType] = useState(nodeType);
  if (nodeType !== lastType) {
    setLastType(nodeType);
    setPrompt(''); setModel(DEFAULT_MODEL); setAspect('1:1'); setSize('1k'); setImagesText('');
  }

  const isEdit = nodeType === NODE_TYPES.editImage;
  const canSubmit = prompt.trim() && (!isEdit || imagesText.trim());

  const handleSubmit = () => {
    if (!canSubmit) return;
    const input = { prompt: prompt.trim(), model, aspect, size };
    if (isEdit) {
      input.images = imagesText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    }
    onSubmit?.({
      nodeType,
      label: `${meta.label}：${prompt.trim().slice(0, 16)}${prompt.trim().length > 16 ? '…' : ''}`,
      input,
    });
    // 提交后关闭并重置
    setPrompt(''); setImagesText('');
    onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose?.(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{meta.icon} {meta.label}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {isEdit && (
            <Field label="输入图片 URL（多个用换行或逗号分隔）">
              <textarea
                className="nodrag nopan nowheel min-h-[60px] w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                placeholder="https://example.com/image1.png&#10;https://example.com/image2.png"
                value={imagesText}
                onChange={(e) => setImagesText(e.target.value)}
              />
            </Field>
          )}

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">提示词</Label>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="text-xs text-muted-foreground transition hover:text-primary"
              >
                📋 提示词库
              </button>
            </div>
            <textarea
              className="nodrag nopan nowheel min-h-[72px] w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              placeholder={isEdit ? '描述如何编辑图片…' : '描述要生成的游戏资产…'}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="模型">
              <SelectInput value={model} options={MODEL_OPTIONS} onChange={setModel} />
            </Field>
            <Field label="比例">
              <SelectInput value={aspect} rawOptions={ASPECT_OPTIONS} onChange={setAspect} />
            </Field>
            <Field label="尺寸">
              <SelectInput value={size} rawOptions={SIZE_OPTIONS} onChange={setSize} />
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button disabled={!canSubmit} onClick={handleSubmit}>提交到队列</Button>
        </DialogFooter>

        <PromptPickerDialog
          open={pickerOpen}
          scene={isEdit ? 'edit' : 'text'}
          onClose={() => setPickerOpen(false)}
          onPick={(p) => setPrompt((prev) => (prev.trim() ? `${prev.trim()}\n${p}` : p))}
        />
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </label>
  );
}

function SelectInput({ value, options, rawOptions, onChange }) {
  const opts = options || (rawOptions || []).map((o) => ({ value: o, label: o }));
  return (
    <select
      className="nodrag nopan nowheel w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {opts.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
