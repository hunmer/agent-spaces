
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

export interface ClipboardRecord {
  id: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  count: number;
  label: string;
}

const MAX_CLIPBOARD_RECORDS = 10;

export function useClipboard() {
  const recordsRef = useRef<ClipboardRecord[]>([]);
  const [records, setRecords] = useState<ClipboardRecord[]>([]);

  const copy = useCallback((nodes: WorkflowNode[], edges: WorkflowEdge[]) => {
    if (nodes.length === 0) return;
    const record: ClipboardRecord = {
      id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
      count: nodes.length,
      label: nodes[0]?.label?.trim() || nodes[0]?.type || 'node',
    };
    const next = [record, ...recordsRef.current].slice(0, MAX_CLIPBOARD_RECORDS);
    recordsRef.current = next;
    setRecords(next);
  }, []);

  // record 省略时取最近一次复制
  const paste = useCallback((record?: ClipboardRecord): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null => {
    const target = record ?? recordsRef.current[0];
    if (!target) return null;
    const idMap = new Map<string, string>();
    const newNodes = target.nodes.map(n => {
      const newId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      idMap.set(n.id, newId);
      return { ...n, id: newId, position: { ...n.position } };
    });
    const newEdges = target.edges.map(e => ({
      ...e,
      id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      source: idMap.get(e.source) || e.source,
      target: idMap.get(e.target) || e.target,
    }));
    return { nodes: newNodes, edges: newEdges };
  }, []);

  const getData = useCallback((record?: ClipboardRecord): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null => {
    const target = record ?? recordsRef.current[0];
    if (!target) return null;
    return JSON.parse(JSON.stringify({ nodes: target.nodes, edges: target.edges }));
  }, []);

  const clear = useCallback(() => {
    recordsRef.current = [];
    setRecords([]);
  }, []);

  const hasData = records.length > 0;
  const count = records.length;

  return { copy, paste, getData, clear, hasData, count, records };
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
