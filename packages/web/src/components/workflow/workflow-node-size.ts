import { LOOP_BODY_NODE_TYPE, type NodeTypeDefinition } from '@agent-spaces/shared';

const DEFAULT_NODE_MIN_WIDTH = 140;
const DEFAULT_NODE_WIDTH = 250;
const DEFAULT_NODE_MIN_HEIGHT = 60;
const HEADER_HEIGHT = 33;
const HANDLE_ROW_HEIGHT = 24;
const HANDLE_BOTTOM_PADDING = 16;
const PROPERTY_NODE_MIN_WIDTH = 420;
const PROPERTY_NODE_MIN_HEIGHT = 560;
const VARIABLE_BADGE_BLOCK_VERTICAL_PADDING = 9;
const VARIABLE_BADGE_ROW_HEIGHT = 20;
const WORKFLOW_VARIABLE_SCOPE_PREFIXES = [
  '__data__',
  '__inputs__',
  '__env__',
  '__loop__',
  '__config__',
];

export type WorkflowNodeSize = {
  minWidth: number;
  minHeight: number;
  width: number;
  height: number;
  sourceHandleCount: number;
};

export function getWorkflowNodeVariableReferences(value: unknown, seen = new Set<unknown>()): string[] {
  if (typeof value === 'string') {
    const references: string[] = [];
    const expressionPattern = /\{\{\s*(.*?)\s*\}\}/g;
    for (const match of value.matchAll(expressionPattern)) {
      const expression = match[1]?.trim();
      if (expression && WORKFLOW_VARIABLE_SCOPE_PREFIXES.some(prefix => expression.startsWith(prefix))) {
        references.push(`{{ ${expression} }}`);
      }
    }
    return references;
  }

  if (!value || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap(item => getWorkflowNodeVariableReferences(item, seen));
  }

  return Object.values(value as Record<string, unknown>)
    .flatMap(item => getWorkflowNodeVariableReferences(item, seen));
}

function getWorkflowNodeVariableBadgeHeight(
  definition: NodeTypeDefinition | undefined,
  data: Record<string, unknown>,
): number {
  if (definition?.type === LOOP_BODY_NODE_TYPE || definition?.customView) return 0;
  const referenceCount = new Set(getWorkflowNodeVariableReferences(data)).size;
  return referenceCount > 0
    ? VARIABLE_BADGE_BLOCK_VERTICAL_PADDING + referenceCount * VARIABLE_BADGE_ROW_HEIGHT
    : 0;
}

function getDynamicSourceHandleCount(definition: NodeTypeDefinition | undefined, data: Record<string, unknown>): number {
  const dynamicSource = definition?.handles?.dynamicSource;
  if (!dynamicSource) return 0;

  const values = data[dynamicSource.dataKey];
  const itemCount = Array.isArray(values) ? values.length : 0;
  return itemCount + (dynamicSource.extraCount || 0);
}

function getWorkflowFieldCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

export function getWorkflowNodeSourceHandleCount(
  definition: NodeTypeDefinition | undefined,
  data: Record<string, unknown>,
): number {
  const dynamicSourceHandleCount = getDynamicSourceHandleCount(definition, data);
  if (dynamicSourceHandleCount > 0) return dynamicSourceHandleCount;

  const staticSourceHandleCount = definition?.handles?.sourceHandles?.length || 0;
  if (staticSourceHandleCount > 0) return staticSourceHandleCount;

  return definition?.handles?.source === false ? 0 : 1;
}

export function getWorkflowNodeSize(
  definition: NodeTypeDefinition | undefined,
  data: Record<string, unknown>,
): WorkflowNodeSize {
  const sourceHandleCount = getWorkflowNodeSourceHandleCount(definition, data);
  const isPropertyNodeView = data.nodeDisplayMode === 'properties'
    && definition?.type !== LOOP_BODY_NODE_TYPE
    && !definition?.customView
    && (getWorkflowFieldCount(data.inputFields) > 0 || getWorkflowFieldCount(data.outputs) > 0);
  const minWidth = isPropertyNodeView
    ? Math.max(PROPERTY_NODE_MIN_WIDTH, definition?.customViewMinSize?.width || DEFAULT_NODE_MIN_WIDTH)
    : definition?.customViewMinSize?.width || DEFAULT_NODE_MIN_WIDTH;
  const baseMinHeight = definition?.customViewMinSize?.height || DEFAULT_NODE_MIN_HEIGHT;
  const isLoopBody = definition?.type === LOOP_BODY_NODE_TYPE;
  const propertyMinHeight = isPropertyNodeView ? PROPERTY_NODE_MIN_HEIGHT : baseMinHeight;
  const handleMinHeight = isLoopBody || sourceHandleCount <= 1
    ? propertyMinHeight
    : Math.max(propertyMinHeight, HEADER_HEIGHT + sourceHandleCount * HANDLE_ROW_HEIGHT + HANDLE_BOTTOM_PADDING);
  const minHeight = handleMinHeight + getWorkflowNodeVariableBadgeHeight(definition, data);

  return {
    minWidth,
    minHeight,
    width: Math.max(
      minWidth,
      typeof data.nodeWidth === 'number'
        ? data.nodeWidth
        : typeof data.width === 'number' ? data.width : DEFAULT_NODE_WIDTH,
    ),
    height: Math.max(
      minHeight,
      typeof data.nodeHeight === 'number'
        ? data.nodeHeight
        : typeof data.height === 'number' ? data.height : minHeight,
    ),
    sourceHandleCount,
  };
}
