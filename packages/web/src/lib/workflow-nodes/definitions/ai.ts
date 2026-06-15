import type { NodeTypeDefinition } from '@agent-spaces/shared';

export const aiNodes: NodeTypeDefinition[] = [
  {
    type: 'agent_run',
    label: 'nodes.agent_run.label',
    category: 'nodes.categories.ai',
    icon: 'Bot',
    description: 'nodes.agent_run.description',
    properties: [
      { key: 'agent', label: 'nodes.agent_run.props.agent', type: 'agent' },
      { key: 'prompt', label: 'nodes.agent_run.props.prompt', type: 'textarea', required: true },
      { key: 'cwd', label: 'nodes.agent_run.props.cwd', type: 'text' },
      {
        key: 'additionalDirectories',
        label: 'nodes.agent_run.props.additionalDirectories',
        type: 'textarea',
        tooltip: 'nodes.agent_run.props.additionalDirectories_tooltip',
      },
      { key: 'permissionMode', label: 'nodes.agent_run.props.permissionMode', type: 'select', default: 'dontAsk',
        options: [
          { label: 'nodes.agent_run.props.pmOpts.default', value: 'default' },
          { label: 'nodes.agent_run.props.pmOpts.dontAsk', value: 'dontAsk' },
          { label: 'nodes.agent_run.props.pmOpts.acceptEdits', value: 'acceptEdits' },
          { label: 'nodes.agent_run.props.pmOpts.plan', value: 'plan' },
          { label: 'nodes.agent_run.props.pmOpts.auto', value: 'auto' },
          { label: 'nodes.agent_run.props.pmOpts.bypassPermissions', value: 'bypassPermissions' },
        ],
      },
    ],
    outputs: [
      { key: 'result', type: 'string' },
      { key: 'usage', type: 'object' },
    ],
  },
];
