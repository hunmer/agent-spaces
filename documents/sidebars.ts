import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: '快速开始',
      items: [
        'getting-started/installation',
        'getting-started/first-workspace',
        'getting-started/first-issue',
      ],
    },
    {
      type: 'category',
      label: '功能介绍',
      items: [
        'features/workspace',
        'features/workflow',
        'features/mini-app',
        'features/agent/index',
        'features/issue-management',
        'features/team',
        'features/chat',
        'features/code-editor',
        'features/terminal',
        'features/git',
        'features/notifications',
        'features/dashboard',
        'features/command-palette',
        'features/project-settings',
        'features/code-search',
        'features/kanban',
        'features/database',
        'features/worktree',
        'features/hooks',
        'features/output-styles',
        'features/plugins',
        'features/skills',
        'features/mcp',
        'features/agent-store',
        'features/models',
        'features/prompts',
      ],
    },
    {
      type: 'category',
      label: '进阶',
      items: [
        'advanced/multi-server',
        'advanced/bot-agent',
        'advanced/agent-sse-api',
        'advanced/docker-deployment',
        'advanced/flutter-client',
      ],
    },
    {
      type: 'category',
      label: 'Research',
      items: [
        'research/index',
        'research/grok-runtime-architecture',
        'research/workflow-execution-system',
        'research/workflow-editor-execution-sync',
        'research/workflow-node-system',
        'research/workflow-composite-nodes',
        'research/adding-workflow-node-guide',
      ],
    },
  ],
};

export default sidebars;
