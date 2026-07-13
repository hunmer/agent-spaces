import type { NodeTypeDefinition, OutputField } from '@agent-spaces/shared';
import {
  LOOP_BREAK_NODE_TYPE,
  LOOP_BODY_NODE_TYPE,
  LOOP_BODY_ROLE,
  LOOP_BODY_SOURCE_HANDLE,
  LOOP_NEXT_SOURCE_HANDLE,
  LOOP_NODE_TYPE,
  LOOP_ROOT_ROLE,
} from '@agent-spaces/shared';
import { LoopBodyView } from '@/components/workflow/loop-body-view';
import { RUN_CODE_DEFAULT_CODE, RUN_PYTHON_DEFAULT_CODE } from '../constants';

const UNLIMITED_CONNECTION_COUNT = Number.MAX_SAFE_INTEGER;

const SET_VARIABLE_TYPE_OPTIONS: Array<{ label: string; value: OutputField['type'] }> = [
  { label: 'string', value: 'string' },
  { label: 'number', value: 'number' },
  { label: 'boolean', value: 'boolean' },
  { label: 'object', value: 'object' },
  { label: 'array', value: 'array' },
  { label: 'file', value: 'file' },
  { label: 'image', value: 'image' },
  { label: 'audio', value: 'audio' },
  { label: 'video', value: 'video' },
  { label: 'any', value: 'any' },
  { label: 'string[]', value: 'string[]' },
  { label: 'number[]', value: 'number[]' },
  { label: 'file[]', value: 'file[]' },
  { label: 'image[]', value: 'image[]' },
  { label: 'audio[]', value: 'audio[]' },
  { label: 'video[]', value: 'video[]' },
  { label: 'any[]', value: 'any[]' },
];

function normalizeSetVariablePath(path: string): string {
  return path
    .trim()
    .replace(/\]\s*\[\s*/g, '.')
    .replace(/\[\s*(["'])([^"']+)\1\s*\]/g, '.$2')
    .replace(/\[\s*([^\]"'\s]+)\s*\]/g, '.$1')
    .replace(/^\[\s*/, '')
    .replace(/\s*\]$/, '')
    .replace(/^(["'])([^"']+)\1$/, '$2')
    .replace(/(["'])\s*\.\s*(["'])/g, '.')
    .replace(/["']/g, '')
    .replace(/^\./, '');
}

function getOutputFieldChildren(field: OutputField | undefined): OutputField[] {
  return Array.isArray(field?.children) ? field.children : [];
}

function insertSetVariableOutputField(
  fields: OutputField[],
  path: string[],
  existingFields: OutputField[],
  variableType: OutputField['type'],
): void {
  const [key, ...rest] = path;
  if (!key) return;

  const existing = existingFields.find(field => field.key === key);
  let field = fields.find(item => item.key === key);
  if (!field) {
    field = {
      ...existing,
      key,
      type: rest.length > 0 ? 'object' : variableType,
      children: rest.length > 0 ? [] : getOutputFieldChildren(existing),
    };
    fields.push(field);
  }

  if (rest.length > 0) {
    field.type = 'object';
    field.children = getOutputFieldChildren(field);
    insertSetVariableOutputField(field.children, rest, getOutputFieldChildren(existing), variableType);
  } else {
    field.type = variableType;
  }
}

function getSetVariableOutputType(item: Record<string, unknown>): OutputField['type'] {
  const rawType = item.type;
  return SET_VARIABLE_TYPE_OPTIONS.some(option => option.value === rawType)
    ? rawType as OutputField['type']
    : 'string';
}

export function createSetVariableOutputs(variables: unknown, currentOutputs?: unknown): OutputField[] {
  const currentOutputFields = Array.isArray(currentOutputs)
    ? currentOutputs.filter((field): field is OutputField => !!field && typeof field === 'object' && 'key' in field)
    : [];
  const currentEnv = currentOutputFields.find(field => field.key === 'env');
  const envChildren: OutputField[] = [];
  const items = Array.isArray(variables) ? variables : [];

  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const rawKey = record.key;
    const key = typeof rawKey === 'string' ? rawKey.trim() : '';
    const path = normalizeSetVariablePath(key).split('.').filter(Boolean);
    insertSetVariableOutputField(envChildren, path, getOutputFieldChildren(currentEnv), getSetVariableOutputType(record));
  }

  return [{
    ...currentEnv,
    key: 'env',
    type: 'object',
    children: envChildren,
  }];
}

export const flowControlNodes: NodeTypeDefinition[] = [
  {
    type: 'start',
    label: 'nodes.start.label',
    category: 'nodes.categories.flowControl',
    icon: 'LogIn',
    description: 'nodes.start.description',
    properties: [],
    allowInputFields: true,
    handles: { source: true, target: false },
    singleton: true,
  },
  {
    type: 'end',
    label: 'nodes.end.label',
    category: 'nodes.categories.flowControl',
    icon: 'LogOut',
    description: 'nodes.end.description',
    properties: [],
    handles: { source: false, target: true, connectionCount: UNLIMITED_CONNECTION_COUNT },
    singleton: true,
  },
  {
    type: 'run_code',
    label: 'nodes.run_code.label',
    category: 'nodes.categories.flowControl',
    icon: 'Terminal',
    description: 'nodes.run_code.description',
    allowInputFields: true,
    properties: [
      {
        key: 'code',
        label: 'nodes.run_code.props.code.label',
        type: 'code',
        required: true,
        default: RUN_CODE_DEFAULT_CODE,
        tooltip: 'nodes.run_code.props.code.tooltip',
      },
    ],
  },
  {
    type: 'run_python',
    label: 'nodes.run_python.label',
    category: 'nodes.categories.flowControl',
    icon: 'FileCode',
    description: 'nodes.run_python.description',
    allowInputFields: true,
    properties: [
      {
        key: 'code',
        label: 'nodes.run_python.props.code.label',
        type: 'code',
        language: 'python',
        required: true,
        default: RUN_PYTHON_DEFAULT_CODE,
        tooltip: 'nodes.run_python.props.code.tooltip',
      },
      {
        key: 'pythonPath',
        label: 'nodes.run_python.props.pythonPath.label',
        type: 'text',
        default: '',
        tooltip: 'nodes.run_python.props.pythonPath.tooltip',
        placeholder: 'python',
      },
    ],
  },
  {
    type: 'toast',
    label: 'nodes.toast.label',
    category: 'nodes.categories.flowControl',
    icon: 'Bell',
    description: 'nodes.toast.description',
    properties: [
      { key: 'message', label: 'nodes.toast.props.message.label', type: 'text', required: true },
      {
        key: 'type', label: 'nodes.toast.props.type.label', type: 'select', default: 'info',
        options: [
          { label: 'nodes.toast.props.type.info', value: 'info' },
          { label: 'nodes.toast.props.type.success', value: 'success' },
          { label: 'nodes.toast.props.type.warning', value: 'warning' },
          { label: 'nodes.toast.props.type.error', value: 'error' },
        ],
      },
    ],
  },
  {
    type: 'switch',
    label: 'nodes.switch.label',
    category: 'nodes.categories.flowControl',
    icon: 'GitBranch',
    description: 'nodes.switch.description',
    properties: [
      { key: 'conditions', label: 'nodes.switch.props.conditions', type: 'conditions' },
    ],
    handles: { target: true, dynamicSource: { dataKey: 'conditions', extraCount: 1 } },
  },
  {
    type: 'variable_aggregate',
    label: 'nodes.variable_aggregate.label',
    category: 'nodes.categories.flowControl',
    icon: 'Combine',
    description: 'nodes.variable_aggregate.description',
    properties: [
      {
        key: 'strategy', label: 'nodes.variable_aggregate.props.strategy.label', type: 'select', default: 'first_non_empty', required: true,
        options: [{ label: 'nodes.variable_aggregate.props.strategy.first_non_empty', value: 'first_non_empty' }],
      },
      {
        key: 'groups', label: 'nodes.variable_aggregate.props.groups.label', type: 'array', default: [], required: true,
        itemTemplate: { key: '', variables: [] },
        fields: [
          { key: 'key', label: 'nodes.variable_aggregate.props.groups.fields.key', type: 'text', required: true, placeholder: 'result' },
          { key: 'variables', label: 'nodes.variable_aggregate.props.groups.fields.variables', type: 'output_fields', required: true },
        ],
      },
    ],
    handles: { connectionCount: UNLIMITED_CONNECTION_COUNT },
    outputs: [{ key: 'result', type: 'object' }],
  },
  {
    type: 'set_variable',
    label: 'nodes.set_variable.label',
    category: 'nodes.categories.flowControl',
    icon: 'Braces',
    description: 'nodes.set_variable.description',
    properties: [
      {
        key: 'variables',
        label: 'nodes.set_variable.props.variables.label',
        type: 'array',
        default: [],
        required: true,
        itemTemplate: { key: '', value: '', type: 'string' },
        fields: [
          { key: 'key', label: 'nodes.set_variable.props.variables.fields.key', type: 'text', required: true, placeholder: 'name' },
          { key: 'type', label: 'nodes.set_variable.props.variables.fields.type', type: 'select', default: 'string', options: SET_VARIABLE_TYPE_OPTIONS },
          { key: 'value', label: 'nodes.set_variable.props.variables.fields.value', type: 'text', placeholder: 'nodes.set_variable.props.variables.fields.value_placeholder' },
        ],
      },
    ],
    outputs: [{ key: 'env', type: 'object' }],
  },
  {
    type: 'get_variable',
    label: 'nodes.get_variable.label',
    category: 'nodes.categories.flowControl',
    icon: 'Search',
    description: 'nodes.get_variable.description',
    properties: [
      { key: 'key', label: 'nodes.get_variable.props.key', type: 'text', required: true },
      { key: 'defaultValue', label: 'nodes.get_variable.props.defaultValue', type: 'text' },
    ],
    outputs: [
      { key: 'value', type: 'any' },
      { key: 'exists', type: 'boolean' },
    ],
  },
  {
    type: 'delete_variable',
    label: 'nodes.delete_variable.label',
    category: 'nodes.categories.flowControl',
    icon: 'Trash2',
    description: 'nodes.delete_variable.description',
    properties: [
      { key: 'key', label: 'nodes.delete_variable.props.key', type: 'text', required: true },
    ],
    outputs: [
      { key: 'deleted', type: 'boolean' },
      { key: 'env', type: 'object' },
    ],
  },
  {
    type: 'sub_workflow',
    label: 'nodes.sub_workflow.label',
    category: 'nodes.categories.flowControl',
    icon: 'Workflow',
    description: 'nodes.sub_workflow.description',
    properties: [
      { key: 'workflowId', label: 'nodes.sub_workflow.props.workflow', type: 'workflow', required: true },
    ],
    allowInputFields: true,
    outputs: [{ key: 'result', type: 'any' }],
  },
  {
    type: LOOP_BREAK_NODE_TYPE,
    label: 'nodes.loop_break.label',
    category: 'nodes.categories.flowControl',
    icon: 'LogOut',
    description: 'nodes.loop_break.description',
    properties: [],
    handles: { target: true, source: true },
    outputs: [{ key: 'break', type: 'boolean' }],
  },
  {
    type: LOOP_NODE_TYPE,
    label: 'nodes.loop.label',
    category: 'nodes.categories.flowControl',
    icon: 'RotateCw',
    description: 'nodes.loop.description',
    properties: [
      {
        key: 'loopType', label: 'nodes.loop.props.loopType.label', type: 'select', default: 'count', required: true,
        options: [
          { label: 'nodes.loop.props.loopType.count', value: 'count' },
          { label: 'nodes.loop.props.loopType.array', value: 'array' },
          { label: 'nodes.loop.props.loopType.infinite', value: 'infinite' },
        ],
      },
      { key: 'count', label: 'nodes.loop.props.count', type: 'number', default: 1, required: true, visibleWhen: { key: 'loopType', equals: 'count' } },
      { key: 'arrayPath', label: 'nodes.loop.props.arrayPath', type: 'text', required: true, visibleWhen: { key: 'loopType', equals: 'array' } },
      { key: 'concurrency', label: 'nodes.loop.props.concurrency', type: 'number', default: 1, required: true },
      { key: 'sharedVariables', label: 'nodes.loop.props.sharedVariables', type: 'output_fields', default: [] },
    ],
    handles: {
      target: true,
      source: true,
      sourceHandles: [
        { id: LOOP_BODY_SOURCE_HANDLE, label: 'nodes.loop.handles.body' },
        { id: LOOP_NEXT_SOURCE_HANDLE, label: 'nodes.loop.handles.next' },
      ],
    },
    outputs: [{ key: 'items', type: 'any' }],
    compound: {
      rootRole: LOOP_ROOT_ROLE,
      children: [
        { role: LOOP_ROOT_ROLE, type: LOOP_NODE_TYPE },
        { role: LOOP_BODY_ROLE, type: LOOP_BODY_NODE_TYPE, label: 'nodes.loop_body.label', offset: { x: 260, y: 0 }, scopeBoundary: true, parentRole: LOOP_ROOT_ROLE, data: { width: 150, height: 260 } },
      ],
      edges: [
        { sourceRole: LOOP_ROOT_ROLE, targetRole: LOOP_BODY_ROLE, sourceHandle: LOOP_BODY_SOURCE_HANDLE, targetHandle: 'target', locked: true },
      ],
    },
  },
  {
    type: LOOP_BODY_NODE_TYPE,
    label: 'nodes.loop_body.label',
    category: 'nodes.categories.flowControl',
    icon: 'Container',
    description: 'nodes.loop_body.description',
    properties: [],
    handles: { target: true, source: false },
    customView: LoopBodyView,
    customViewMinSize: { width: 150, height: 260 },
    debuggable: false,
    manualCreate: false,
  },
];
