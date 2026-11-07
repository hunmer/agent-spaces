import type { NodeTypeDefinition } from '@agent-spaces/shared';

export const stringNodes: NodeTypeDefinition[] = [
  {
    type: 'string_concat',
    label: 'nodes.string_concat.label',
    category: 'nodes.categories.utilities',
    icon: 'Type',
    description: 'nodes.string_concat.description',
    allowInputFields: true,
    allowedInputFieldTypes: ['array', 'object'],
    properties: [
      {
        key: 'template',
        label: 'nodes.string_concat.props.template.label',
        type: 'textarea',
        required: true,
        default:
          '你好,{{users[0]}},很高兴见到你,现在是{{today.hour}}:{{today.min}}',
        placeholder: 'nodes.string_concat.props.template.placeholder',
        tooltip: 'nodes.string_concat.props.template.tooltip',
      },
    ],
    outputs: [{ key: 'result', type: 'string' }],
  },
  {
    type: 'string_split',
    label: 'nodes.string_split.label',
    category: 'nodes.categories.utilities',
    icon: 'Split',
    description: 'nodes.string_split.description',
    allowInputFields: false,
    properties: [
      {
        key: 'source',
        label: 'nodes.string_split.props.source.label',
        type: 'text',
        required: true,
        inputMode: 'variable',
        placeholder: 'nodes.string_split.props.source.placeholder',
        tooltip: 'nodes.string_split.props.source.tooltip',
      },
      {
        key: 'text',
        label: 'nodes.string_split.props.text.label',
        type: 'text',
        default: '|',
        placeholder: '|',
        tooltip: 'nodes.string_split.props.text.tooltip',
      },
    ],
    outputs: [{ key: 'result', type: 'string[]' }],
  },
];
