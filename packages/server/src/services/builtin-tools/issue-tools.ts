import { BUILT_IN_AGENT_TOOLS, type AgentConfig, type BuiltInAgentToolName, type Channel, type Issue, type IssueComment, type IssueStatus } from '@agent-spaces/shared';
import type { AgentFunctionTool } from '../../adapters/agent-runtime-types.js';
import * as issueService from '../issue.js';
import * as issueCommentService from '../issue-comment.js';
import * as channelService from '../channel.js';
import * as agentService from '../agent.js';
import { broadcastToWorkspace } from '../../ws/connection-manager.js';

interface IssueToolActor {
  senderId: string;
  senderRole?: string;
}

const issueStatuses = [
  'draft',
  'in_progress',
  'completed',
  'stopped',
  'archived',
  'error',
] as const satisfies readonly IssueStatus[];

const currentChannelInputSchema = {
  type: 'object',
  properties: {
    channelId: {
      type: 'string',
      description: 'Must match the current channel id.',
    },
  },
  required: ['channelId'],
  additionalProperties: false,
};

const createIssueInputSchema = {
  type: 'object',
  properties: {
    channelId: {
      type: 'string',
      description: 'Must match the current channel id.',
    },
    title: {
      type: 'string',
      description: 'Issue title to create for the current channel.',
    },
    description: {
      type: 'string',
      description: 'Issue description to create for the current channel.',
    },
    status: {
      type: 'string',
      enum: issueStatuses,
      description: 'Issue status to create. Use completed when creating a finished issue report. Defaults to draft.',
    },
  },
  required: ['channelId', 'title'],
  additionalProperties: false,
};

const addCommentInputSchema = {
  type: 'object',
  properties: {
    channelId: {
      type: 'string',
      description: 'Must match the current channel id.',
    },
    content: {
      type: 'string',
      description: 'Comment content to add to the issue bound to the current channel.',
    },
  },
  required: ['channelId', 'content'],
  additionalProperties: false,
};

export function createIssueFunctionTools(
  workspaceId: string,
  channel: Channel | undefined,
  actor: IssueToolActor,
  allowedTools?: BuiltInAgentToolName[],
): AgentFunctionTool[] {
  if (!channel) return [];
  const allowedToolNames = new Set(allowedTools ?? BUILT_IN_AGENT_TOOLS.map((tool) => tool.name));

  const tools: AgentFunctionTool[] = [
    {
      name: 'CreateCurrentChannelIssue',
      description: 'Create an issue for the current channel and bind it to this channel. The channelId must be the current channel id.',
      inputSchema: createIssueInputSchema,
      annotations: { destructive: false, openWorld: false },
      execute: async (input) => createCurrentChannelIssue(workspaceId, channel, input),
    },
  ];

  tools.push(
    {
      name: 'ViewCurrentChannelIssue',
      description: 'View the issue and comments bound to the current channel. The channelId must be the current channel id.',
      inputSchema: currentChannelInputSchema,
      annotations: { readOnly: true, openWorld: false },
      execute: async (input) => viewCurrentChannelIssue(workspaceId, channel, input),
    },
    {
      name: 'AddCurrentChannelComment',
      description: 'Add a comment to the issue bound to the current channel. The channelId must be the current channel id.',
      inputSchema: addCommentInputSchema,
      annotations: { destructive: false, openWorld: false },
      execute: async (input) => addCurrentChannelComment(workspaceId, channel, actor, input),
    },
  );

  return tools.filter((tool) => allowedToolNames.has(tool.name as BuiltInAgentToolName));
}

export function isBuiltInIssueToolName(name: string): boolean {
  return name === 'CreateCurrentChannelIssue'
    || name === 'ViewCurrentChannelIssue'
    || name === 'AddCurrentChannelComment'
    || name === 'agent-spaces.CreateCurrentChannelIssue'
    || name === 'agent-spaces.ViewCurrentChannelIssue'
    || name === 'agent-spaces.AddCurrentChannelComment';
}

interface CurrentIssueContext {
  issue: Issue;
  comments: IssueComment[];
  channel: Pick<Channel, 'id' | 'name' | 'type' | 'issueId' | 'members' | 'pinnedMentionId' | 'todos'>;
  assignableAgents: Array<Pick<AgentConfig, 'id' | 'name' | 'role' | 'description' | 'enabled' | 'sandboxDirs'>>;
  validAgentConfigIds: string[];
}

function createCurrentChannelIssue(workspaceId: string, channel: Channel, input: unknown): Issue {
  const data = assertCurrentChannelId(channel, input);
  const currentChannel = getCurrentChannel(workspaceId, channel);
  if (currentChannel.issueId) {
    const existing = issueService.getById(workspaceId, currentChannel.issueId);
    if (!existing) throw new Error(`Bound issue not found: ${currentChannel.issueId}`);
    return existing;
  }

  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const description = typeof data.description === 'string' ? data.description.trim() : '';
  const status = parseIssueStatus(data.status);
  if (!title) throw new Error('title is required.');

  const issue = issueService.createForChannel(workspaceId, currentChannel.id, { title, description, status });
  if (!issue) throw new Error(`Current channel not found: ${currentChannel.id}`);
  channel.issueId = issue.id;
  channel.type = 'issue';
  channel.name = title;
  return issue;
}

function parseIssueStatus(status: unknown): IssueStatus | undefined {
  if (status === undefined) return undefined;
  if (typeof status !== 'string' || !issueStatuses.includes(status as IssueStatus)) {
    throw new Error(`status must be one of: ${issueStatuses.join(', ')}.`);
  }
  return status as IssueStatus;
}

function viewCurrentChannelIssue(workspaceId: string, channel: Channel, input: unknown): CurrentIssueContext {
  assertCurrentChannelId(channel, input);
  const issue = getBoundIssue(workspaceId, channel);
  const currentChannel = getCurrentChannel(workspaceId, channel);
  const assignableAgents = getAssignableAgents(workspaceId, currentChannel);
  return {
    issue,
    comments: issueCommentService.listIssueComments(workspaceId, issue.id),
    channel: {
      id: currentChannel.id,
      name: currentChannel.name,
      type: currentChannel.type,
      issueId: currentChannel.issueId,
      members: currentChannel.members,
      pinnedMentionId: currentChannel.pinnedMentionId,
      todos: currentChannel.todos,
    },
    assignableAgents,
    validAgentConfigIds: assignableAgents.map((agent) => agent.id),
  };
}

function addCurrentChannelComment(
  workspaceId: string,
  channel: Channel,
  actor: IssueToolActor,
  input: unknown,
): IssueComment {
  const data = assertCurrentChannelId(channel, input);
  const issue = getBoundIssue(workspaceId, channel);
  const content = typeof data.content === 'string' ? data.content.trim() : '';
  if (!content) throw new Error('content is required.');

  const comment = issueCommentService.createIssueComment(workspaceId, issue.id, {
    senderId: actor.senderId,
    senderRole: actor.senderRole,
    content,
    source: actor.senderId === 'user' ? 'user' : 'agent_progress',
    metadata: {
      channelId: channel.id,
    },
  });
  if (!comment) throw new Error(`Bound issue not found: ${issue.id}`);
  broadcastToWorkspace(workspaceId, 'issue.comment.created', comment);
  return comment;
}

function getBoundIssue(workspaceId: string, channel: Channel): Issue {
  const currentChannel = getCurrentChannel(workspaceId, channel);
  if (!currentChannel.issueId) throw new Error('Current channel is not bound to an issue.');
  const issue = issueService.getById(workspaceId, currentChannel.issueId);
  if (!issue) throw new Error(`Bound issue not found: ${currentChannel.issueId}`);
  return issue;
}

function getCurrentChannel(workspaceId: string, channel: Channel): Channel {
  const currentChannel = channelService.getChannel(workspaceId, channel.id);
  if (!currentChannel) throw new Error(`Current channel not found: ${channel.id}`);
  return currentChannel;
}

function getAssignableAgents(
  workspaceId: string,
  channel: Channel,
): Array<Pick<AgentConfig, 'id' | 'name' | 'role' | 'description' | 'enabled' | 'sandboxDirs'>> {
  const members = new Set(channel.members);
  return (agentService.listPresets(workspaceId) ?? [])
    .filter((agent) => members.has(agent.id) && agent.enabled !== false)
    .map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      description: agent.description,
      enabled: agent.enabled,
      sandboxDirs: agent.sandboxDirs,
    }));
}

function assertCurrentChannelId(channel: Channel, input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Tool input must be an object.');
  }
  const data = input as Record<string, unknown>;
  if (data.channelId !== channel.id) {
    throw new Error(`channelId must match the current channel id: ${channel.id}`);
  }
  return data;
}
