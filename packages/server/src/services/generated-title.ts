import { runTitleGeneratorAgent } from '../agents/title-generator-agent.js';
import type { ChatSession } from '../storage/chat-store.js';
import { getChannel, updateChannel } from './channel.js';
import * as chatService from './chat.js';
import * as issueService from './issue.js';

export function scheduleChannelTitleGeneration(input: {
  workspaceId: string;
  channelId: string;
  requirement: string;
  broadcast: (event: string, data: unknown) => void;
}): void {
  if (!input.requirement.trim()) return;
  void generateChannelTitle(input).catch((err) => {
    console.error('[title-generator] channel title generation failed', {
      workspaceId: input.workspaceId,
      channelId: input.channelId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

export function scheduleIssueTitleGeneration(input: {
  workspaceId: string;
  issueId: string;
  requirement: string;
  description?: string;
  broadcast: (event: string, data: unknown) => void;
}): void {
  void generateIssueTitle(input).catch((err) => {
    console.error('[title-generator] issue title generation failed', {
      workspaceId: input.workspaceId,
      issueId: input.issueId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

export function scheduleChatSessionTitleGeneration(input: {
  workspaceId: string;
  sessionId: string;
  requirement: string;
  onUpdated: (session: ChatSession) => void;
}): void {
  if (!input.requirement.trim()) return;
  void generateChatSessionTitle(input).catch((err) => {
    console.error('[title-generator] chat session title generation failed', {
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

async function generateChannelTitle(input: {
  workspaceId: string;
  channelId: string;
  requirement: string;
  broadcast: (event: string, data: unknown) => void;
}): Promise<void> {
  const title = await runTitleGeneratorAgent({
    workspaceId: input.workspaceId,
    target: 'channel',
    requirement: input.requirement,
  });
  const current = getChannel(input.workspaceId, input.channelId);
  if (!current || current.name.trim() !== '') return;

  const updated = updateChannel(input.workspaceId, input.channelId, { name: title });
  if (updated) input.broadcast('channel.updated', updated);
}

async function generateIssueTitle(input: {
  workspaceId: string;
  issueId: string;
  requirement: string;
  description?: string;
  broadcast: (event: string, data: unknown) => void;
}): Promise<void> {
  const title = await runTitleGeneratorAgent({
    workspaceId: input.workspaceId,
    target: 'issue',
    requirement: input.requirement,
    description: input.description,
  });
  const issue = issueService.getById(input.workspaceId, input.issueId);
  if (!issue || issue.title.trim() !== '') return;

  issue.title = title;
  const saved = issueService.save(input.workspaceId, issue);
  input.broadcast('issue.updated', saved);

  if (!saved.channelId) return;
  const channel = getChannel(input.workspaceId, saved.channelId);
  if (!channel || channel.name.trim() !== '') return;

  const updatedChannel = updateChannel(input.workspaceId, saved.channelId, { name: title });
  if (updatedChannel) input.broadcast('channel.updated', updatedChannel);
}

export async function generateChatSessionTitle(input: {
  workspaceId: string;
  sessionId: string;
  requirement: string;
  onUpdated: (session: ChatSession) => void;
}): Promise<void> {
  const title = await runTitleGeneratorAgent({
    workspaceId: input.workspaceId,
    target: 'session',
    requirement: input.requirement,
  });
  const current = chatService.findSession(input.workspaceId, input.sessionId);
  if (!current || current.title?.trim()) return;

  const updated = chatService.updateSession(input.workspaceId, input.sessionId, { title });
  if (updated) input.onUpdated(updated);
}
