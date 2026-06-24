'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import type { JSONContent } from '@tiptap/react';
import { EditorContent, ReactRenderer, useEditor } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import Suggestion, { exitSuggestion, type SuggestionProps } from '@tiptap/suggestion';
import type { OutputField, PluginConfigField, WorkflowNode } from '@agent-spaces/shared';
import { getCompositeParentId } from '@agent-spaces/shared';
import { Braces, Package, Repeat, Variable, Workflow, X } from 'lucide-react';
import tippy, { type Instance } from 'tippy.js';
import { Badge } from '@/components/ui/badge';
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { resolveServerAssetUrl } from '@/lib/server';
import { getNodeDefinition } from '@/lib/workflow-nodes';
import { pluginApi, type WorkflowPlugin } from '@/lib/workflow-plugin-api';
import { FIELD_TYPES } from './workflow-properties-utils';
import { WorkflowVariablePicker, type WorkflowVariableContext } from './workflow-variable-picker';
import { WorkflowNodeDefinitionIcon, type WorkflowNodeIconDefinition } from './workflow-node-icon';
import { PluginIcon } from './workflow-plugin-icon';
import {
  findFieldByPath,
  getFieldsForVariableExpression,
  normalizeVariableFieldPath,
  parseVariableExpression,
} from './workflow-variable-path';
import { getUpstreamNodeIds } from './workflow-variable-scope';
import { FILE_CHILD_FIELDS } from './workflow-variable-fields';

type EditorRange = { from: number; to: number };
type VariableSuggestionCategory = 'workflow-input' | 'workflow-variable' | 'node-input' | 'node-output' | 'loop' | 'plugin-config';
type VariableSuggestionItem = {
  id: string;
  title: string;
  description: string;
  path: string;
  category: VariableSuggestionCategory;
  type?: OutputField['type'] | PluginConfigField['type'];
  groupIcon?: 'workflow' | 'variable' | 'loop' | 'plugin';
  nodeIconDefinition?: WorkflowNodeIconDefinition;
  pluginIconSource?: Parameters<typeof PluginIcon>[0]['source'];
  [key: string]: unknown;
};

type VariableField = OutputField & {
  expressionPath?: string;
  children?: VariableField[];
};

const PURE_VARIABLE_PATTERN = /^\s*\{\{\s*([^{}]*?)\s*\}\}\s*$/;
const NODE_VARIABLE_PATTERN = /^__(?:data|inputs)__\["([^"]+)"\]\.?(.*)$/;
const CONFIG_VARIABLE_PATTERN = /^__config__\["([^"]+)"\]\["([^"]+)"\]$/;
const LOOP_VARIABLE_PATTERN = /^__loop__\.?(.*)$/;
const VARIABLE_TOKEN_PATTERN = /\{\{\s*[^{}]+?\s*\}\}/g;
const variableHighlightPluginKey = new PluginKey('workflowVariableHighlight');
const variableSuggestionPluginKey = new PluginKey('workflowVariableSuggestion');

function getVariableExpression(value: string | number): string | null {
  const match = String(value).match(PURE_VARIABLE_PATTERN);
  return match?.[1]?.trim() || null;
}

function normalizeVariableExpressionForCompare(value: string | number): string | null {
  const expression = getVariableExpression(value);
  return expression ? expression.replace(/\s+/g, '') : null;
}

function getVariableBadgeLabel(
  value: string | number,
  variableContext?: WorkflowVariableContext,
): string | null {
  const expression = getVariableExpression(value);
  if (!expression) return null;

  const nodeMatch = expression.match(NODE_VARIABLE_PATTERN);
  if (nodeMatch) {
    const [, nodeId, fieldPath] = nodeMatch;
    const node = variableContext?.nodes.find((item) => item.id === nodeId);
    const nodeLabel = node?.label || nodeId;
    const normalizedFieldPath = normalizeVariableFieldPath(fieldPath);
    return normalizedFieldPath ? `${nodeLabel}.${normalizedFieldPath}` : nodeLabel;
  }

  const configMatch = expression.match(CONFIG_VARIABLE_PATTERN);
  if (configMatch) return `${configMatch[1]}.${configMatch[2]}`;

  const loopMatch = expression.match(LOOP_VARIABLE_PATTERN);
  if (loopMatch) return loopMatch[1] ? `loop.${loopMatch[1]}` : 'loop';

  return expression;
}

function createTextContent(value: string | number): JSONContent {
  const lines = String(value).split('\n');
  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : undefined,
    })),
  };
}

function getEditorText(editor: Editor): string {
  return editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n');
}

function normalizeSuggestionQuery(value: string) {
  return value.toLowerCase().replace(/[{}\s]/g, '');
}

function getNodeLabel(node: WorkflowNode): string {
  const def = getNodeDefinition(node.type);
  const resolveLabel = (v: unknown) => { const s = String(v ?? ''); return s && !s.startsWith('nodes.') ? s : ''; };
  return resolveLabel(node.data?.label) || resolveLabel(node.label) || def?.label || node.type;
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

function isConfigVariableReference(value: string | number): boolean {
  const expression = getVariableExpression(value);
  return Boolean(expression?.match(CONFIG_VARIABLE_PATTERN));
}

function isConfigVariableReferenceMissing(value: string | number, plugins: WorkflowPlugin[]): boolean {
  const expression = getVariableExpression(value);
  const match = expression?.match(CONFIG_VARIABLE_PATTERN);
  if (!match) return false;
  const [, pluginId, key] = match;
  const plugin = plugins.find((item) => item.id === pluginId);
  if (!plugin) return true;
  return !(plugin.config as PluginConfigField[] | undefined)?.some((field) => field.key === key);
}

function isVariableReferenceMissing(
  value: string | number,
  variableContext?: WorkflowVariableContext,
  variableItems?: VariableSuggestionItem[],
): boolean {
  const expression = normalizeVariableExpressionForCompare(value);
  if (!expression) return false;

  if (variableContext) {
    if (isConfigVariableReference(value)) return false;
    const parsed = parseVariableExpression(value);
    if (!parsed) return false;
    if (parsed.scope === 'env') return !findFieldByPath(variableContext.variables ?? [], parsed.fieldPath);
    return !getFieldsForVariableExpression(value, variableContext.nodes, variableContext.variables ?? []);
  }

  if (variableItems) {
    const hasConfigItems = variableItems.some((item) => item.category === 'plugin-config');
    if (isConfigVariableReference(value) && !hasConfigItems) return false;
    return !variableItems.some((item) => normalizeVariableExpressionForCompare(item.path) === expression);
  }

  return false;
}

function useEnabledWorkflowPlugins(variableContext?: WorkflowVariableContext): {
  plugins: WorkflowPlugin[];
  pluginsLoaded: boolean;
  hasPluginContext: boolean;
} {
  const [plugins, setPlugins] = useState<WorkflowPlugin[]>([]);
  const [pluginsLoaded, setPluginsLoaded] = useState(false);

  useEffect(() => {
    const enabledPlugins = variableContext?.enabledPlugins ?? [];
    if (!variableContext?.enabledPlugins) {
      setPlugins([]);
      setPluginsLoaded(false);
      return;
    }

    if (!enabledPlugins.length) {
      setPlugins([]);
      setPluginsLoaded(true);
      return;
    }

    setPluginsLoaded(false);
    let cancelled = false;
    pluginApi.listWorkflowPlugins()
      .then((items) => {
        if (cancelled) return;
        const enabled = new Set(enabledPlugins);
        setPlugins((items as WorkflowPlugin[]).filter((plugin) => enabled.has(plugin.id) && plugin.config?.length));
        setPluginsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setPlugins([]);
          setPluginsLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [variableContext?.enabledPlugins]);

  return { plugins, pluginsLoaded, hasPluginContext: Boolean(variableContext?.enabledPlugins) };
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

function normalizeTypeFilter(typeFilter: OutputField['type'] | OutputField['type'][] | undefined): OutputField['type'][] {
  if (!typeFilter) return [];
  return Array.isArray(typeFilter) ? typeFilter : [typeFilter];
}

function matchesTypeFilter(fieldType: OutputField['type'] | PluginConfigField['type'] | undefined, typeFilter: OutputField['type'][]): boolean {
  if (!typeFilter.length || !fieldType) return true;
  if (fieldType === 'any' || typeFilter.includes('any')) return true;
  const isStringLikeField = fieldType === 'string' || fieldType === 'select';
  const acceptsStringLike = typeFilter.includes('string') || typeFilter.includes('select');
  if (isStringLikeField && acceptsStringLike) return true;
  return typeFilter.includes(fieldType as OutputField['type']);
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

function pushFieldItems(
  items: VariableSuggestionItem[],
  fields: VariableField[],
  buildPath: (fieldPath: string) => string,
  group: string,
  category: VariableSuggestionCategory,
  typeFilter: OutputField['type'][],
  groupMeta: Pick<VariableSuggestionItem, 'groupIcon' | 'nodeIconDefinition' | 'pluginIconSource'> = {},
  parentPath?: string,
) {
  for (const field of fields) {
    const fieldPath = buildFieldPath(field, parentPath);
    const path = buildPath(fieldPath);
    if (matchesTypeFilter(field.type, typeFilter)) {
      items.push({
        id: path,
        title: fieldPath,
        description: group,
        path,
        category,
        type: field.type,
        ...groupMeta,
      });
    }

    if (field.type === 'file') {
      for (const child of FILE_CHILD_FIELDS) {
        const childPath = `${fieldPath}.${child.key}`;
        if (!matchesTypeFilter(child.type, typeFilter)) continue;
        const childVariablePath = buildPath(childPath);
        items.push({
          id: childVariablePath,
          title: childPath,
          description: group,
          path: childVariablePath,
          category,
          type: child.type,
          ...groupMeta,
        });
      }
    }

    if (field.children?.length) {
      pushFieldItems(items, field.children, buildPath, group, category, typeFilter, groupMeta, fieldPath);
    }
  }
}

function buildVariableSuggestionItems({
  variableContext,
  typeFilter,
  plugins,
}: {
  variableContext?: WorkflowVariableContext;
  typeFilter?: OutputField['type'] | OutputField['type'][];
  plugins: WorkflowPlugin[];
}): VariableSuggestionItem[] {
  if (!variableContext?.currentNodeId) return [];

  const { nodes, edges, currentNodeId, variables = [] } = variableContext;
  const normalizedTypeFilter = normalizeTypeFilter(typeFilter);
  const currentNode = nodes.find((node) => node.id === currentNodeId) ?? null;
  const loopParentNode = findLoopParentNode(currentNode, nodes);
  const isInLoopBody = Boolean(loopParentNode && currentNode);
  const upstreamNodeIds = getUpstreamNodeIds(nodes, edges, currentNodeId);
  const hidden = new Set([currentNodeId]);

  if (isInLoopBody && loopParentNode) {
    hidden.add(loopParentNode.id);
    for (const node of nodes) {
      if (node.type === 'loop_body' && getCompositeParentId(node) === loopParentNode.id) hidden.add(node.id);
    }
  }

  const otherNodes = nodes.filter((node) => upstreamNodeIds.has(node.id) && !hidden.has(node.id));
  const workflowInputNode = nodes.find((node) => node.type === 'start') ?? null;
  const items: VariableSuggestionItem[] = [];

  if (workflowInputNode) {
    pushFieldItems(
      items,
      getNodeInputFields(workflowInputNode),
      (fieldPath) => buildVariablePath(workflowInputNode.id, fieldPath),
      'workflow input',
      'workflow-input',
      normalizedTypeFilter,
      { nodeIconDefinition: getNodeDefinition(workflowInputNode.type) },
    );
  }

  pushFieldItems(items, variables, buildEnvPath, 'workflow variable', 'workflow-variable', normalizedTypeFilter, { groupIcon: 'variable' });

  for (const node of otherNodes.filter((item) => item.type !== 'start' && item.type !== 'end')) {
    const nodeLabel = getNodeLabel(node);
    const nodeIconDefinition = getNodeDefinition(node.type);
    pushFieldItems(items, getNodeInputFields(node), (fieldPath) => buildInputFieldPath(node.id, fieldPath), `${nodeLabel} input`, 'node-input', normalizedTypeFilter, { nodeIconDefinition });
    pushFieldItems(items, getNodeOutputs(node), (fieldPath) => buildVariablePath(node.id, fieldPath), `${nodeLabel} output`, 'node-output', normalizedTypeFilter, { nodeIconDefinition });
  }

  if (isInLoopBody && loopParentNode) {
    const loopFields: VariableField[] = [{ key: 'index', type: 'number', expressionPath: 'index' }];
    if (loopParentNode.data?.loopType === 'array') {
      loopFields.push(getArrayItemField(getFieldsForVariableExpression(loopParentNode.data?.arrayPath, nodes, variables)));
    }
    const sharedVariables = Array.isArray(loopParentNode.data?.sharedVariables)
      ? loopParentNode.data.sharedVariables as OutputField[]
      : [];
    loopFields.push(...mapLoopSharedVariables(sharedVariables));
    pushFieldItems(items, loopFields, buildLoopVariablePath, 'loop', 'loop', normalizedTypeFilter, { nodeIconDefinition: getNodeDefinition(loopParentNode.type) });
  }

  for (const plugin of plugins) {
    for (const field of plugin.config as PluginConfigField[] | undefined ?? []) {
      if (!matchesTypeFilter(field.type, normalizedTypeFilter)) continue;
      const path = buildConfigPath(plugin.id, field.key);
      items.push({
        id: path,
        title: `${plugin.name}.${field.label || field.key}`,
        description: 'plugin config',
        path,
        category: 'plugin-config',
        type: field.type,
        groupIcon: 'plugin',
        pluginIconSource: plugin.iconPath
          ? { type: 'url', url: resolveServerAssetUrl(`/api/plugins/${plugin.id}/icon`) }
          : { type: 'builtin', variant: 'local' },
      });
    }
  }

  return items;
}

function createVariableHighlightExtension(
  variableItemsRef: React.RefObject<VariableSuggestionItem[]>,
  variableContextRef: React.RefObject<WorkflowVariableContext | undefined>,
) {
  return Extension.create({
    name: 'workflowVariableHighlight',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: variableHighlightPluginKey,
          props: {
            decorations(state) {
              const decorations: Decoration[] = [];
              state.doc.descendants((node, pos) => {
                if (!node.isText || !node.text) return;
                for (const match of node.text.matchAll(VARIABLE_TOKEN_PATTERN)) {
                  if (match.index === undefined) continue;
                  const missing = isVariableReferenceMissing(match[0], variableContextRef.current, variableItemsRef.current);
                  decorations.push(Decoration.inline(
                    pos + match.index,
                    pos + match.index + match[0].length,
                    { class: cn('workflow-variable-token', missing && 'workflow-variable-token-missing') },
                  ));
                }
              });
              return DecorationSet.create(state.doc, decorations);
            },
          },
        }),
      ];
    },
  });
}

type WorkflowVariableSuggestionListRef = {
  onKeyDown: ({ event }: { event: KeyboardEvent }) => boolean;
};

type WorkflowVariableSuggestionListProps = {
  items: VariableSuggestionItem[];
  command: (item: VariableSuggestionItem) => void;
};

const VARIABLE_SUGGESTION_CATEGORIES: Array<{ value: VariableSuggestionCategory; label: string }> = [
  { value: 'workflow-input', label: '工作流输入' },
  { value: 'workflow-variable', label: '工作流变量' },
  { value: 'node-input', label: '节点输入' },
  { value: 'node-output', label: '节点输出' },
  { value: 'plugin-config', label: '配置属性' },
  { value: 'loop', label: '循环变量' },
];

function groupVariableSuggestionItems(items: VariableSuggestionItem[]) {
  const groups: Array<{
    title: string;
    groupIcon?: VariableSuggestionItem['groupIcon'];
    nodeIconDefinition?: WorkflowNodeIconDefinition;
    pluginIconSource?: VariableSuggestionItem['pluginIconSource'];
    items: Array<VariableSuggestionItem & { flatIndex: number }>;
  }> = [];
  const groupMap = new Map<string, Array<VariableSuggestionItem & { flatIndex: number }>>();
  items.forEach((item, flatIndex) => {
    const title = item.description || 'other';
    const existing = groupMap.get(title);
    if (existing) {
      existing.push({ ...item, flatIndex });
      return;
    }
    const nextGroup: Array<VariableSuggestionItem & { flatIndex: number }> = [{ ...item, flatIndex }];
    groupMap.set(title, nextGroup);
    groups.push({
      title,
      groupIcon: item.groupIcon,
      nodeIconDefinition: item.nodeIconDefinition,
      pluginIconSource: item.pluginIconSource,
      items: nextGroup,
    });
  });
  return groups;
}

function WorkflowVariableSuggestionGroupIcon({
  groupIcon,
  nodeIconDefinition,
  pluginIconSource,
}: {
  groupIcon?: VariableSuggestionItem['groupIcon'];
  nodeIconDefinition?: WorkflowNodeIconDefinition;
  pluginIconSource?: VariableSuggestionItem['pluginIconSource'];
}) {
  if (pluginIconSource) {
    return <PluginIcon source={pluginIconSource} className="h-3.5 w-3.5 shrink-0" />;
  }

  if (nodeIconDefinition) {
    return <WorkflowNodeDefinitionIcon definition={nodeIconDefinition} className="h-3.5 w-3.5 shrink-0" />;
  }

  if (groupIcon === 'variable') return <Variable className="h-3.5 w-3.5 shrink-0" />;
  if (groupIcon === 'loop') return <Repeat className="h-3.5 w-3.5 shrink-0" />;
  if (groupIcon === 'plugin') return <Package className="h-3.5 w-3.5 shrink-0" />;
  if (groupIcon === 'workflow') return <Workflow className="h-3.5 w-3.5 shrink-0" />;
  return <Braces className="h-3.5 w-3.5 shrink-0" />;
}

const WorkflowVariableSuggestionList = forwardRef<
  WorkflowVariableSuggestionListRef,
  WorkflowVariableSuggestionListProps
>(function WorkflowVariableSuggestionList({ items, command }, ref) {
  const availableCategories = useMemo(() => {
    const itemCategories = new Set(items.map((item) => item.category));
    return VARIABLE_SUGGESTION_CATEGORIES.filter((category) => itemCategories.has(category.value));
  }, [items]);
  const [activeCategory, setActiveCategory] = useState<VariableSuggestionCategory | 'all'>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const visibleItems = useMemo(() => (
    activeCategory === 'all' ? items : items.filter((item) => item.category === activeCategory)
  ), [activeCategory, items]);
  const groupedItems = useMemo(() => groupVariableSuggestionItems(visibleItems), [visibleItems]);

  useEffect(() => {
    setActiveCategory((current) => {
      if (current === 'all') return current;
      return availableCategories.some((category) => category.value === current) ? current : 'all';
    });
  }, [availableCategories]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [activeCategory, items]);

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const selectItem = useCallback((index: number) => {
    const item = visibleItems[index];
    if (item) command(item);
  }, [visibleItems, command]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!visibleItems.length) return false;

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((prev) => (prev + visibleItems.length - 1) % visibleItems.length);
        return true;
      }

      if (event.key === 'ArrowDown' || event.key === 'Tab') {
        event.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % visibleItems.length);
        return true;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        selectItem(selectedIndex);
        return true;
      }

      return false;
    },
  }), [selectItem, selectedIndex, visibleItems]);

  if (!items.length) {
    return (
      <div className="suggestion-menu workflow-variable-suggestion-menu">
        <div className="suggestion-empty">No matching variables</div>
      </div>
    );
  }

  return (
    <div className="suggestion-menu workflow-variable-suggestion-menu">
      <div className="workflow-variable-suggestion-tabs">
        <button
          type="button"
          className="workflow-variable-suggestion-tab"
          data-active={activeCategory === 'all' ? 'true' : 'false'}
          onMouseDown={(e) => {
            e.preventDefault();
            setActiveCategory('all');
          }}
        >
          全部
        </button>
        {availableCategories.map((category) => (
          <button
            key={category.value}
            type="button"
            className="workflow-variable-suggestion-tab"
            data-active={activeCategory === category.value ? 'true' : 'false'}
            onMouseDown={(e) => {
              e.preventDefault();
              setActiveCategory(category.value);
            }}
          >
            {category.label}
          </button>
        ))}
      </div>
      <div className="suggestion-list workflow-variable-suggestion-list" ref={listRef}>
        {groupedItems.map((group) => (
            <div key={group.title} className="workflow-variable-suggestion-group">
              <div className="workflow-variable-suggestion-group-title">
                <WorkflowVariableSuggestionGroupIcon
                  groupIcon={group.groupIcon}
                  nodeIconDefinition={group.nodeIconDefinition}
                  pluginIconSource={group.pluginIconSource}
                />
                <span className="truncate">{group.title}</span>
              </div>
              {group.items.map((item) => {
                const selected = item.flatIndex === selectedIndex;
                return (
                  <div
                    key={item.id}
                    className="suggestion-item workflow-variable-suggestion-item"
                    data-selected={selected ? 'true' : 'false'}
                    onMouseEnter={() => setSelectedIndex(item.flatIndex)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      command(item);
                  }}
                >
                  <div className="workflow-variable-suggestion-row">
                    <div className="suggestion-title">{item.title}</div>
                    {item.type ? <div className="workflow-variable-suggestion-type">{item.type}</div> : null}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
});

function createVariableSuggestionRenderer(pluginKey?: PluginKey) {
  let component: ReactRenderer | null = null;
  let popup: Instance[] | null = null;

  const createListProps = (props: SuggestionProps<VariableSuggestionItem>) => ({
    ...props,
    command: (item: VariableSuggestionItem) => {
      props.command(item);
      exitSuggestion(props.editor.view, pluginKey);
    },
  });

  return {
    onStart(props: SuggestionProps<VariableSuggestionItem>) {
      component = new ReactRenderer(WorkflowVariableSuggestionList, {
        props: createListProps(props),
        editor: props.editor,
      });
      if (!props.clientRect) return;
      const getReferenceClientRect = () => props.clientRect?.() ?? new DOMRect();
      popup = tippy('body', {
        getReferenceClientRect,
        appendTo: () => document.body,
        content: component.element,
        showOnCreate: true,
        interactive: true,
        trigger: 'manual',
        placement: 'bottom-start',
      });
    },
    onUpdate(props: SuggestionProps<VariableSuggestionItem>) {
      component?.updateProps(createListProps(props));
      if (popup?.[0] && props.clientRect) {
        popup[0].setProps({ getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect() });
      }
    },
    onKeyDown(props: { event: KeyboardEvent }) {
      if (component?.ref && typeof component.ref === 'object' && 'onKeyDown' in component.ref) {
        return (component.ref as WorkflowVariableSuggestionListRef).onKeyDown(props);
      }
      return false;
    },
    onExit() {
      popup?.[0]?.destroy();
      component?.destroy();
      popup = null;
      component = null;
    },
  };
}

function createVariableSuggestionExtension(variableItemsRef: React.RefObject<VariableSuggestionItem[]>) {
  return Extension.create({
    name: 'workflowVariableSuggestion',
    addOptions() {
      return {
        suggestion: {
          char: '{{',
          allowedPrefixes: null,
          items: ({ query }: { query: string }) => {
            const keyword = normalizeSuggestionQuery(query);
            return variableItemsRef.current
              .filter((item) => normalizeSuggestionQuery(`${item.title} ${item.description} ${item.path}`).includes(keyword))
              .slice(0, 40);
          },
          command: ({
            editor,
            range,
            props,
          }: {
            editor: Editor;
            range: EditorRange;
            props: VariableSuggestionItem;
          }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent(props.path)
              .run();
          },
          render: () => createVariableSuggestionRenderer(variableSuggestionPluginKey),
        },
      };
    },
    addProseMirrorPlugins() {
      return [
        Suggestion({
          pluginKey: variableSuggestionPluginKey,
          editor: this.editor,
          ...this.options.suggestion,
        }),
      ];
    },
  });
}

function WorkflowVariableTiptapInput({
  value,
  readOnly,
  placeholder,
  variableItems,
  variableContext,
  className,
  onChange,
  onFocus,
  onBlur,
}: {
  value: string | number;
  readOnly: boolean;
  placeholder?: string;
  variableItems: VariableSuggestionItem[];
  variableContext?: WorkflowVariableContext;
  className?: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const variableItemsRef = useRef(variableItems);
  const variableContextRef = useRef(variableContext);

  const extensions = useMemo(() => [
    StarterKit.configure({
      heading: false,
      bulletList: false,
      orderedList: false,
      blockquote: false,
      codeBlock: false,
      horizontalRule: false,
    }),
    createVariableHighlightExtension(variableItemsRef, variableContextRef),
    createVariableSuggestionExtension(variableItemsRef),
  ], []);

  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    editable: !readOnly,
    content: createTextContent(value),
    editorProps: {
      attributes: {
        'data-slot': 'input-group-control',
        class: cn('workflow-variable-editor', className),
        'data-placeholder': placeholder ?? '',
      },
    },
    onUpdate: ({ editor }) => onChange(getEditorText(editor)),
    onFocus,
    onBlur,
  });

  useEffect(() => {
    variableItemsRef.current = variableItems;
    variableContextRef.current = variableContext;
    if (!editor) return;
    editor.view.dispatch(editor.state.tr.setMeta(variableHighlightPluginKey, { refreshedAt: Date.now() }));
  }, [editor, variableContext, variableItems]);

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor) return;
    const nextValue = String(value);
    if (getEditorText(editor) === nextValue) return;
    editor.commands.setContent(createTextContent(nextValue), { emitUpdate: false });
  }, [editor, value]);

  return <EditorContent editor={editor} className="min-w-0 flex-1 self-stretch" />;
}

export function VariableBadgeInput({
  value,
  readOnly,
  placeholder,
  variableContext,
  onClear,
  showClear = true,
  className,
  badgeClassName,
}: {
  value: string | number;
  readOnly: boolean;
  placeholder?: string;
  variableContext?: WorkflowVariableContext;
  onClear: () => void;
  showClear?: boolean;
  className?: string;
  badgeClassName?: string;
}) {
  const label = getVariableBadgeLabel(value, variableContext);
  const { plugins, pluginsLoaded, hasPluginContext } = useEnabledWorkflowPlugins(variableContext);
  const missing = isConfigVariableReference(value)
    ? hasPluginContext && pluginsLoaded && isConfigVariableReferenceMissing(value, plugins)
    : isVariableReferenceMissing(value, variableContext);

  if (!label) return null;

  return (
    <div
      data-slot="input-group-control"
      className={cn('flex min-w-0 flex-1 items-center px-2', className)}
      title={String(value)}
    >
      <Badge
        variant="secondary"
        className={cn(
          'h-5 max-w-full gap-1 rounded px-1.5 py-0 font-mono text-[10px]',
          missing && 'border-destructive/30 bg-destructive/10 text-destructive',
          badgeClassName,
        )}
      >
        <span className="min-w-0 truncate">{label}</span>
        {showClear ? (
          <button
            type="button"
            aria-label={`Clear ${placeholder ?? 'variable'}`}
            className={cn(
              'shrink-0 rounded-sm p-0.5 hover:bg-background/80 disabled:pointer-events-none disabled:opacity-40',
              missing ? 'text-destructive/80 hover:text-destructive' : 'text-muted-foreground hover:text-foreground',
            )}
            disabled={readOnly}
            onClick={onClear}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        ) : null}
      </Badge>
    </div>
  );
}

export function WorkflowVariableInput({
  value,
  readOnly = false,
  placeholder,
  variableContext,
  showTypeFilter = false,
  typeFilter,
  groupClassName = 'min-h-7 h-auto rounded-md',
  inputClassName = 'text-xs',
  onChange,
  onSelectVariable,
}: {
  value: string | number;
  readOnly?: boolean;
  placeholder?: string;
  variableContext?: WorkflowVariableContext;
  showTypeFilter?: boolean;
  typeFilter?: OutputField['type'];
  groupClassName?: string;
  inputClassName?: string;
  onChange: (value: string) => void;
  onSelectVariable?: (path: string) => void;
}) {
  const [variableTypeFilter, setVariableTypeFilter] = useState<OutputField['type']>('any');
  const { plugins } = useEnabledWorkflowPlugins(variableContext);

  const variableItems = useMemo(() => buildVariableSuggestionItems({
    variableContext,
    typeFilter: showTypeFilter ? variableTypeFilter : typeFilter,
    plugins,
  }), [plugins, showTypeFilter, typeFilter, variableContext, variableTypeFilter]);

  const selectVariable = useCallback((path: string) => {
    if (onSelectVariable) {
      onSelectVariable(path);
      return;
    }
    onChange(path);
  }, [onChange, onSelectVariable]);

  return (
    <InputGroup className={groupClassName}>
      <WorkflowVariableTiptapInput
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        className={inputClassName}
        variableItems={variableItems}
        variableContext={variableContext}
        onChange={onChange}
        onFocus={() => undefined}
        onBlur={() => undefined}
      />
      {showTypeFilter && (
        <Select
          value={variableTypeFilter}
          onValueChange={(type) => setVariableTypeFilter(type as OutputField['type'])}
        >
          <SelectTrigger size="sm" className="h-6 w-20 shrink-0 rounded-none border-y-0 border-r-0 px-2 py-0 text-[11px] [&_svg]:size-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_TYPES.map(type => (
              <SelectItem key={type} value={type} className="text-[11px]">{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {variableContext?.currentNodeId && (
        <InputGroupAddon align="inline-end">
          <WorkflowVariablePicker
            {...variableContext}
            typeFilter={showTypeFilter ? variableTypeFilter : typeFilter}
            onSelect={selectVariable}
          />
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}
