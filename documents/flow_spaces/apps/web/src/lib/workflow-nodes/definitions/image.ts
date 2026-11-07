import type { NodeTypeDefinition } from '@agent-spaces/shared';

export const imageNodes: NodeTypeDefinition[] = [
  {
    type: 'image_to_base64',
    label: 'nodes.image_to_base64.label',
    category: 'nodes.categories.image',
    icon: 'FileImage',
    description: 'nodes.image_to_base64.description',
    allowInputFields: false,
    properties: [
      {
        key: 'source',
        label: 'nodes.image_to_base64.props.source.label',
        type: 'text',
        required: true,
        inputMode: 'variable',
        placeholder: 'nodes.image_to_base64.props.source.placeholder',
        tooltip: 'nodes.image_to_base64.props.source.tooltip',
      },
      {
        key: 'outputFormat',
        label: 'nodes.image_to_base64.props.outputFormat.label',
        type: 'select',
        default: 'dataURL',
        tooltip: 'nodes.image_to_base64.props.outputFormat.tooltip',
        options: [
          { label: 'nodes.image_to_base64.props.outputFormat.dataURL', value: 'dataURL' },
          { label: 'nodes.image_to_base64.props.outputFormat.base64', value: 'base64' },
        ],
      },
    ],
    outputs: [{ key: 'result', type: 'string' }],
  },
];
