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
import { getNodeDefinition } from '@/lib/workflow-nodes';
import { pluginApi, type WorkflowPlugin } from '@/lib/workflow-plugin-api';
import { FIELD_TYPES } from './workflow-properties-utils';
import { WorkflowVariablePicker, type WorkflowVariableContext } from './workflow-variable-picker';
import { WorkflowNodeDefinitionIcon, type WorkflowNodeIconDefinition } from './workflow-node-icon';

type EditorRange = { from: number; to: number };
type VariableSuggestionItem = {
  id: string;
  title: string;
  description: string;
  path: string;
  type?: OutputField['type'] | PluginConfigField['type'];
  groupIcon?: 'workflow' | 'variable' | 'loop' | 'plugin';
  nodeIconDefinition?: WorkflowNodeIconDefinition;
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
const variableSuggestionPluginKey = new PluginKey('workflowVariableSuggestion');

function getVariableExpression(value: string | number): string | null {
  const match = String(value).match(PURE_VARIABLE_PATTERN);
  return match?.[1]?.trim() || null;
}

function normalizeVariableFieldPath(fieldPath: string): string {
  return fieldPath
    .replace(/\["([^"]+)"\]/g, '.$1')
    .replace(/^\./, '')
    .trim();
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

function getUpstreamNodeIds(edges: WorkflowVariableContext['edges'], nodeId: string): Set<string> {
  const incomingByTarget = new Map<string, string[]>();

  for (const edge of edges) {
    const sources = incomingByTarget.get(edge.target) ?? [];
    sources.push(edge.source);
    incomingByTarget.set(edge.target, sources);
  }

  const upstream = new Set<string>();
  const pending = [...(incomingByTarget.get(nodeId) ?? [])];

  while (pending.length > 0) {
    const sourceId = pending.pop();
    if (!sourceId || upstream.has(sourceId)) continue;

    upstream.add(sourceId);
    pending.push(...(incomingByTarget.get(sourceId) ?? []));
  }

  return upstream;
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

function unwrapExpressionPath(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  const match = text.match(/^\{\{\s*([^{}]*?)\s*\}\}$/);
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

function normalizeTypeFilter(typeFilter: OutputField['type'] | OutputField['type'][] | undefined): OutputField['type'][] {
  if (!typeFilter) return [];
  return Array.isArray(typeFilter) ? typeFilter : [typeFilter];
}

function matchesTypeFilter(fieldType: OutputField['type'] | PluginConfigField['type'] | undefined, typeFilter: OutputField['type'][]): boolean {
  if (!typeFilter.length || !fieldType) return true;
  if (fieldType === 'any' || typeFilter.includes('any')) return true;
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
  typeFilter: OutputField['type'][],
  groupMeta: Pick<VariableSuggestionItem, 'groupIcon' | 'nodeIconDefinition'> = {},
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
        type: field.type,
        ...groupMeta,
      });
    }

    if (field.type === 'file') {
      for (const child of ['path', 'relativePath', 'name', 'size', 'type', 'url', 'httpPath']) {
        const childPath = `${fieldPath}.${child}`;
        const childType = child === 'size' ? 'number' : 'string';
        if (!matchesTypeFilter(childType, typeFilter)) continue;
        const childVariablePath = buildPath(childPath);
        items.push({
          id: childVariablePath,
          title: childPath,
          description: group,
          path: childVariablePath,
          type: childType,
          ...groupMeta,
        });
      }
    }

    if (field.children?.length) {
      pushFieldItems(items, field.children, buildPath, group, typeFilter, groupMeta, fieldPath);
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
  const upstreamNodeIds = getUpstreamNodeIds(edges, currentNodeId);
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
      normalizedTypeFilter,
      { nodeIconDefinition: getNodeDefinition(workflowInputNode.type) },
    );
  }

  pushFieldItems(items, variables, buildEnvPath, 'workflow variable', normalizedTypeFilter, { groupIcon: 'variable' });

  for (const node of otherNodes.filter((item) => item.type !== 'start' && item.type !== 'end')) {
    const nodeLabel = getNodeLabel(node);
    const nodeIconDefinition = getNodeDefinition(node.type);
    pushFieldItems(items, getNodeInputFields(node), (fieldPath) => buildInputFieldPath(node.id, fieldPath), `${nodeLabel} input`, normalizedTypeFilter, { nodeIconDefinition });
    pushFieldItems(items, getNodeOutputs(node), (fieldPath) => buildVariablePath(node.id, fieldPath), `${nodeLabel} output`, normalizedTypeFilter, { nodeIconDefinition });
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
    pushFieldItems(items, loopFields, buildLoopVariablePath, 'loop', normalizedTypeFilter, { nodeIconDefinition: getNodeDefinition(loopParentNode.type) });
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
        type: field.type,
        groupIcon: 'plugin',
      });
    }
  }

  return items;
}

function createVariableHighlightExtension() {
  return Extension.create({
    name: 'workflowVariableHighlight',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('workflowVariableHighlight'),
          props: {
            decorations(state) {
              const decorations: Decoration[] = [];
              state.doc.descendants((node, pos) => {
                if (!node.isText || !node.text) return;
                for (const match of node.text.matchAll(VARIABLE_TOKEN_PATTERN)) {
                  if (match.index === undefined) continue;
                  decorations.push(Decoration.inline(
                    pos + match.index,
                    pos + match.index + match[0].length,
                    { class: 'workflow-variable-token' },
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

function groupVariableSuggestionItems(items: VariableSuggestionItem[]) {
  const groups: Array<{
    title: string;
    groupIcon?: VariableSuggestionItem['groupIcon'];
    nodeIconDefinition?: WorkflowNodeIconDefinition;
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
      items: nextGroup,
    });
  });
  return groups;
}

function WorkflowVariableSuggestionGroupIcon({
  groupIcon,
  nodeIconDefinition,
}: {
  groupIcon?: VariableSuggestionItem['groupIcon'];
  nodeIconDefinition?: WorkflowNodeIconDefinition;
}) {
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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const groupedItems = useMemo(() => groupVariableSuggestionItems(items), [items]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const selectItem = useCallback((index: number) => {
    const item = items[index];
    if (item) command(item);
  }, [items, command]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!items.length) return false;

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
        return true;
      }

      if (event.key === 'ArrowDown' || event.key === 'Tab') {
        event.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % items.length);
        return true;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        selectItem(selectedIndex);
        return true;
      }

      return false;
    },
  }), [items, selectItem, selectedIndex]);

  if (!items.length) {
    return (
      <div className="suggestion-menu workflow-variable-suggestion-menu">
        <div className="suggestion-empty">No matching variables</div>
      </div>
    );
  }

  return (
    <div className="suggestion-menu workflow-variable-suggestion-menu">
      <div className="suggestion-header">Select variable</div>
      <div className="suggestion-list workflow-variable-suggestion-list" ref={listRef}>
        {groupedItems.map((group) => (
            <div key={group.title} className="workflow-variable-suggestion-group">
              <div className="workflow-variable-suggestion-group-title">
                <WorkflowVariableSuggestionGroupIcon
                  groupIcon={group.groupIcon}
                  nodeIconDefinition={group.nodeIconDefinition}
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

function createVariableSuggestionExtension(getItems: () => VariableSuggestionItem[]) {
  return Extension.create({
    name: 'workflowVariableSuggestion',
    addOptions() {
      return {
        suggestion: {
          char: '{{',
          allowedPrefixes: null,
          items: ({ query }: { query: string }) => {
            const keyword = normalizeSuggestionQuery(query);
            return getItems()
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
  className,
  onChange,
  onFocus,
  onBlur,
}: {
  value: string | number;
  readOnly: boolean;
  placeholder?: string;
  variableItems: VariableSuggestionItem[];
  className?: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const extensions = useMemo(() => [
    StarterKit.configure({
      heading: false,
      bulletList: false,
      orderedList: false,
      blockquote: false,
      codeBlock: false,
      horizontalRule: false,
    }),
    createVariableHighlightExtension(),
    createVariableSuggestionExtension(() => variableItems),
  ], [variableItems]);

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

  if (!label) return null;

  return (
    <div
      data-slot="input-group-control"
      className={cn('flex min-w-0 flex-1 items-center px-2', className)}
      title={String(value)}
    >
      <Badge
        variant="secondary"
        className={cn('h-5 max-w-full gap-1 rounded px-1.5 py-0 font-mono text-[10px]', badgeClassName)}
      >
        <span className="min-w-0 truncate">{label}</span>
        {showClear ? (
          <button
            type="button"
            aria-label={`Clear ${placeholder ?? 'variable'}`}
            className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:bg-background/80 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
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
  const [plugins, setPlugins] = useState<WorkflowPlugin[]>([]);

  useEffect(() => {
    const enabledPlugins = variableContext?.enabledPlugins ?? [];
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
  }, [variableContext?.enabledPlugins]);

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
