import type { NodeTypeDefinition } from '@agent-spaces/shared';

const DB_PROP = {
  key: 'database',
  label: 'nodes.sqlite.props.database',
  type: 'sqlite' as const,
  required: true,
  tooltip: 'nodes.sqlite.props.database_tooltip',
};

export const sqliteNodes: NodeTypeDefinition[] = [
  {
    type: 'sqlite_query',
    label: 'nodes.sqlite_query.label',
    category: 'nodes.categories.sqlite',
    icon: 'Database',
    description: 'nodes.sqlite_query.description',
    properties: [
      DB_PROP,
      {
        key: 'table', label: 'nodes.sqlite.props.table', type: 'select', required: true,
        dynamicOptions: { source: 'sqlite-tables', dependsOn: 'database', placeholder: 'nodes.sqlite.props.selectDbFirst' },
      },
      {
        key: 'columns', label: 'nodes.sqlite.props.columns', type: 'select',
        dynamicOptions: { source: 'sqlite-columns', dependsOn: 'database', dependsOnTableKey: 'table', allOption: true, placeholder: 'nodes.sqlite.props.selectTableFirst' },
        default: '*',
      },
      { key: 'where', label: 'nodes.sqlite.props.where', type: 'textarea', tooltip: 'nodes.sqlite.props.where_tooltip' },
      { key: 'orderBy', label: 'nodes.sqlite.props.orderBy', type: 'text' },
      { key: 'limit', label: 'nodes.sqlite.props.limit', type: 'number', default: 1000 },
    ],
    outputs: [
      { key: 'rows', type: 'any' },
      { key: 'rowCount', type: 'number' },
    ],
  },
  {
    type: 'sqlite_insert',
    label: 'nodes.sqlite_insert.label',
    category: 'nodes.categories.sqlite',
    icon: 'Database',
    description: 'nodes.sqlite_insert.description',
    properties: [
      DB_PROP,
      {
        key: 'table', label: 'nodes.sqlite.props.table', type: 'select', required: true,
        dynamicOptions: { source: 'sqlite-tables', dependsOn: 'database', placeholder: 'nodes.sqlite.props.selectDbFirst' },
      },
      {
        key: 'fields', label: 'nodes.sqlite.props.fields', type: 'array', required: true,
        tooltip: 'nodes.sqlite.props.fields_tooltip',
        itemTemplate: { column: '', value: '' },
        fields: [
          { key: 'column', label: 'nodes.sqlite.props.column', type: 'select', required: true },
          { key: 'value', label: 'nodes.sqlite.props.value', type: 'text' },
        ],
      },
    ],
    outputs: [
      { key: 'insertedId', type: 'number' },
      { key: 'changes', type: 'number' },
    ],
  },
  {
    type: 'sqlite_update',
    label: 'nodes.sqlite_update.label',
    category: 'nodes.categories.sqlite',
    icon: 'Database',
    description: 'nodes.sqlite_update.description',
    properties: [
      DB_PROP,
      {
        key: 'table', label: 'nodes.sqlite.props.table', type: 'select', required: true,
        dynamicOptions: { source: 'sqlite-tables', dependsOn: 'database', placeholder: 'nodes.sqlite.props.selectDbFirst' },
      },
      {
        key: 'setFields', label: 'nodes.sqlite.props.setFields', type: 'array', required: true,
        itemTemplate: { column: '', value: '' },
        fields: [
          { key: 'column', label: 'nodes.sqlite.props.column', type: 'select', required: true },
          { key: 'value', label: 'nodes.sqlite.props.value', type: 'text' },
        ],
      },
      { key: 'where', label: 'nodes.sqlite.props.where', type: 'textarea', tooltip: 'nodes.sqlite.props.where_tooltip' },
    ],
    outputs: [{ key: 'changes', type: 'number' }],
  },
  {
    type: 'sqlite_delete',
    label: 'nodes.sqlite_delete.label',
    category: 'nodes.categories.sqlite',
    icon: 'Database',
    description: 'nodes.sqlite_delete.description',
    properties: [
      DB_PROP,
      {
        key: 'table', label: 'nodes.sqlite.props.table', type: 'select', required: true,
        dynamicOptions: { source: 'sqlite-tables', dependsOn: 'database', placeholder: 'nodes.sqlite.props.selectDbFirst' },
      },
      { key: 'where', label: 'nodes.sqlite.props.where', type: 'textarea', required: true, tooltip: 'nodes.sqlite.props.where_tooltip' },
    ],
    outputs: [{ key: 'changes', type: 'number' }],
  },
  {
    type: 'sqlite_raw',
    label: 'nodes.sqlite_raw.label',
    category: 'nodes.categories.sqlite',
    icon: 'Database',
    description: 'nodes.sqlite_raw.description',
    properties: [
      DB_PROP,
      { key: 'sql', label: 'nodes.sqlite.props.sql', type: 'textarea', required: true, tooltip: 'nodes.sqlite.props.sql_tooltip' },
      { key: 'mode', label: 'nodes.sqlite.props.mode', type: 'select', default: 'query',
        options: [
          { label: 'nodes.sqlite.props.modeQuery', value: 'query' },
          { label: 'nodes.sqlite.props.modeExec', value: 'exec' },
        ] },
    ],
    outputs: [
      { key: 'rows', type: 'any' },
      { key: 'execResult', type: 'object' },
    ],
  },
];
