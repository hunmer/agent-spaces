import { BUILT_IN_AGENT_TOOLS, type BuiltInAgentToolName } from '@agent-spaces/shared';
import type { AgentFunctionTool } from '../../adapters/agent-runtime-types.js';
import {
  handleTeamInboxQuery,
  handleTeamManage,
  handleTeamMembershipManage,
  handleTeamMessageComment,
  handleTeamMessageUpdate,
} from '../team.js';
import { handleTeamMessageSendAndRun } from '../team-runtime.js';

const actorField = {
  actor_agent_id: {
    type: 'string',
    description: 'Agent id that initiates the operation.',
  },
};

const commonFields = {
  idempotency_key: { type: 'string' },
  request_context: { type: 'object' },
  dry_run: { type: 'boolean' },
};

function schema(properties: Record<string, unknown>, required: string[]): Record<string, unknown> {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

export function createTeamFunctionTools(
  workspaceId: string,
  allowedTools?: BuiltInAgentToolName[],
  context?: { teamId: string; actorAgentId: string },
): AgentFunctionTool[] {
  const allowedToolNames = new Set(allowedTools ?? BUILT_IN_AGENT_TOOLS.map((tool) => tool.name));
  const bindContext = (input: unknown): unknown => context && input && typeof input === 'object'
    ? { ...input, team_id: context.teamId, actor_agent_id: context.actorAgentId }
    : input;

  const tools: AgentFunctionTool[] = [
    {
      name: 'team_manage',
      description: 'Create, list, get, or dissolve teams.',
      inputSchema: schema({
        action: { type: 'string', enum: ['create', 'list', 'get', 'dissolve'] },
        ...actorField,
        ...commonFields,
        team_id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        purpose: { type: 'string' },
        visibility: { type: 'string', enum: ['private', 'open'] },
        initial_members: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              agent_id: { type: 'string' },
              role: { type: 'string', enum: ['admin', 'member', 'observer'] },
            },
            required: ['agent_id', 'role'],
          },
        },
        scope: { type: 'string', enum: ['mine', 'visible'] },
        status_filter: { type: 'array', items: { type: 'string', enum: ['active', 'archived', 'dissolved'] } },
        keyword: { type: 'string' },
        page_size: { type: 'integer', minimum: 1, maximum: 100 },
        page_token: { type: 'string' },
        include_members_preview: { type: 'boolean' },
        reason: { type: 'string' },
        confirm: { type: 'boolean' },
        metadata: { type: 'object' },
      }, ['action', 'actor_agent_id']),
      annotations: { destructive: false, openWorld: false },
      execute: async (input) => handleTeamManage(bindContext(input)),
    },
    {
      name: 'team_membership_manage',
      description: 'Join, invite, or leave a team member.',
      inputSchema: schema({
        action: { type: 'string', enum: ['join', 'invite', 'leave'] },
        ...actorField,
        ...commonFields,
        team_id: { type: 'string' },
        target_agent_id: { type: 'string' },
        agent_id: { type: 'string' },
        agent_store: { type: 'string', enum: ['agent', 'chat', 'custom'] },
        agent: { type: 'object' },
        role: { type: 'string', enum: ['owner', 'admin', 'member', 'observer'] },
        join_reason: { type: 'string' },
        reason: { type: 'string' },
      }, ['action', 'actor_agent_id', 'team_id']),
      annotations: { destructive: false, openWorld: false },
      execute: async (input) => handleTeamMembershipManage(bindContext(input)),
    },
    {
      name: 'team_message_send',
      description: 'Send a direct team message or a broadcast.',
      inputSchema: schema({
        action: { type: 'string', enum: ['send'] },
        ...actorField,
        ...commonFields,
        team_id: { type: 'string' },
        mode: { type: 'string', enum: ['direct', 'broadcast'] },
        recipient_agent_ids: { type: 'array', items: { type: 'string' } },
        recipient_roles: { type: 'array', items: { type: 'string', enum: ['owner', 'admin', 'member', 'observer'] } },
        include_sender: { type: 'boolean' },
        subject: { type: 'string' },
        body: { type: 'string' },
        body_format: { type: 'string', enum: ['plain_text', 'markdown', 'structured_text'] },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
        requires_ack: { type: 'boolean' },
        requires_action: { type: 'boolean' },
        due_at: { type: 'string' },
        thread_id: { type: 'string' },
        reply_to_message_id: { type: 'string' },
        metadata: { type: 'object' },
      }, ['action', 'actor_agent_id', 'team_id', 'mode', 'subject', 'body']),
      annotations: { destructive: false, openWorld: false },
      execute: async (input) => handleTeamMessageSendAndRun(bindContext(input)),
    },
    {
      name: 'team_inbox_query',
      description: 'List inbox items or get one team message delivery.',
      inputSchema: schema({
        action: { type: 'string', enum: ['list', 'get'] },
        ...actorField,
        request_context: { type: 'object' },
        unread_only: { type: 'boolean' },
        team_id: { type: 'string' },
        sender_agent_id: { type: 'string' },
        message_type: { type: 'string', enum: ['direct', 'broadcast'] },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
        requires_action: { type: 'boolean' },
        inbox_status: { type: 'string', enum: ['unread', 'read', 'archived'] },
        execution_status: { type: 'string', enum: ['pending', 'in_progress', 'done', 'failed', 'ignored'] },
        due_before: { type: 'string' },
        page_size: { type: 'integer', minimum: 1, maximum: 100 },
        page_token: { type: 'string' },
        delivery_id: { type: 'string' },
        message_id: { type: 'string' },
      }, ['action', 'actor_agent_id']),
      annotations: { readOnly: true, openWorld: false },
      execute: async (input) => handleTeamInboxQuery(bindContext(input)),
    },
    {
      name: 'team_message_update',
      description: 'Update inbox or execution status for a received team message.',
      inputSchema: schema({
        action: { type: 'string', enum: ['update_status'] },
        ...actorField,
        delivery_id: { type: 'string' },
        idempotency_key: { type: 'string' },
        request_context: { type: 'object' },
        inbox_status: { type: 'string', enum: ['unread', 'read', 'archived'] },
        execution_status: { type: 'string', enum: ['pending', 'in_progress', 'done', 'failed', 'ignored'] },
        failure_reason: { type: 'string' },
        note: { type: 'string' },
        expected_version: { type: 'integer' },
      }, ['action', 'actor_agent_id', 'delivery_id']),
      annotations: { destructive: false, openWorld: false },
      execute: async (input) => handleTeamMessageUpdate(bindContext(input)),
    },
    {
      name: 'team_message_comment',
      description: 'Add, list, or delete comments on a team message.',
      inputSchema: schema({
        action: { type: 'string', enum: ['add', 'list', 'delete'] },
        ...actorField,
        request_context: { type: 'object' },
        message_id: { type: 'string' },
        content: { type: 'string' },
        content_format: { type: 'string', enum: ['plain_text', 'markdown'] },
        visibility: { type: 'string', enum: ['team', 'participants', 'private'] },
        include_deleted: { type: 'boolean' },
        page_size: { type: 'integer', minimum: 1, maximum: 100 },
        page_token: { type: 'string' },
        comment_id: { type: 'string' },
        reason: { type: 'string' },
      }, ['action', 'actor_agent_id']),
      annotations: { destructive: false, openWorld: false },
      execute: async (input) => handleTeamMessageComment(bindContext(input)),
    },
  ];

  return tools.filter((tool) => allowedToolNames.has(tool.name as BuiltInAgentToolName));
}
