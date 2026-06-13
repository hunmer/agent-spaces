import type { NodeTypeDefinition } from '@agent-spaces/shared';

export const stringNodes: NodeTypeDefinition[] = [
  {
    type: 'string_concat',
    label: 'nodes.string_concat.label',
    category: 'nodes.categories.utilities',
    icon: 'Type',
    description: 'nodes.string_concat.description',
    allowInputFields: true,
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
];
