import type { Channel, Issue, IssueComment } from '@agent-spaces/shared';
import type { AgentFunctionTool } from '../adapters/agent-runtime-types.js';
import * as issueService from './issue.js';
import * as issueCommentService from './issue-comment.js';
import * as channelService from './channel.js';

interface IssueToolActor {
  senderId: string;
  senderRole?: string;
}

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
): AgentFunctionTool[] {
  if (!channel) return [];

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

  return tools;
}

export function isBuiltInIssueToolName(name: string): boolean {
  return name === 'CreateCurrentChannelIssue'
    || name === 'ViewCurrentChannelIssue'
    || name === 'AddCurrentChannelComment'
    || name === 'agent-spaces.CreateCurrentChannelIssue'
    || name === 'agent-spaces.ViewCurrentChannelIssue'
    || name === 'agent-spaces.AddCurrentChannelComment';
}

type IssueWithComments = Issue & { comments: IssueComment[] };

function createCurrentChannelIssue(workspaceId: string, channel: Channel, input: unknown): Issue {
  const data = assertCurrentChannelId(channel, input);
  const currentChannel = getCurrentChannel(workspaceId, channel);
  if (currentChannel.issueId) throw new Error(`Current channel already has a bound issue: ${currentChannel.issueId}`);

  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const description = typeof data.description === 'string' ? data.description.trim() : '';
  if (!title) throw new Error('title is required.');

  const issue = issueService.createForChannel(workspaceId, currentChannel.id, { title, description });
  if (!issue) throw new Error(`Current channel not found: ${currentChannel.id}`);
  channel.issueId = issue.id;
  channel.type = 'issue';
  channel.name = title;
  return issue;
}

function viewCurrentChannelIssue(workspaceId: string, channel: Channel, input: unknown): IssueWithComments {
  assertCurrentChannelId(channel, input);
  const issue = getBoundIssue(workspaceId, channel);
  return {
    ...issue,
    comments: issueCommentService.listIssueComments(workspaceId, issue.id),
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
