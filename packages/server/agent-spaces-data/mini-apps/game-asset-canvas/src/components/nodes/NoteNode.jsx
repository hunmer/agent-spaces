import { useCallback } from 'react';
import { NODE_TYPES } from '../../utils/constants';
import EditableNodeTitle from './EditableNodeTitle';
import AutoResizeTextarea from '../AutoResizeTextarea';

/**
 * 便签节点：纯文本批注，不参与工作流，无 Handle。
 * data.text: string
 */
export default function NoteNode({ id, data }) {
  const showFullNode = data?.compactView !== true;
  const text = data?.text || '';
  const onUpdate = data?.onUpdate;

  const handleChange = useCallback((e) => {
    onUpdate?.({ text: e.target.value });
  }, [onUpdate]);

  return (
    <div
      className="relative w-[200px] rounded-md border border-amber-300/60 bg-amber-50 shadow-sm dark:border-amber-500/40 dark:bg-amber-950/40"
      style={{ backgroundColor: 'rgb(245 158 11 / 0.10)' }}
    >
      <div data-node-header className={`flex items-center gap-1.5 border-b border-amber-300/40 px-2.5 py-1.5 ${showFullNode ? '' : 'invisible pointer-events-none'}`}>
        <span className="text-sm">📝</span>
        <EditableNodeTitle
          value={data?.title || data?.label}
          fallback="便签"
          onChange={(title) => onUpdate?.({ title })}
          className="min-w-0 truncate text-xs font-semibold text-amber-700 dark:text-amber-400"
          inputClassName="h-5 w-full rounded px-1 text-xs font-semibold"
        />
      </div>
      <AutoResizeTextarea
        minHeight={60}
        className={`nodrag nopan nowheel w-full bg-transparent px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 ${showFullNode ? '' : 'invisible pointer-events-none'}`}
        placeholder="写点备注…（如：这组资产用于森林关卡）"
        value={text}
        onChange={handleChange}
      />
      {!showFullNode && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 overflow-hidden rounded-md px-3">
          <span className="text-2xl leading-none">📝</span>
          <span className="truncate text-lg font-semibold text-amber-700 dark:text-amber-400">{data?.title || data?.label || '便签'}</span>
        </div>
      )}
    </div>
  );
}
