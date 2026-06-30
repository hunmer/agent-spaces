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
  {
    name: 'ReadTerminalOutput',
    label: 'Read Terminal Output',
    description: 'Read paginated terminal output by session ID. Defaults to the newest 100 lines.',
  },
  {
    name: 'ListQuickCommands',
    label: 'List Quick Commands',
    description: 'List all quick commands for a workspace with their running status.',
  },
  {
    name: 'RunQuickCommand',
    label: 'Run Quick Command',
    description: 'Start a quick command by its ID. Returns the terminal session ID.',
  },
  {
    name: 'StopQuickCommand',
    label: 'Stop Quick Command',
    description: 'Stop a running quick command by its ID.',
  },
  {
    name: 'ListDatabases',
    label: 'List Databases',
    description: 'List knowledge base databases in the workspace and their IDs.',
  },
  {
    name: 'ListDatabaseNodes',
    label: 'List Database Nodes',
    description: 'List knowledge base nodes under a path, optionally filtered by title.',
  },
  {
    name: 'SearchDatabaseNodes',
    label: 'Search Database Nodes',
    description: 'Search knowledge base nodes by title or content under a path.',
  },
  {
    name: 'QueryDatabaseVectors',
    label: 'Query Database Vectors',
    description: 'Search knowledge base nodes by vector similarity using the database-bound embedding model.',
  },
  {
    name: 'ReadDatabaseNode',
    label: 'Read Database Node',
    description: 'Read knowledge base node metadata and content by ID.',
  },
  {
    name: 'ListDatabaseNodeVersions',
    label: 'List Database Versions',
    description: 'List content version history and diffs for a knowledge base node by ID.',
  },
  {
    name: 'CreateDatabaseNode',
    label: 'Create Database Node',
    description: 'Create a knowledge base node under a parent path or parent ID.',
  },
  {
    name: 'WriteDatabaseNode',
    label: 'Write Database Node',
    description: 'Insert, replace, or overwrite knowledge base node content by ID.',
  },
  {
    name: 'DeleteDatabaseNode',
    label: 'Delete Database Node',
    description: 'Trash or permanently delete a knowledge base node and its descendants.',
  },
  {
    name: 'MoveDatabaseNode',
    label: 'Move Database Node',
    description: 'Move a knowledge base node or directory to another parent path or ID.',
  },
  {
    name: 'UpdateDatabaseNodeMeta',
    label: 'Update Database Meta',
    description: 'Update knowledge base node metadata such as title, icon, cover, parent, or trash state.',
  },
  {
    name: 'ListWorkspaceFiles',
    label: 'List Workspace Files',
    description: 'List files and directories in the current workspace filesystem.',
  },
  {
    name: 'SearchWorkspaceFiles',
    label: 'Search Workspace Files',
    description: 'Search workspace file paths and UTF-8 text file content.',
  },
  {
    name: 'ReadWorkspaceFile',
    label: 'Read Workspace File',
    description: 'Read a UTF-8 text file from the current workspace filesystem.',
  },
  {
    name: 'WriteWorkspaceFile',
    label: 'Write Workspace File',
    description: 'Write UTF-8 text content to a workspace file.',
  },
  {
    name: 'DeleteWorkspacePath',
    label: 'Delete Workspace Path',
    description: 'Delete a workspace file or directory recursively.',
  },
  {
    name: 'MoveWorkspacePath',
    label: 'Move Workspace Path',
    description: 'Move or rename a workspace file or directory.',
  },
  {
    name: 'list_agent_capabilities',
    label: 'List Agent Capabilities',
    description: 'List available agent presets and their configured MCPs, skills, and tools.',
  },
  {
    name: 'list_workflows',
    label: 'List Workflows',
    description: 'List saved workflows and their start node input fields.',
  },
  {
    name: 'search_workflow',
    label: 'Search Workflow',
    description: 'Search saved workflows by name or description.',
  },
  {
    name: 'execute_workflow_sync',
    label: 'Execute Workflow Sync',
    description: 'Start a workflow and wait for completion, pause, error, or timeout.',
  },
  {
    name: 'execute_workflow_async',
    label: 'Execute Workflow Async',
    description: 'Start a workflow and return its execution ID immediately.',
  },
  {
    name: 'get_workflow_result',
    label: 'Get Workflow Result',
    description: 'Read a workflow execution result by execution ID.',
  },
  {
    name: 'get_workflow_latest_result',
    label: 'Get Latest Workflow Result',
    description: 'Read the latest execution result for a workflow.',
  },
] as const;

export type BuiltInAgentToolName = typeof BUILT_IN_AGENT_TOOLS[number]['name'];
