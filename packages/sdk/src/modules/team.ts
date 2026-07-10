import type { HttpClient } from '../client';
import type { AgentConfig, MessagePart, TeamStatus, TeamVisibility, TeamRole, TeamMembershipAgent, TeamMembershipAgentStore, TeamInboxStatus, TeamPriority, TeamBodyFormat, TeamMessageType, TeamExecutionStatus } from '@agent-spaces/shared';

/**
 * Team API 模块
 *
 * 注意：team 服务端接口统一返回 `{ success, code, message, data? }` 信封，
 * 与 SDK 其它模块直接返回 JSON 不同。因此本模块内部统一做信封解包：
 * 成功返回 data，失败抛出带 message 的 Error。
 */

/** team 接口统一响应信封 */
interface TeamEnvelope<T> {
  success: boolean;
  code: string;
  message: string;
  data?: T;
  warnings?: string[];
}

/** 解包 team 信封的内部工具 */
async function unwrap<T>(promise: Promise<Response>): Promise<T> {
  const response = await promise;
  const payload = (await response.json()) as TeamEnvelope<T>;
  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(payload.message || response.statusText);
  }
  return payload.data;
}

// ---- 视图类型（与服务端 team.ts 的 teamView 对齐）----

export interface TeamView {
  id: string;
  name: string;
  description: string;
  purpose?: string;
  icon?: string;
  avatarUrl?: string;
  avatar_url?: string;
  status: TeamStatus;
  visibility: TeamVisibility;
  created_by: string;
  created_at: string;
  updated_at: string;
  team_id: string;
  member_count: number;
  my_role: TeamRole | null;
  dissolved_at?: string;
  metadata?: Record<string, unknown>;
  members_preview?: TeamMembershipView[];
}

export interface TeamMembershipView {
  membership_id: string;
  team_id: string;
  agent_id: string;
  agent_store?: TeamMembershipAgentStore;
  agent?: TeamMembershipAgent;
  role: 'owner' | 'admin' | 'member' | 'observer';
  status: string;
  unread_count?: number;
  runtime_status?: 'idle' | 'running' | 'completed' | 'error';
  running_count?: number;
  joined_at?: string;
  updated_at?: string;
}

export interface TeamDetail {
  team: TeamView;
  members_preview?: TeamMembershipView[];
  stats: {
    unread_count: number;
    active_member_count: number;
    last_activity_at: string | null;
  };
}

export interface TeamRuntimeView {
  id: string;
  session_id: string;
  teamId: string;
  actorAgentId: string;
  leaderAgentId: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  updatedAt: string;
  team_id: string;
  actor_agent_id: string;
  leader_agent_id: string;
  updated_at: string;
}

export interface TeamRuntimeMessageView {
  id: string;
  runtimeId: string;
  teamId: string;
  messageId: string;
  deliveryId?: string;
  senderAgentId: string;
  recipientAgentId: string;
  content: string;
  parts?: MessagePart[];
  createdAt: string;
  status: 'running' | 'completed' | 'error';
}

export interface TeamRuntimeAgentProfile {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  icon?: string;
  role?: string;
  runtimeKind?: AgentConfig['runtimeKind'];
  modelProvider?: AgentConfig['modelProvider'];
  providerId?: AgentConfig['providerId'];
  modelId?: string;
  apiBase?: string;
  systemPrompt?: string;
  backgroundUrl?: string;
  tools?: AgentConfig['tools'];
  skills?: string[];
  mcps?: Record<string, unknown>;
}

export interface TeamRuntimeResponse {
  runtime: TeamRuntimeView;
  leader?: TeamRuntimeAgentProfile;
  participants?: TeamRuntimeAgentProfile[];
  messages: TeamRuntimeMessageView[];
}

/** inbox 投递视图（与服务端 inboxView 对齐，并附带 message 正文） */
export interface TeamInboxItemView {
  delivery_id: string;
  message_id: string;
  team_id: string;
  recipient_agent_id: string;
  sender_agent_id: string;
  subject: string;
  preview: string;
  body?: string;
  body_format?: TeamBodyFormat;
  message_type: TeamMessageType;
  inbox_status: TeamInboxStatus;
  execution_status: TeamExecutionStatus;
  priority: TeamPriority;
  requires_ack: boolean;
  requires_action: boolean;
  due_at: string | null;
  sent_at: string;
  read_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  unread_comment_count: number;
  version: number;
  updated_at: string;
}

export interface TeamInboxListResponse {
  inbox_items: TeamInboxItemView[];
  next_page_token: string | null;
  summary: {
    total_returned: number;
    unread_count_estimate: number;
  };
}

// ---- 入参类型 ----

export interface ListTeamsParams {
  actor_agent_id?: string;
  scope?: string;
  keyword?: string;
  archived?: boolean;
  page_size?: number;
  page_token?: string;
  include_members_preview?: boolean;
}

export interface CreateTeamInput {
  actor_agent_id: string;
  name: string;
  description: string;
  purpose?: string;
  icon?: string;
  avatar_url?: string;
  visibility: string;
  initial_members?: Array<{ agent_id: string; role: string }>;
}

export interface UpdateTeamInput {
  actor_agent_id: string;
  name?: string;
  description?: string;
  purpose?: string;
  icon?: string;
  avatar_url?: string;
  visibility?: string;
}

export function createTeamApi(http: HttpClient) {
  return {
    // ---- 团队管理 ----

    /** 团队列表 */
    list: (params: ListTeamsParams): Promise<{ teams: TeamView[] }> => {
      const query = new URLSearchParams();
      if (params.actor_agent_id) query.set('actor_agent_id', params.actor_agent_id);
      if (params.scope) query.set('scope', params.scope);
      if (params.keyword) query.set('keyword', params.keyword);
      if (params.archived) query.set('archived', 'true');
      if (params.page_size !== undefined) query.set('page_size', String(params.page_size));
      if (params.page_token) query.set('page_token', params.page_token);
      if (params.include_members_preview) query.set('include_members_preview', 'true');
      return unwrap(http.raw(`/api/teams?${query.toString()}`));
    },

    /** 团队详情 */
    get: (teamId: string, actorAgentId: string, includeMembersPreview = false): Promise<TeamDetail> => {
      const query = new URLSearchParams({ actor_agent_id: actorAgentId });
      if (includeMembersPreview) query.set('include_members_preview', 'true');
      return unwrap(http.raw(`/api/teams/${teamId}?${query.toString()}`));
    },

    /** 创建团队 */
    create: (input: CreateTeamInput): Promise<{ team: TeamView }> =>
      unwrap(http.raw(`/api/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })),

    /** 更新团队 */
    update: (teamId: string, input: UpdateTeamInput): Promise<{ team: TeamView }> =>
      unwrap(http.raw(`/api/teams/${teamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })),

    /** 解散团队 */
    dissolve: (teamId: string, actorAgentId: string): Promise<{ team_id: string }> =>
      unwrap(http.raw(`/api/teams/${teamId}/dissolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_agent_id: actorAgentId, confirm: true }),
      })),

    /** 删除已归档团队 */
    deleteArchive: (teamId: string): Promise<{ team_id: string }> =>
      unwrap(http.raw(`/api/teams/archive/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: teamId }),
      })),

    /** 恢复已归档团队 */
    restoreArchive: (teamId: string, actorAgentId?: string): Promise<{ team: TeamView }> =>
      unwrap(http.raw(`/api/teams/archive/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: teamId, actor_agent_id: actorAgentId }),
      })),

    /** 清空所有归档团队 */
    clearArchives: (): Promise<{ cleared: number }> =>
      unwrap(http.raw(`/api/teams/archive/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })),

    // ---- 成员管理 ----

    /** 邀请成员 */
    invite: (teamId: string, actorAgentId: string, agentId: string, role: 'owner' | 'admin' | 'member' | 'observer' = 'member'): Promise<void> =>
      unwrap(http.raw(`/api/teams/${teamId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_agent_id: actorAgentId, agent_id: agentId, role }),
      })),

    /** 设置成员角色 */
    setRole: (teamId: string, actorAgentId: string, agentId: string, role: 'owner' | 'admin' | 'member' | 'observer'): Promise<void> =>
      unwrap(http.raw(`/api/teams/${teamId}/set-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_agent_id: actorAgentId, agent_id: agentId, role }),
      })),

    /** 移除成员 */
    remove: (teamId: string, actorAgentId: string, agentId: string): Promise<void> =>
      unwrap(http.raw(`/api/teams/${teamId}/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_agent_id: actorAgentId, agent_id: agentId }),
      })),

    // ---- runtime ----

    /** 获取团队 runtime（含 leader/participants/messages） */
    getRuntime: (teamId: string, actorAgentId: string, sessionId?: string): Promise<TeamRuntimeResponse> => {
      const query = new URLSearchParams({ actor_agent_id: actorAgentId });
      if (sessionId) query.set('session_id', sessionId);
      return unwrap(http.raw(`/api/teams/${teamId}/runtime?${query.toString()}`));
    },

    /** 发送 runtime 消息 */
    sendRuntimeMessage: (
      teamId: string,
      input: { session_id: string; actor_agent_id: string; content: string; target_agent_id?: string; context_length?: number },
    ): Promise<void> =>
      unwrap(http.raw(`/api/teams/${teamId}/runtime/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })),

    // ---- 消息 ----

    /** 清空团队消息 */
    clearMessages: (teamId: string, sessionId: string, actorAgentId: string): Promise<void> =>
      unwrap(http.raw(`/api/teams/${teamId}/messages`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, actor_agent_id: actorAgentId }),
      })),

    /** 删除单条团队消息 */
    deleteMessage: (teamId: string, sessionId: string, messageId: string, actorAgentId: string): Promise<void> =>
      unwrap(http.raw(`/api/team-messages/${messageId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: teamId, session_id: sessionId, actor_agent_id: actorAgentId }),
      })),

    // ---- inbox 投递 ----

    /** 查询 inbox 投递列表（默认查 actor 自己；传 recipient_agent_id 可查指定成员，需 actor 是该 team 成员） */
    listInbox: (params: {
      actor_agent_id: string;
      team_id?: string;
      session_id?: string;
      recipient_agent_id?: string;
      unread_only?: boolean;
      sender_agent_id?: string;
      inbox_status?: TeamInboxStatus;
      page_size?: number;
      page_token?: string;
    }): Promise<TeamInboxListResponse> => {
      const query = new URLSearchParams();
      query.set('actor_agent_id', params.actor_agent_id);
      if (params.team_id) query.set('team_id', params.team_id);
      if (params.session_id) query.set('session_id', params.session_id);
      if (params.recipient_agent_id) query.set('recipient_agent_id', params.recipient_agent_id);
      if (params.unread_only) query.set('unread_only', 'true');
      if (params.sender_agent_id) query.set('sender_agent_id', params.sender_agent_id);
      if (params.inbox_status) query.set('inbox_status', params.inbox_status);
      if (params.page_size !== undefined) query.set('page_size', String(params.page_size));
      if (params.page_token) query.set('page_token', params.page_token);
      return unwrap(http.raw(`/api/team-inbox?${query.toString()}`));
    },

    /** 更新 inbox 投递状态（标记已读/未读） */
    updateInboxStatus: (
      deliveryId: string,
      input: { actor_agent_id: string; inbox_status: TeamInboxStatus; expected_version?: number },
    ): Promise<{ inbox_item: TeamInboxItemView }> =>
      unwrap(http.raw(`/api/team-inbox/${deliveryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_status',
          ...input,
        }),
      })),

    /** 删除单条 inbox 投递（仅移除该收件人的一条 delivery，不影响 message 本体） */
    deleteInboxItem: (deliveryId: string, actorAgentId: string): Promise<{ delivery_id: string; team_id: string }> =>
      unwrap(http.raw(`/api/team-inbox/${deliveryId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_agent_id: actorAgentId }),
      })),
  };
}
