import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Label,
} from '@agent-spaces/ui';
import {
  ASPECT_OPTIONS, DEFAULT_MODEL, MODEL_OPTIONS, NODE_META, NODE_TYPES, SIZE_OPTIONS,
} from '../utils/constants';
import { normalizeImageUrls } from '../utils/workflow';
import PromptPickerDialog from './PromptPickerDialog';
import PickedPromptBadge from './nodes/PickedPromptBadge';
import FileUpload from './FileUpload';

/**
 * 节点表单弹窗：从右侧【新增节点】tab 点文生图/编辑图片旁的按钮打开，
 * 或从节点工具栏【编辑】按钮打开（此时 nodeType=editImage 且 initialImages 预填默认图），
 * 填写表单后提交到执行队列。
 *
 * @param {{ open:boolean, nodeType:string, initialImages?:string[], onClose:()=>void, onSubmit:(task)=>void }} props
 *   task = { nodeType, label, workflowId, input }
 */
export default function NodeFormDialog({ open, nodeType, initialImages, onClose, onSubmit }) {
  const meta = NODE_META[nodeType] || {};
  const [prompt, setPrompt] = useState('');
  const [pickedPrompt, setPickedPrompt] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [aspect, setAspect] = useState('1:1');
  const [size, setSize] = useState('1k');
  const [images, setImages] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  // 打开时按 nodeType + initialImages 初始化（兼容「编辑」按钮预填）
  useEffect(() => {
    if (!open) return;
    setPrompt('');
    setPickedPrompt('');
    setModel(DEFAULT_MODEL);
    setAspect('1:1');
    setSize('1k');
    setImages(Array.isArray(initialImages) ? initialImages.filter(Boolean) : []);
  }, [open, nodeType, initialImages]);

  const isEdit = nodeType === NODE_TYPES.editImage;
  // 提示词库选中 或 用户输入 二者有其一即可提交
  const hasPrompt = prompt.trim() || pickedPrompt.trim();
  const canSubmit = hasPrompt && (!isEdit || images.length > 0);

  const handleSubmit = () => {
    if (!canSubmit) return;
    // 提示词库选中 + 用户输入 合并
    const merged = [pickedPrompt, prompt].map((s) => s.trim()).filter(Boolean).join('\n');
    const input = { prompt: merged, model, aspect, size };
    if (isEdit) input.images = normalizeImageUrls(images);
    onSubmit?.({
      nodeType,
      label: `${meta.label}：${merged.slice(0, 16)}${merged.length > 16 ? '…' : ''}`,
      input,
    });
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
            <Field label="输入图片">
              <FileUpload
                value={images}
                onChange={setImages}
                max={6}
                placeholder="点击或拖拽图片上传"
              />
            </Field>
          )}

          <div className="flex flex-col gap-1.5">
            <PickedPromptBadge
              pickedPrompt={pickedPrompt}
              onClear={() => setPickedPrompt('')}
            />
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
              className="min-h-[72px] w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
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
          onPick={(item) => {
            setPickedPrompt(item.prompt);
            if (item.aspect) setAspect(item.aspect);
          }}
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
