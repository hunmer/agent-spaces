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
      { key: 'systemPrompt', label: 'nodes.agent_run.props.systemPrompt', type: 'textarea' },
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
      { key: 'extraInstructions', label: 'nodes.agent_run.props.extraInstructions', type: 'textarea' },
      { key: 'loadProjectClaudeMd', label: 'nodes.agent_run.props.loadProjectClaudeMd', type: 'checkbox', default: true },
      { key: 'loadRuleMd', label: 'nodes.agent_run.props.loadRuleMd', type: 'checkbox', default: true },
    ],
    outputs: [
      { key: 'result', type: 'string' },
      { key: 'content', type: 'string' },
      { key: 'summary', type: 'string' },
      { key: 'output', type: 'string[]' },
      { key: 'usage', type: 'object' },
    ],
  },
];
