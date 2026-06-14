
import { useCallback, useEffect, useRef, useState } from 'react';
import { getWorkflowEditorStore } from '@/stores/workflow-editor';
import type { WorkflowNode, WorkflowEdge } from '@agent-spaces/shared';

// ---- useWorkflowEditor ----

export function useWorkflowEditor(workspaceId: string) {
  const store = getWorkflowEditorStore(workspaceId);
  const state = store();

  return {
    ...state,
    store,
  };
}

// ---- useFlowCanvas ----

export function useFlowCanvas() {
  const [isDragging, setIsDragging] = useState(false);

  const onDragStart = useCallback(() => setIsDragging(true), []);
  const onDragEnd = useCallback(() => setIsDragging(false), []);

  return { isDragging, onDragStart, onDragEnd };
}

// ---- useEditorShortcuts ----

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target.isContentEditable
  );
}

export function useEditorShortcuts({
  onSave,
  onUndo,
  onRedo,
  onDelete,
  onCopy,
  onPaste,
}: {
  onSave?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onDelete?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.key) return;
      const isEditableTarget = isEditableKeyboardTarget(e.target);
      const key = e.key.toLowerCase();

      if ((e.metaKey || e.ctrlKey) && key === 's') {
        e.preventDefault();
        onSave?.();
      }
      if (!isEditableTarget && (e.metaKey || e.ctrlKey) && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        onUndo?.();
      }
      if (!isEditableTarget && (e.metaKey || e.ctrlKey) && key === 'z' && e.shiftKey) {
        e.preventDefault();
        onRedo?.();
      }
      if (!isEditableTarget && (e.metaKey || e.ctrlKey) && key === 'y') {
        e.preventDefault();
        onRedo?.();
      }
      if (!isEditableTarget && (e.key === 'Delete' || e.key === 'Backspace')) {
        onDelete?.();
      }
      if (!isEditableTarget && (e.metaKey || e.ctrlKey) && key === 'c') {
        onCopy?.();
      }
      if (!isEditableTarget && (e.metaKey || e.ctrlKey) && key === 'v') {
        onPaste?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSave, onUndo, onRedo, onDelete, onCopy, onPaste]);
}

// ---- useClipboard ----

export function useClipboard() {
  const clipboardRef = useRef<{ nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null>(null);
  const [count, setCount] = useState(0);

  const copy = useCallback((nodes: WorkflowNode[], edges: WorkflowEdge[]) => {
    clipboardRef.current = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };
    setCount(nodes.length);
  }, []);

  const paste = useCallback((): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null => {
    if (!clipboardRef.current) return null;
    const { nodes, edges } = clipboardRef.current;
    // Generate new IDs to avoid conflicts
    const idMap = new Map<string, string>();
    const newNodes = nodes.map(n => {
      const newId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      idMap.set(n.id, newId);
      return { ...n, id: newId, position: { x: n.position.x + 20, y: n.position.y + 20 } };
    });
    const newEdges = edges.map(e => ({
      ...e,
      id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      source: idMap.get(e.source) || e.source,
      target: idMap.get(e.target) || e.target,
    }));
    return { nodes: newNodes, edges: newEdges };
  }, []);

  const getData = useCallback((): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null => {
    if (!clipboardRef.current) return null;
    return JSON.parse(JSON.stringify(clipboardRef.current));
  }, []);

  const clear = useCallback(() => {
    clipboardRef.current = null;
    setCount(0);
  }, []);

  const hasData = count > 0;

  return { copy, paste, getData, clear, hasData, count };
}

// ---- useExecutionPanel ----

export function useExecutionPanel() {
  const [isExpanded, setIsExpanded] = useState(false);
  const toggle = useCallback(() => setIsExpanded(v => !v), []);
  return { isExpanded, toggle, setExpanded: setIsExpanded };
}

// ---- usePanelSizes ----

export function usePanelSizes(storageKey: string) {
  const [sizes, setSizes] = useState<number[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : [280, 420];
    } catch {
      return [280, 420];
    }
  });

  const updateSizes = useCallback((newSizes: number[]) => {
    setSizes(newSizes);
    try {
      localStorage.setItem(storageKey, JSON.stringify(newSizes));
    } catch {}
  }, [storageKey]);

  return { sizes, updateSizes };
}
