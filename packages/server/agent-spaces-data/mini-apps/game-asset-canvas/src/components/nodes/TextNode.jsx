import { useCallback } from 'react';
import { MarkdownEditor } from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import { NODE_TYPES } from '../../utils/constants';

/** 可编辑 Markdown 文本，同时以 data.output.text 作为可连线的文本产物。 */
export default function TextNode({ id, data, selected }) {
  const text = typeof data?.output?.text === 'string' ? data.output.text : '';
  const onUpdate = data?.onUpdate;
  const handleChange = useCallback((nextText) => {
    onUpdate?.({ output: { ...(data?.output || {}), text: nextText } });
  }, [data?.output, onUpdate]);

  return (
    <NodeShell id={id} nodeType={NODE_TYPES.text} data={data} selected={selected} sourceHandle>
      {/* h-full 让 MarkdownEditor 撑满 NodeShell 内容区（高度由节点尺寸驱动） */}
      <div className="nodrag nopan nowheel min-w-0 flex-1 overflow-hidden p-1">
        <MarkdownEditor contentMarkdown={text} onChange={handleChange} height="100%" />
      </div>
    </NodeShell>
  );
}
