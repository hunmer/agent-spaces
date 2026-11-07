import type { NodeTypeDefinition } from '@agent-spaces/shared';

export const interactionNodes: NodeTypeDefinition[] = [
  {
    type: 'alert',
    label: 'nodes.alert.label',
    category: 'nodes.categories.interaction',
    icon: 'MessageSquare',
    description: 'nodes.alert.description',
    properties: [
      { key: 'title', label: 'nodes.alert.props.title', type: 'text', default: 'nodes.alert.props.title_default' },
      { key: 'message', label: 'nodes.alert.props.message', type: 'textarea', required: true },
    ],
    outputs: [{ key: 'confirmed', type: 'boolean' }],
  },
  {
    type: 'prompt',
    label: 'nodes.prompt.label',
    category: 'nodes.categories.interaction',
    icon: 'TextCursorInput',
    description: 'nodes.prompt.description',
    properties: [
      { key: 'title', label: 'nodes.prompt.props.title', type: 'text', default: 'nodes.prompt.props.title_default' },
      { key: 'message', label: 'nodes.prompt.props.message', type: 'text' },
      { key: 'placeholder', label: 'nodes.prompt.props.placeholder', type: 'text' },
      { key: 'defaultValue', label: 'nodes.prompt.props.defaultValue', type: 'text' },
    ],
    outputs: [{ key: 'value', type: 'string' }, { key: 'confirmed', type: 'boolean' }],
  },
  {
    type: 'form',
    label: 'nodes.form.label',
    category: 'nodes.categories.interaction',
    icon: 'ClipboardList',
    description: 'nodes.form.description',
    properties: [
      { key: 'title', label: 'nodes.form.props.title', type: 'text', default: 'nodes.form.props.title_default' },
      {
        key: 'items', label: 'nodes.form.props.items.label', type: 'array', required: true,
        itemTemplate: { id: '', title: '', type: 'text', data: { value: '', placeholder: '' } },
        fields: [
          { key: 'id', label: 'nodes.form.props.items.fields.id', type: 'text', required: true },
          { key: 'title', label: 'nodes.form.props.items.fields.title', type: 'text', required: true },
          { key: 'type', label: 'nodes.form.props.items.fields.type', type: 'select', default: 'text',
            options: [
              { label: 'nodes.form.props.items.fields.type_text', value: 'text' },
              { label: 'nodes.form.props.items.fields.type_textarea', value: 'textarea' },
              { label: 'nodes.form.props.items.fields.type_number', value: 'number' },
              { label: 'nodes.form.props.items.fields.type_select', value: 'select' },
              { label: 'nodes.form.props.items.fields.type_checkbox', value: 'checkbox' },
            ],
          },
        ],
      },
    ],
    outputs: [{ key: 'values', type: 'object' }, { key: 'confirmed', type: 'boolean' }],
  },
];
