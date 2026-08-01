import type { NodeRunState, NodeBreakpoint } from '@agent-spaces/shared';
import type { WorkflowFieldKeyRenameParams } from './workflow-properties-io-sections';

export const HEADER_HEIGHT = 33;
export const HANDLE_MARGIN = 12;

export type HandlePositionMode = 'top-bottom' | 'left-right' | 'bottom-top' | 'right-left';
export type WorkflowLogPanelLayout = 'vertical' | 'tabs';
export type WorkflowNodeDisplayMode = 'normal' | 'properties';
export type WorkflowPropertyModeBadgePosition = 'top' | 'center' | 'bottom';

export type WorkflowNodeData = Record<string, unknown> & {
  embeddedMode?: 'issue' | null;
  label?: string;
  nodeType?: string;
  selectedNodeIds?: string[];
  nodeWidth?: number;
  nodeHeight?: number;
  isPreview?: boolean;
  isCanvasLocked?: boolean;
  isRunning?: boolean;
  nodeState?: NodeRunState;
  breakpoint?: NodeBreakpoint;
  nodeColor?: string;
  execStatus?: string;
  debugNodeId?: string | null;
  debugStatus?: 'idle' | 'running' | 'completed' | 'error';
  pausedNodeId?: string | null;
  pausedReason?: string | null;
  partialExecutionStartNodeId?: string | null;
  isFirstConnectedNode?: boolean;
  handlePosition?: HandlePositionMode;
  floatingHandles?: boolean;
  logPanelLayout?: WorkflowLogPanelLayout;
  nodeDisplayMode?: WorkflowNodeDisplayMode;
  propertyModeBadgePosition?: WorkflowPropertyModeBadgePosition;
  loopExecutionScopeId?: string;
  executionLogData?: Record<string, unknown>;
  handleColors?: Record<string, string>;
  executionStep?: import('@agent-spaces/shared').ExecutionStep;
  executionSteps?: import('@agent-spaces/shared').ExecutionStep[];
  onAutoLayout?: (direction: 'LR' | 'TB', options?: { layoutEngine?: string; parentId?: string; nodeIds?: string[]; grid?: { rows: number; columns: number; horizontalGap: number; verticalGap: number } }) => void;
  onFieldKeyRename?: (params: WorkflowFieldKeyRenameParams) => void;
  layoutEngine?: string;
};

export type WorkflowCustomViewProps = {
  nodeId: string;
  data: Record<string, unknown>;
  isRunning?: boolean;
  isPreview?: boolean;
};

export type PluginNodeDefinitionMeta = {
  pluginId?: string;
  pluginIconPath?: string;
};

export type NodeColorDef = {
  label: string;
  value: string | null;
  className: string;
  borderClassName: string;
  backgroundClassName: string;
};

export const NODE_COLORS: NodeColorDef[] = [
  { label: 'nodeUi.colors.default', value: null, className: 'bg-background border border-border', borderClassName: 'border-border', backgroundClassName: 'bg-background' },
  { label: 'nodeUi.colors.emerald', value: 'emerald', className: 'bg-emerald-500', borderClassName: 'border-emerald-500', backgroundClassName: 'bg-emerald-100' },
  { label: 'nodeUi.colors.blue', value: 'blue', className: 'bg-blue-500', borderClassName: 'border-blue-500', backgroundClassName: 'bg-blue-100' },
  { label: 'nodeUi.colors.violet', value: 'violet', className: 'bg-violet-500', borderClassName: 'border-violet-500', backgroundClassName: 'bg-violet-100' },
  { label: 'nodeUi.colors.rose', value: 'rose', className: 'bg-rose-500', borderClassName: 'border-rose-500', backgroundClassName: 'bg-rose-100' },
  { label: 'nodeUi.colors.orange', value: 'orange', className: 'bg-orange-500', borderClassName: 'border-orange-500', backgroundClassName: 'bg-orange-100' },
  { label: 'nodeUi.colors.amber', value: 'amber', className: 'bg-amber-500', borderClassName: 'border-amber-500', backgroundClassName: 'bg-amber-100' },
  { label: 'nodeUi.colors.cyan', value: 'cyan', className: 'bg-cyan-500', borderClassName: 'border-cyan-500', backgroundClassName: 'bg-cyan-100' },
  { label: 'nodeUi.colors.pink', value: 'pink', className: 'bg-pink-500', borderClassName: 'border-pink-500', backgroundClassName: 'bg-pink-100' },
  { label: 'nodeUi.colors.slate', value: 'slate', className: 'bg-slate-500', borderClassName: 'border-slate-500', backgroundClassName: 'bg-slate-100' },
  { label: 'nodeUi.colors.red', value: 'red', className: 'bg-red-500', borderClassName: 'border-red-500', backgroundClassName: 'bg-red-100' },
  { label: 'nodeUi.colors.indigo', value: 'indigo', className: 'bg-indigo-500', borderClassName: 'border-indigo-500', backgroundClassName: 'bg-indigo-100' },
];

export const NODE_COLOR_MAP: Record<string, string> = {
  emerald: '#10b981',
  blue: '#3b82f6',
  violet: '#8b5cf6',
  rose: '#f43f5e',
  orange: '#f97316',
  amber: '#f59e0b',
  cyan: '#06b6d4',
  pink: '#ec4899',
  slate: '#64748b',
  red: '#ef4444',
  indigo: '#6366f1',
};

export function formatDuration(start: number, end?: number): string {
  const ms = Math.max(0, (end || Date.now()) - start);
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
