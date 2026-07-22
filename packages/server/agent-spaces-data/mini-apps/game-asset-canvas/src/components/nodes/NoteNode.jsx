import { useCallback } from 'react';
import { NODE_TYPES } from '../../utils/constants';

/**
 * 便签节点：纯文本批注，不参与工作流，无 Handle。
 * data.text: string
 */
export default function NoteNode({ id, data }) {
  const text = data?.text || '';
  const onUpdate = data?.onUpdate;

  const handleChange = useCallback((e) => {
    onUpdate?.({ text: e.target.value });
  }, [onUpdate]);

  return (
    <div
      className="w-[200px] rounded-md border border-amber-300/60 bg-amber-50 shadow-sm dark:border-amber-500/40 dark:bg-amber-950/40"
      style={{ backgroundColor: 'rgb(245 158 11 / 0.10)' }}
    >
      <div className="flex items-center gap-1.5 border-b border-amber-300/40 px-2.5 py-1.5">
        <span className="text-sm">📝</span>
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">便签</span>
      </div>
      <textarea
        className="nodrag nopan nowheel min-h-[60px] w-full resize-y bg-transparent px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
        placeholder="写点备注…（如：这组资产用于森林关卡）"
        value={text}
        onChange={handleChange}
      />
    </div>
  );
}
