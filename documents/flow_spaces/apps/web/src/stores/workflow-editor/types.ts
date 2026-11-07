import type {
  Workflow, WorkflowFolder, WorkflowNode, WorkflowEdge, WorkflowGroup,
  ExecutionLog, WorkflowVersion, OperationEntry, StagedNode, EngineStatus,
  InteractionRequest,
} from '@agent-spaces/shared';

export interface WorkflowChanges {
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  groups?: WorkflowGroup[];
}

export type PendingInteraction = InteractionRequest;

export interface EmbeddedSelection {
  hostNodeId: string;
  nodeId: string;
  node: WorkflowNode;
}

export interface WorkflowEditorState {
  workspaceId: string;
  workflows: Workflow[];
  workflowFolders: WorkflowFolder[];
  currentWorkflow: Workflow | null;
  loadState: 'idle' | 'loading' | 'loaded' | 'error';
  loadError: string | null;
  selectedNodeIds: string[];
  selectedEmbeddedNode: EmbeddedSelection | null;
  rightPanelTab: string;
  executionStatus: EngineStatus;
  executionLog: ExecutionLog | null;
  executionContext: Record<string, unknown>;
  pendingInteraction: PendingInteraction | null;
  executionLogs: ExecutionLog[];
  selectedExecutionLogId: string | null;
  versions: WorkflowVersion[];
  stagedNodes: StagedNode[];
  undoStack: string[];
  redoStack: string[];
  operationLog: OperationEntry[];
  isDirty: boolean;
  debugNodeStatus: Record<string, 'running' | 'completed' | 'error'>;
  debugNodeResult: Record<string, unknown>;
  debugNodeId: string | null;
  isPreview: boolean;
}

export interface WorkflowEditorActions {
  loadData: () => Promise<void>;
  saveWorkflow: (workflow?: Workflow) => Promise<void>;
  deleteWorkflow: (id: string) => Promise<void>;
  createFolder: (name: string, parentId?: string | null) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  setCurrentWorkflow: (workflow: Workflow | null) => void;
  addNode: (type: string, position: { x: number; y: number }) => WorkflowNode | null;
  removeNode: (id: string) => void;
  updateNodeData: (id: string, data: Partial<WorkflowNode>) => void;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;
  addEdge: (edge: WorkflowEdge) => void;
  removeEdge: (id: string) => void;
  selectNodes: (ids: string[]) => void;
  clearSelection: () => void;
  selectEmbeddedNode: (selection: EmbeddedSelection | null) => void;
  setRightPanelTab: (tab: string) => void;
  execute: (input?: Record<string, unknown>, startNodeId?: string) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  debugSingleNode: (nodeId: string, context?: Record<string, unknown>) => Promise<void>;
  cancelDebug: () => void;
  loadExecutionLogs: () => Promise<void>;
  deleteExecutionLog: (id: string) => Promise<void>;
  clearExecutionLogs: () => Promise<void>;
  setSelectedExecutionLogId: (id: string | null) => void;
  enterPreview: (log: ExecutionLog) => void;
  exitPreview: () => void;
  loadVersions: () => Promise<void>;
  saveVersion: (name: string) => Promise<void>;
  deleteVersion: (id: string) => Promise<void>;
  restoreVersion: (id: string) => Promise<void>;
  loadStagedNodes: () => Promise<void>;
  copyNodeToStaging: (nodeId: string) => Promise<void>;
  moveNodeToStaging: (nodeId: string) => Promise<void>;
  removeStagedNode: (id: string) => Promise<void>;
  clearStagedNodes: () => Promise<void>;
  pasteStagedNode: (stagedNode: StagedNode) => void;
  loadOperationHistory: () => Promise<void>;
  pushUndo: (description: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  restoreToStep: (index: number) => void;
  clearOperationHistory: () => Promise<void>;
  markDirty: () => void;
  markClean: () => void;
  createGroup: (name: string, childNodeIds: string[]) => void;
  removeGroup: (id: string) => void;
  toggleGroupLock: (id: string) => void;
  toggleGroupDisabled: (id: string) => void;
  listenForUIInteractions: () => () => void;
  resolveInteraction: (data: unknown) => void;
}

export type WorkflowEditorStore = WorkflowEditorState & WorkflowEditorActions;

export type SetFn = (partial: Partial<WorkflowEditorStore> | ((state: WorkflowEditorStore) => Partial<WorkflowEditorStore>)) => void;
export type GetFn = () => WorkflowEditorStore;
