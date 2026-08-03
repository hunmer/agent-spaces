import { useEffect, useMemo, useState } from 'react';
import {
  Button, Checkbox,
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@agent-spaces/ui';
import { NODE_META } from '../utils/constants';
import { NODE_PARAMS_SCHEMA } from '../utils/canvas-constants';
import { getClipboardProperties } from '../utils/clipboard';

const PROPERTY_LABELS = {
  label: '节点名称',
  text: '文本内容',
  uploadedImages: '上传图片',
  referenceImages: '参考图片',
  outputPreviewMode: '输出预览模式',
};

export default function PastePropertiesDialog({ state, onClose, onApply, onContinuePaste }) {
  const properties = useMemo(() => getClipboardProperties(
    state?.sourceNode,
    NODE_PARAMS_SCHEMA[state?.sourceNode?.type] || [],
  ), [state]);
  const [checked, setChecked] = useState(new Set());

  useEffect(() => {
    setChecked(new Set());
  }, [properties]);

  const toggle = (path, value) => {
    setChecked((current) => {
      const next = new Set(current);
      if (value) next.add(path);
      else next.delete(path);
      return next;
    });
  };

  return (
    <Dialog open={!!state} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent style={{ width: 'min(480px, calc(100vw - 2rem))', maxWidth: 480 }}>
        <DialogHeader>
          <DialogTitle>复制并应用节点属性</DialogTitle>
          <DialogDescription>
            选择要应用到 {state?.targetIds?.length || 0} 个{state?.targetLabel || '目标节点'}的
            {NODE_META[state?.sourceNode?.type]?.label || '节点'}属性。
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={!properties.length || checked.size === properties.length}
            onClick={() => setChecked(new Set(properties.map((item) => item.path)))}
          >
            全选
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!properties.length}
            onClick={() => setChecked(new Set(
              properties.filter((item) => !checked.has(item.path)).map((item) => item.path),
            ))}
          >
            反选
          </Button>
        </div>

        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {properties.map((item) => (
            <label key={item.path} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-muted">
              <Checkbox
                checked={checked.has(item.path)}
                onCheckedChange={(value) => toggle(item.path, Boolean(value))}
              />
              <span className="text-sm">{PROPERTY_LABELS[item.path] || item.label}</span>
              <code className="ml-auto text-xs text-muted-foreground">{item.path}</code>
            </label>
          ))}
        </div>

        <DialogFooter>
          {onContinuePaste && <Button variant="outline" onClick={onContinuePaste}>继续粘贴</Button>}
          <Button disabled={!checked.size} onClick={() => onApply([...checked])}>应用</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
