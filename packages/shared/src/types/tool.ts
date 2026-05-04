export const BUILT_IN_AGENT_TOOLS = [
  {
    name: 'CreateCurrentChannelIssue',
    label: 'Create Current Issue',
    description: 'Create and bind an issue for the current channel.',
  },
  {
    name: 'ViewCurrentChannelIssue',
    label: 'View Current Issue',
    description: 'View the issue and comments bound to the current channel.',
  },
  {
    name: 'AddCurrentChannelComment',
    label: 'Add Current Comment',
    description: 'Add a comment to the issue bound to the current channel.',
  },
] as const;

export type BuiltInAgentToolName = typeof BUILT_IN_AGENT_TOOLS[number]['name'];
