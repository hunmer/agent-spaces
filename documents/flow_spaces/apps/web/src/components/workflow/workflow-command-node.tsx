'use client';

import { memo, useState, useCallback } from 'react';
import { Handle, Position, useReactFlow, type Node, type NodeProps } from '@xyflow/react';
import { Terminal, X } from 'lucide-react';

type CommandNodeData = {
  label: string;
  script: string;
  cwd?: string;
  env?: Record<string, string>;
  shell?: string;
  failStrategy?: 'stop';
};

type CommandNode = Node<CommandNodeData, 'command'>;

function WorkflowCommandNodeComponent({ id, data, selected }: NodeProps<CommandNode>) {
  const { setNodes } = useReactFlow();
  const [showDelete, setShowDelete] = useState(false);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setNodes((nds) => nds.filter((n) => n.id !== id));
  }, [id, setNodes]);

  const handleToggleDelete = useCallback(() => {
    setShowDelete((v) => !v);
  }, []);

  const scriptPreview = data.script
    ? data.script.split('\n')[0].slice(0, 40) + (data.script.split('\n')[0].length > 40 ? '...' : '')
    : 'No script';

  return (
    <div
      onClick={handleToggleDelete}
      className={`rounded-lg border-2 bg-zinc-900 p-3 shadow-sm min-w-[160px] transition-colors duration-150 group relative ${selected ? 'border-primary ring-2 ring-primary/20' : 'border-zinc-700'}`}
    >
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-zinc-500 !border-2 !border-zinc-900 hover:!bg-primary" />
      <button
        type="button"
        onClick={handleDelete}
        className="absolute -top-2 -right-2 flex items-center justify-center size-5 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/80 transition-opacity z-10 md:opacity-0 md:group-hover:opacity-100 cursor-pointer"
        style={{ opacity: showDelete ? 1 : undefined }}
      >
        <X className="size-3" />
      </button>
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center size-8 rounded-md bg-zinc-800 text-green-400">
          <Terminal className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate text-zinc-100 font-mono">{data.label}</div>
          <div className="text-[10px] text-zinc-400 truncate font-mono mt-0.5">{scriptPreview}</div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-zinc-500 !border-2 !border-zinc-900 hover:!bg-primary" />
    </div>
  );
}

export const WorkflowCommandNode = memo(WorkflowCommandNodeComponent);
