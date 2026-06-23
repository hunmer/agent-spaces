'use client';

import { useEffect, useMemo, useState } from 'react';
import type { OutputField, PluginConfigField, WorkflowEdge, WorkflowNode } from '@agent-spaces/shared';
import { getCompositeParentId } from '@agent-spaces/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Braces } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getNodeDefinition } from '@/lib/workflow-nodes';
import { pluginApi, type WorkflowPlugin } from '@/lib/workflow-plugin-api';
import { resolveServerAssetUrl } from '@/lib/server';
import { isStructuredOutputFieldType } from './workflow-properties-utils';
import { PluginIcon } from './workflow-plugin-icon';
import { getUpstreamNodeIds } from './workflow-variable-scope';
import { FILE_CHILD_FIELDS } from './workflow-variable-fields';

type VariableField = OutputField & {
  expressionPath?: string;
  children?: VariableField[];
};

export interface WorkflowVariableContext {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  currentNodeId?: string | null;
  enabledPlugins?: string[];
  variables?: OutputField[];
}

interface VariablePickerProps extends WorkflowVariableContext {
  excludeNodeId?: string | null;
  typeFilter?: OutputField['type'] | OutputField['type'][];
  onSelect: (path: string) => void;
  children?: React.ReactNode;
}

function getNodeLabel(node: WorkflowNode, t: (key: string) => string): string {
  const def = getNodeDefinition(node.type);
  const resolveLabel = (v: unknown) => { const s = String(v ?? ''); return s && !s.startsWith('nodes.') ? s : ''; };
  const label = resolveLabel(node.data?.label) || resolveLabel(node.label) || def?.label || node.type;
  return label.startsWith('nodes.') ? t(label) : label;
}

function getNodeOutputs(node: WorkflowNode): OutputField[] {
  return Array.isArray(node.data?.outputs) ? node.data.outputs as OutputField[] : [];
}

function getNodeInputFields(node: WorkflowNode): OutputField[] {
  return Array.isArray(node.data?.inputFields) ? node.data.inputFields as OutputField[] : [];
}

function buildVariablePath(nodeId: string, fieldPath: string): string {
  return `{{ __data__["${nodeId}"].${fieldPath} }}`;
}

function buildInputFieldPath(nodeId: string, fieldPath: string): string {
  return `{{ __inputs__["${nodeId}"].${fieldPath} }}`;
}

function buildLoopVariablePath(fieldPath: string): string {
  return `{{ __loop__.${fieldPath} }}`;
}

function buildConfigPath(pluginId: string, key: string): string {
  return `{{ __config__["${pluginId}"]["${key}"] }}`;
}

function buildEnvPath(fieldPath: string): string {
  return `{{ __env__.${fieldPath} }}`;
}

function unwrapExpressionPath(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  const match = text.match(/^\{\{\s*(.*?)\s*\}\}$/);
  return match ? match[1].trim() : text;
}

function parseVariableExpression(value: unknown): { scope: 'data' | 'inputs' | 'env'; nodeId?: string; fieldPath: string } | null {
  const expression = unwrapExpressionPath(value);
  const nodeScoped = expression.match(/^__(data|inputs)__\["([^"]+)"\]\.(.+)$/);
  if (nodeScoped) {
    return {
      scope: nodeScoped[1] === 'data' ? 'data' : 'inputs',
      nodeId: nodeScoped[2],
      fieldPath: nodeScoped[3],
    };
  }
  const envScoped = expression.match(/^__env__\.(.+)$/);
  if (envScoped) return { scope: 'env', fieldPath: envScoped[1] };
  return null;
}

function findFieldByPath(fields: OutputField[], fieldPath: string): OutputField | null {
  const [key, ...rest] = fieldPath.split('.').filter(Boolean);
  if (!key) return null;
  const field = fields.find(item => item.key === key);
  if (!field) return null;
  if (rest.length === 0) return field;
  return Array.isArray(field.children) ? findFieldByPath(field.children, rest.join('.')) : null;
}

function getFieldsForVariableExpression(value: unknown, nodes: WorkflowNode[], variables: OutputField[]): OutputField | null {
  const parsed = parseVariableExpression(value);
  if (!parsed) return null;
  if (parsed.scope === 'env') return findFieldByPath(variables, parsed.fieldPath);

  const node = nodes.find(item => item.id === parsed.nodeId);
  if (!node) return null;
  const fields = parsed.scope === 'inputs' ? getNodeInputFields(node) : node.type === 'start' ? getNodeInputFields(node) : getNodeOutputs(node);
  return findFieldByPath(fields, parsed.fieldPath);
}

function getArrayItemField(arrayField: OutputField | null): VariableField {
  if (!arrayField) return { key: 'item', type: 'any', expressionPath: 'item' };
  if (arrayField.type === 'array') {
    return {
      key: 'item',
      type: arrayField.children?.length ? 'object' : 'any',
      expressionPath: 'item',
      children: arrayField.children,
    };
  }
  const itemTypeByArrayType: Partial<Record<OutputField['type'], OutputField['type']>> = {
    'string[]': 'string',
    'number[]': 'number',
    'file[]': 'file',
    'image[]': 'image',
    'any[]': 'any',
  };
  return { key: 'item', type: itemTypeByArrayType[arrayField.type] ?? 'any', expressionPath: 'item' };
}

function mapLoopSharedVariables(fields: OutputField[], parentPath = 'vars'): VariableField[] {
  return fields.map((field) => {
    const expressionPath = `${parentPath}.${field.key}`;
    return {
      ...field,
      expressionPath,
      children: field.children ? mapLoopSharedVariables(field.children, expressionPath) : undefined,
    };
  });
}

function buildFieldPath(field: VariableField, parentPath?: string): string {
  if (field.expressionPath) return field.expressionPath;
  return parentPath ? `${parentPath}.${field.key}` : field.key;
}

function normalizeTypeFilter(typeFilter: VariablePickerProps['typeFilter']): OutputField['type'][] {
  if (!typeFilter) return [];
  return Array.isArray(typeFilter) ? typeFilter : [typeFilter];
}

function matchesTypeFilter(fieldType: OutputField['type'] | undefined, typeFilter: OutputField['type'][]): boolean {
  if (!typeFilter.length || !fieldType) return true;
  if (fieldType === 'any' || typeFilter.includes('any')) return true;
  return typeFilter.includes(fieldType);
}

function findLoopParentNode(currentNode: WorkflowNode | null, nodes: WorkflowNode[]): WorkflowNode | null {
  if (!currentNode) return null;

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  let current: WorkflowNode | undefined = currentNode;

  while (current) {
    const parentId = getCompositeParentId(current);
    if (!parentId) return null;

    const parent = nodeById.get(parentId);
    if (!parent) return null;

    if (parent.type === 'loop') return parent;

    if (parent.type === 'loop_body') {
      const loopParentId = getCompositeParentId(parent);
      return loopParentId ? nodeById.get(loopParentId) ?? null : null;
    }

    current = parent;
  }

  return null;
}

function findLoopBodyScopeNode(
  currentNode: WorkflowNode | null,
  nodes: WorkflowNode[],
  loopParentId: string | null,
): WorkflowNode | null {
  if (!currentNode || !loopParentId) return null;

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  let current: WorkflowNode | undefined = currentNode;

  while (current) {
    if (current.type === 'loop_body' && getCompositeParentId(current) === loopParentId) {
      return current;
    }

    const parentId = getCompositeParentId(current);
    if (!parentId) return null;
    current = nodeById.get(parentId);
  }

  return null;
}

function isNodeInScope(node: WorkflowNode, nodes: WorkflowNode[], scopeNodeId: string): boolean {
  const nodeById = new Map(nodes.map((item) => [item.id, item]));
  let current: WorkflowNode | undefined = node;

  while (current) {
    const parentId = getCompositeParentId(current);
    if (!parentId) return false;
    if (parentId === scopeNodeId) return true;
    current = nodeById.get(parentId);
  }

  return false;
}

function getNodeSourceId(node: WorkflowNode): string | null {
  return typeof node.data?.sourceNodeId === 'string' && node.data.sourceNodeId
    ? node.data.sourceNodeId
    : null;
}

function sortNodesByWorkflowConnections(
  visibleNodes: WorkflowNode[],
  allNodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowNode[] {
  if (visibleNodes.length < 2) return visibleNodes;

  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const originalIndex = new Map(allNodes.map((node, index) => [node.id, index]));
  const visibleById = new Map(visibleNodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of visibleNodes) {
    outgoing.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  const addConnection = (source: string, target: string) => {
    if (!visibleIds.has(source) || !visibleIds.has(target) || source === target) return;
    const targets = outgoing.get(source);
    if (!targets || targets.includes(target)) return;
    targets.push(target);
    inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
  };

  for (const edge of edges) {
    addConnection(edge.source, edge.target);
  }

  for (const node of allNodes) {
    const sourceNodeId = getNodeSourceId(node);
    if (sourceNodeId) addConnection(sourceNodeId, node.id);
  }

  const byOriginalOrder = (a: string, b: string) => (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0);
  const queue = [...inDegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id)
    .sort(byOriginalOrder);
  const sortedIds: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) continue;
    sortedIds.push(id);

    for (const target of (outgoing.get(id) ?? []).sort(byOriginalOrder)) {
      const nextDegree = (inDegree.get(target) ?? 1) - 1;
      inDegree.set(target, nextDegree);
      if (nextDegree === 0) {
        queue.push(target);
        queue.sort(byOriginalOrder);
      }
    }
  }

  if (sortedIds.length !== visibleNodes.length) return [...visibleNodes].sort((a, b) => byOriginalOrder(a.id, b.id));
  return sortedIds.map((id) => visibleById.get(id)).filter((node): node is WorkflowNode => Boolean(node));
}

export function getLoopBodyVariableNodes(params: {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  currentNode: WorkflowNode | null;
  upstreamNodeIds: Set<string>;
  activeNodeId: string | null;
}): WorkflowNode[] {
  const {
    nodes,
    edges,
    currentNode,
    upstreamNodeIds,
    activeNodeId,
  } = params;

  const loopParentNode = findLoopParentNode(currentNode, nodes);
  if (!currentNode || !activeNodeId || !loopParentNode) return [];

  const loopBodyScopeNode = findLoopBodyScopeNode(currentNode, nodes, loopParentNode.id);
  if (!loopBodyScopeNode) return [];

  const hidden = new Set([activeNodeId, loopParentNode.id]);
  for (const node of nodes) {
    if (node.type === 'loop_body' && getCompositeParentId(node) === loopParentNode.id) {
      hidden.add(node.id);
    }
  }

  const loopBodyNodes = nodes.filter((node) => (
    upstreamNodeIds.has(node.id)
    && !hidden.has(node.id)
    && node.type !== 'start'
    && isNodeInScope(node, nodes, loopBodyScopeNode.id)
  ));

  return sortNodesByWorkflowConnections(loopBodyNodes, nodes, edges);
}

function VariableFieldMenu({
  fields,
  nodeId,
  parentPath,
  typeFilter,
  onSelect,
}: {
  fields: VariableField[];
  nodeId: string;
  parentPath?: string;
  typeFilter: OutputField['type'][];
  onSelect: (nodeId: string, fieldPath: string) => void;
}) {
  return (
    <>
      {fields.map((field, index) => {
        const path = buildFieldPath(field, parentPath);
        const key = `${path}-${index}`;
        const selectable = matchesTypeFilter(field.type, typeFilter);
        if (isStructuredOutputFieldType(field.type) && field.children?.length) {
          return (
            <DropdownMenuSub key={key}>
              <DropdownMenuSubTrigger className="text-xs">
                <span className="mr-1.5 font-mono text-[10px] text-muted-foreground">{field.type}</span>
                <span className="truncate">{field.key}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-[180px]">
                <DropdownMenuItem
                  className="text-xs"
                  disabled={!selectable}
                  onClick={() => onSelect(nodeId, path)}
                >
                  <span className="mr-1.5 font-mono text-[10px] text-muted-foreground">{field.type}</span>
                  <span className="truncate">{field.key}</span>
                </DropdownMenuItem>
                <VariableFieldMenu
                  fields={field.children}
                  nodeId={nodeId}
                  parentPath={path}
                  typeFilter={typeFilter}
                  onSelect={onSelect}
                />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          );
        }

        if (field.type === 'file') {
          return (
            <DropdownMenuSub key={key}>
              <DropdownMenuSubTrigger className="text-xs">
                <span className="mr-1.5 font-mono text-[10px] text-muted-foreground">file</span>
                <span className="truncate">{field.key}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-[180px]">
                {FILE_CHILD_FIELDS.map((child) => (
                  <DropdownMenuItem
                    key={child.key}
                    className="text-xs"
                    disabled={!matchesTypeFilter(child.type, typeFilter)}
                    onClick={() => onSelect(nodeId, `${path}.${child.key}`)}
                  >
                    <span className="mr-1.5 font-mono text-[10px] text-muted-foreground">{child.type}</span>
                    <span className="truncate">{child.key}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          );
        }

        return (
          <DropdownMenuItem
            key={key}
            className="text-xs"
            disabled={!selectable}
            onClick={() => onSelect(nodeId, path)}
          >
            <span className="mr-1.5 font-mono text-[10px] text-muted-foreground">{field.type}</span>
            <span className="truncate">{field.key}</span>
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

function EmptyMenuItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 py-1.5 text-xs text-muted-foreground">
      {children}
    </div>
  );
}

export function WorkflowVariablePicker({
  nodes,
  edges,
  currentNodeId,
  excludeNodeId,
  enabledPlugins = [],
  variables = [],
  typeFilter,
  onSelect,
  children,
}: VariablePickerProps) {
  const t = useTranslations('workflows');
  const normalizedTypeFilter = useMemo(() => normalizeTypeFilter(typeFilter), [typeFilter]);
  const activeNodeId = currentNodeId || excludeNodeId || null;
  const currentNode = useMemo(
    () => nodes.find((node) => node.id === activeNodeId) ?? null,
    [activeNodeId, nodes],
  );
  const [plugins, setPlugins] = useState<WorkflowPlugin[]>([]);

  useEffect(() => {
    if (!enabledPlugins.length) {
      setPlugins([]);
      return;
    }

    let cancelled = false;
    pluginApi.listWorkflowPlugins()
      .then((items) => {
        if (cancelled) return;
        const enabled = new Set(enabledPlugins);
        setPlugins((items as WorkflowPlugin[]).filter((plugin) => enabled.has(plugin.id) && plugin.config?.length));
      })
      .catch(() => {
        if (!cancelled) setPlugins([]);
      });

    return () => {
      cancelled = true;
    };
  }, [enabledPlugins]);

  const loopParentNode = useMemo(() => {
    return findLoopParentNode(currentNode, nodes);
  }, [currentNode, nodes]);

  const isInLoopBody = Boolean(loopParentNode && currentNode);
  const upstreamNodeIds = useMemo(
    () => activeNodeId ? getUpstreamNodeIds(nodes, edges, activeNodeId) : new Set<string>(),
    [activeNodeId, nodes, edges],
  );

  const otherNodes = useMemo(() => {
    if (!activeNodeId) return [];
    const hidden = new Set([activeNodeId]);
    if (isInLoopBody && loopParentNode) {
      hidden.add(loopParentNode.id);
      for (const node of nodes) {
        if (node.type === 'loop_body' && getCompositeParentId(node) === loopParentNode.id) hidden.add(node.id);
      }
    }
    return sortNodesByWorkflowConnections(
      nodes.filter((node) => upstreamNodeIds.has(node.id) && !hidden.has(node.id)),
      nodes,
      edges,
    );
  }, [activeNodeId, upstreamNodeIds, isInLoopBody, loopParentNode, nodes, edges]);

  const workflowInputNode = useMemo(
    () => nodes.find((node) => node.type === 'start') ?? null,
    [nodes],
  );
  const workflowInputFields = workflowInputNode ? getNodeInputFields(workflowInputNode) : [];
  const inputMenuNodes = otherNodes.filter((node) => node.type !== 'start' && node.type !== 'end');
  const outputMenuNodes = inputMenuNodes;
  const loopBodyNodes = useMemo(
    () => getLoopBodyVariableNodes({
      nodes,
      edges,
      currentNode,
      upstreamNodeIds,
      activeNodeId,
    }),
    [nodes, edges, currentNode, upstreamNodeIds, activeNodeId],
  );
  const loopVariableFields = useMemo<VariableField[]>(() => {
    if (!isInLoopBody || !loopParentNode) return [];
    const fields: VariableField[] = [{ key: 'index', type: 'number', expressionPath: 'index' }];
    if (loopParentNode.data?.loopType === 'array') {
      fields.push(getArrayItemField(getFieldsForVariableExpression(loopParentNode.data?.arrayPath, nodes, variables)));
    }
    const sharedVariables = Array.isArray(loopParentNode.data?.sharedVariables)
      ? loopParentNode.data.sharedVariables as OutputField[]
      : [];
    fields.push(...mapLoopSharedVariables(sharedVariables));
    return fields;
  }, [isInLoopBody, loopParentNode, nodes, variables]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        {children || (
          <span
            role="button"
            tabIndex={0}
            className="inline-flex items-center justify-center h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent"
            title={t('variablePicker.insertVariable')}
          >
            <Braces className="h-3.5 w-3.5" />
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {workflowInputNode && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-xs font-medium">{t('variablePicker.workflowInput')}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-[180px]">
              {workflowInputFields.length > 0 ? (
                <VariableFieldMenu
                  fields={workflowInputFields}
                  nodeId={workflowInputNode.id}
                  typeFilter={normalizedTypeFilter}
                  onSelect={(nodeId, fieldPath) => onSelect(buildVariablePath(nodeId, fieldPath))}
                />
              ) : (
                <EmptyMenuItem>{t('variablePicker.noInputFields')}</EmptyMenuItem>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs font-medium">{t('variablePicker.workflowVariables')}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-[180px]">
            {variables.length > 0 ? (
              <VariableFieldMenu
                fields={variables}
                nodeId="__env__"
                typeFilter={normalizedTypeFilter}
                onSelect={(_nodeId, fieldPath) => onSelect(buildEnvPath(fieldPath))}
              />
            ) : (
              <EmptyMenuItem>{t('variablePicker.noVariables')}</EmptyMenuItem>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs font-medium">{t('variablePicker.nodeInput')}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            {(() => {
              const nodesWithFields = inputMenuNodes.filter((node) => getNodeInputFields(node).length > 0);
              return nodesWithFields.length > 0 ? nodesWithFields.map((node) => (
                <DropdownMenuSub key={node.id}>
                  <DropdownMenuSubTrigger className="text-xs">
                    <span className="truncate">{getNodeLabel(node, t)}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-[180px]">
                    <VariableFieldMenu
                      fields={getNodeInputFields(node)}
                      nodeId={node.id}
                      typeFilter={normalizedTypeFilter}
                      onSelect={(nodeId, fieldPath) => onSelect(buildInputFieldPath(nodeId, fieldPath))}
                    />
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )) : <EmptyMenuItem>{t('variablePicker.noConnectedNodes')}</EmptyMenuItem>;
            })()}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs font-medium">{t('variablePicker.nodeOutput')}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            {(() => {
              const nodesWithFields = outputMenuNodes.filter((node) => getNodeOutputs(node).length > 0);
              return nodesWithFields.length > 0 ? nodesWithFields.map((node) => (
                <DropdownMenuSub key={node.id}>
                  <DropdownMenuSubTrigger className="text-xs">
                    <span className="truncate">{getNodeLabel(node, t)}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-[180px]">
                    <VariableFieldMenu
                      fields={getNodeOutputs(node)}
                      nodeId={node.id}
                      typeFilter={normalizedTypeFilter}
                      onSelect={(nodeId, fieldPath) => onSelect(buildVariablePath(nodeId, fieldPath))}
                    />
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )) : <EmptyMenuItem>{t('variablePicker.noConnectedNodes')}</EmptyMenuItem>;
            })()}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {loopBodyNodes.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-xs font-medium">{t('variablePicker.loopBodyVariables')}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              {loopBodyNodes.map((node) => (
                <DropdownMenuSub key={node.id}>
                  <DropdownMenuSubTrigger className="text-xs">
                    <span className="truncate">{getNodeLabel(node, t)}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-[180px]">
                    {getNodeOutputs(node).length > 0 ? (
                      <VariableFieldMenu
                        fields={getNodeOutputs(node)}
                        nodeId={node.id}
                        typeFilter={normalizedTypeFilter}
                        onSelect={(nodeId, fieldPath) => onSelect(buildVariablePath(nodeId, fieldPath))}
                      />
                    ) : (
                      <EmptyMenuItem>{t('variablePicker.noOutputFields')}</EmptyMenuItem>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {loopVariableFields.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-xs font-medium">{t('variablePicker.intermediateVariables')}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              <VariableFieldMenu
                fields={loopVariableFields}
                nodeId="__loop__"
                typeFilter={normalizedTypeFilter}
                onSelect={(_nodeId, fieldPath) => onSelect(buildLoopVariablePath(fieldPath))}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {plugins.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-xs font-medium">{t('variablePicker.configProperties')}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              {plugins.map((plugin) => (
                <DropdownMenuSub key={plugin.id}>
                  <DropdownMenuSubTrigger className="text-xs">
                    <PluginIcon
                      className="h-4 w-4 shrink-0"
                      source={plugin.iconPath
                        ? { type: 'url', url: resolveServerAssetUrl(`/api/plugins/${plugin.id}/icon`) }
                        : { type: 'builtin', variant: 'local' }}
                    />
                    <span className="truncate">{plugin.name}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-[180px]">
                    {(plugin.config as PluginConfigField[] | undefined)?.map((field) => (
                      <DropdownMenuItem
                        key={field.key}
                        className="text-xs"
                        disabled={!matchesTypeFilter(field.type, normalizedTypeFilter)}
                        onClick={() => onSelect(buildConfigPath(plugin.id, field.key))}
                      >
                        <span className="mr-1 font-mono text-[10px] text-muted-foreground">{field.type}</span>
                        <span className="truncate">{field.label}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function VariableReference({ path }: { path: string }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-blue-600 dark:text-blue-400">
      {path}
    </code>
  );
}
