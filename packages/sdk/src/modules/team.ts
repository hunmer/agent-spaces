import type { HttpClient } from '../client';
import type { TeamStatus, TeamVisibility, TeamRole } from '@agent-spaces/shared';

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
}

export interface TeamMembershipView {
  membership_id: string;
  team_id: string;
  agent_id: string;
  role: 'owner' | 'admin' | 'member' | 'observer';
  status: string;
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
}

export interface TeamRuntimeResponse {
  runtime: TeamRuntimeView;
  leader?: TeamRuntimeAgentProfile;
  participants?: TeamRuntimeAgentProfile[];
  messages: TeamRuntimeMessageView[];
}

// ---- 入参类型 ----

export interface ListTeamsParams {
  actor_agent_id: string;
  scope?: string;
  keyword?: string;
  archived?: boolean;
  page_size?: number;
  page_token?: string;
}

export interface CreateTeamInput {
  actor_agent_id: string;
  name: string;
  description: string;
  purpose?: string;
  visibility: string;
  initial_members?: Array<{ agent_id: string; role: string }>;
}

export interface UpdateTeamInput {
  actor_agent_id: string;
  name?: string;
  description?: string;
  purpose?: string;
  visibility?: string;
}

export function createTeamApi(http: HttpClient) {
  return {
    // ---- 团队管理 ----

    /** 团队列表 */
    list: (params: ListTeamsParams): Promise<{ teams: TeamView[] }> => {
      const query = new URLSearchParams();
      query.set('actor_agent_id', params.actor_agent_id);
      if (params.scope) query.set('scope', params.scope);
      if (params.keyword) query.set('keyword', params.keyword);
      if (params.archived) query.set('archived', 'true');
      if (params.page_size !== undefined) query.set('page_size', String(params.page_size));
      if (params.page_token) query.set('page_token', params.page_token);
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
    getRuntime: (teamId: string, actorAgentId: string): Promise<TeamRuntimeResponse> => {
      const query = new URLSearchParams({ actor_agent_id: actorAgentId });
      return unwrap(http.raw(`/api/teams/${teamId}/runtime?${query.toString()}`));
    },

    /** 发送 runtime 消息 */
    sendRuntimeMessage: (
      teamId: string,
      input: { actor_agent_id: string; content: string; target_agent_id?: string; context_length?: number },
    ): Promise<void> =>
      unwrap(http.raw(`/api/teams/${teamId}/runtime/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })),

    // ---- 消息 ----

    /** 清空团队消息 */
    clearMessages: (teamId: string, actorAgentId: string): Promise<void> =>
      unwrap(http.raw(`/api/teams/${teamId}/messages`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_agent_id: actorAgentId }),
      })),

    /** 删除单条团队消息 */
    deleteMessage: (messageId: string, actorAgentId: string): Promise<void> =>
      unwrap(http.raw(`/api/team-messages/${messageId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_agent_id: actorAgentId }),
      })),
  };
}
