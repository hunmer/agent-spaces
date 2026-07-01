import type { NodeTypeDefinition } from '@agent-spaces/shared';
import { MiniAppDisplayView } from '@/components/workflow/display-node-views';

export const miniappNodes: NodeTypeDefinition[] = [
  {
    type: 'show_miniapp',
    label: 'nodes.show_miniapp.label',
    category: 'nodes.categories.miniapp',
    icon: 'PanelsTopLeft',
    description: 'nodes.show_miniapp.description',
    customView: MiniAppDisplayView,
    customViewMinSize: { width: 260, height: 150 },
    properties: [
      {
        key: 'miniAppId',
        label: 'nodes.show_miniapp.props.miniAppId',
        type: 'select',
        required: true,
        dynamicOptions: {
          source: 'mini-apps',
          dependsOn: '__miniapp_catalog__',
          placeholder: 'nodes.show_miniapp.props.miniAppId_placeholder',
        },
      },
      {
        key: 'route',
        label: 'nodes.show_miniapp.props.route',
        type: 'text',
        default: '/',
        placeholder: 'nodes.show_miniapp.props.route_placeholder',
      },
      {
        key: 'embedDisplay',
        label: 'nodes.show_miniapp.props.embedDisplay',
        type: 'checkbox',
        default: false,
        tooltip: 'nodes.show_miniapp.props.embedDisplay_tooltip',
      },
      {
        key: 'params',
        label: 'nodes.show_miniapp.props.params',
        type: 'code',
        language: 'json',
        default: '{\n  "message": "hello workflow"\n}',
        tooltip: 'nodes.show_miniapp.props.params_tooltip',
      },
    ],
    outputs: [
      { key: 'submittedData', type: 'any', description: 'nodes.show_miniapp.outputs.submittedData' },
      { key: 'miniAppId', type: 'string', description: 'nodes.show_miniapp.outputs.miniAppId' },
      { key: 'route', type: 'string', description: 'nodes.show_miniapp.outputs.route' },
      { key: 'params', type: 'object', description: 'nodes.show_miniapp.outputs.params' },
      { key: 'confirmed', type: 'boolean', description: 'nodes.show_miniapp.outputs.confirmed' },
    ],
  },
];
