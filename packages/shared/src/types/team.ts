import type { AgentConfig } from './workspace';
import type { MessagePart } from './channel';

export type TeamStatus = 'active' | 'archived' | 'dissolved';
export type TeamVisibility = 'private' | 'open';
export type TeamRole = 'owner' | 'admin' | 'member' | 'observer';
export type TeamMembershipStatus = 'active' | 'left' | 'removed' | 'suspended';
export type TeamMembershipAgentStore = 'agent' | 'chat' | 'custom';
export type TeamMessageType = 'direct' | 'broadcast';
export type TeamBodyFormat = 'plain_text' | 'markdown' | 'structured_text';
export type TeamPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TeamInboxStatus = 'unread' | 'read' | 'archived';
export type TeamExecutionStatus = 'pending' | 'running' | 'in_progress' | 'done' | 'failed' | 'ignored';
export type TeamRuntimeStatus = 'idle' | 'running' | 'completed' | 'error';
export type TeamCommentVisibility = 'team' | 'participants' | 'private';
export type TeamCommentContentFormat = 'plain_text' | 'markdown';
export type TeamMembershipAgent = Partial<AgentConfig> & Record<string, unknown> & {
  id: string;
  name?: string;
};

export interface Team {
  id: string;
  name: string;
  description: string;
  purpose?: string;
  status: TeamStatus;
  visibility: TeamVisibility;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  dissolvedAt?: string;
  memberCount: number;
  metadata?: Record<string, unknown>;
}

export interface TeamMembership {
  id: string;
  teamId: string;
  agentId: string;
  agentStore?: TeamMembershipAgentStore;
  agent?: TeamMembershipAgent;
  role: TeamRole;
  status: TeamMembershipStatus;
  joinedAt: string;
  updatedAt: string;
}

export interface TeamMessage {
  id: string;
  teamId: string;
  senderAgentId: string;
  messageType: TeamMessageType;
  subject: string;
  body: string;
  bodyFormat: TeamBodyFormat;
  priority: TeamPriority;
  requiresAck: boolean;
  requiresAction: boolean;
  dueAt: string | null;
  threadId: string | null;
  replyToMessageId: string | null;
  createdAt: string;
  sentAt: string;
  recipientCount: number;
  metadata?: Record<string, unknown>;
}

export interface TeamInboxItem {
  id: string;
  teamId: string;
  messageId: string;
  recipientAgentId: string;
  senderAgentId: string;
  subject: string;
  preview: string;
  messageType: TeamMessageType;
  inboxStatus: TeamInboxStatus;
  executionStatus: TeamExecutionStatus;
  priority: TeamPriority;
  requiresAck: boolean;
  requiresAction: boolean;
  dueAt: string | null;
  sentAt: string;
  readAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  unreadCommentCount: number;
  version: number;
  updatedAt: string;
}

export interface TeamMessageComment {
  id: string;
  teamId: string;
  messageId: string;
  authorAgentId: string;
  content: string;
  contentFormat: TeamCommentContentFormat;
  visibility: TeamCommentVisibility;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  deletedBy?: string;
  deleteReason?: string;
}

export interface TeamRuntime {
  id: string;
  teamId: string;
  actorAgentId: string;
  leaderAgentId: string;
  status: TeamRuntimeStatus;
  updatedAt: string;
}

export interface TeamRuntimeMessage {
  id: string;
  sessionId: string;
  teamId: string;
  messageId: string;
  deliveryId?: string;
  senderAgentId: string;
  recipientAgentId: string;
  content: string;
  parts?: MessagePart[];
  createdAt: string;
  status: Extract<TeamRuntimeStatus, 'running' | 'completed' | 'error'>;
}
