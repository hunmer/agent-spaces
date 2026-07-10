import { Router, type Request, type Response } from 'express';
import { listChannels, createChannel, getChannel, updateChannel, deleteChannel } from '../services/channel.js';
import { listMessages, createMessage, updateMessage, deleteMessage, clearMessages } from '../services/message.js';
import { broadcastToWorkspace } from '../ws/connection-manager.js';
import { hasActiveChannelRuns, stopChannelRuns } from '../ws/agent-runner.js';
import { getToolDetail } from '../services/tool-detail.js';
import * as issueService from '../services/issue.js';
import { scheduleChannelTitleGeneration } from '../services/generated-title.js';
import { stripHtml } from '../ws/html-utils.js';

const router = Router({ mergeParams: true });

interface ChannelParams {
  id: string;
  channelId?: string;
}

// GET /api/workspaces/:id/channels
router.get('/', (req: Request<ChannelParams>, res: Response) => {
  res.json(listChannels(req.params.id));
});

// POST /api/workspaces/:id/channels
router.post('/', (req: Request<ChannelParams>, res: Response) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const titlePrompt = typeof req.body.titlePrompt === 'string' ? req.body.titlePrompt.trim() : '';
  const { id, type, members, overwrite } = req.body;
  const requestedId = typeof id === 'string' ? id : undefined;
  const { channel, created } = createChannel(req.params.id, { id: requestedId, name, type: type || 'general', members, overwrite: overwrite === true });
  if (created) {
    broadcastToWorkspace(req.params.id, 'channel.updated', channel);
  }
  res.status(created ? 201 : 200).json(channel);

  if (created && !name) {
    scheduleChannelTitleGeneration({
      workspaceId: req.params.id,
      channelId: channel.id,
      requirement: titlePrompt,
      broadcast: (event, data) => broadcastToWorkspace(req.params.id, event, data),
    });
  }
});

// PUT /api/workspaces/:id/channels/:channelId
router.put('/:channelId', (req: Request<ChannelParams>, res: Response) => {
  const { id, channelId } = req.params;
  const patch: Parameters<typeof updateChannel>[2] = {};
  for (const key of ['name', 'type', 'issueId', 'members', 'pinnedMentionId', 'draft', 'todos', 'archived'] as const) {
    if (Object.hasOwn(req.body, key)) patch[key] = req.body[key];
  }
  const channel = updateChannel(id, channelId!, patch);
  if (!channel) { res.status(404).json({ error: 'channel not found' }); return; }
  broadcastToWorkspace(id, 'channel.updated', channel);

  // 频道归档/取消归档时，同步关联的 Issue
  if (Object.hasOwn(patch, 'archived') && channel.issueId) {
    const issue = issueService.getById(id, channel.issueId);
    if (issue) {
      const prevStatus = issue.status;
      const newStatus = patch.archived ? 'archived' : 'draft';
      if (prevStatus !== newStatus) {
        const saved = issueService.updateStatus(id, channel.issueId, newStatus as any);
        if (saved) {
          broadcastToWorkspace(id, 'issue.updated', saved);
          broadcastToWorkspace(id, 'issue.status_changed', { issueId: channel.issueId, from: prevStatus, to: newStatus });
        }
      }
    }
  }

  res.json(channel);
});

// DELETE /api/workspaces/:id/channels/:channelId
router.delete('/:channelId', (req: Request<ChannelParams>, res: Response) => {
  const { id, channelId } = req.params;
  // 先停止该频道中所有运行中的 agent
  stopChannelRuns(id, channelId!);
  const ok = deleteChannel(id, channelId!);
  if (!ok) { res.status(404).json({ error: 'channel not found' }); return; }
  broadcastToWorkspace(id, 'channel.deleted', { channelId });
  res.status(204).end();
});

// GET /api/workspaces/:id/channels/:channelId/messages
router.get('/:channelId/messages', (req: Request<ChannelParams>, res: Response) => {
  const { id, channelId } = req.params;
  const { limit, before } = req.query;
  if (id !== '__team__' && !getChannel(id, channelId!)) { res.status(404).json({ error: 'channel not found' }); return; }
  res.json(listMessages(id, channelId!, { limit: limit ? Number(limit) : undefined, before: before as string | undefined }));
});

// GET /api/workspaces/:id/channels/:channelId/state
router.get('/:channelId/state', (req: Request<ChannelParams>, res: Response) => {
  const { id, channelId } = req.params;
  if (!getChannel(id, channelId!)) { res.status(404).json({ error: 'channel not found' }); return; }
  const messages = listMessages(id, channelId!, { limit: 1 });
  const lastMessage = messages.at(-1);
  res.json({
    channelId,
    active: hasActiveChannelRuns(id, channelId!),
    lastMessage: lastMessage ? {
      id: lastMessage.id,
      status: lastMessage.status,
      metadata: lastMessage.metadata,
      hasPendingQuestion: Boolean(lastMessage.parts?.some((part) => (
        part.type === 'ask_user_question' && part.status !== 'answered' && !part.answer
      ))),
    } : null,
  });
});

// GET /api/workspaces/:id/channels/:channelId/messages/:messageId/tool-details/:detailId
router.get('/:channelId/messages/:messageId/tool-details/:detailId', (req: Request<ChannelParams & { messageId: string; detailId: string }>, res: Response) => {
  const { id, channelId, messageId, detailId } = req.params;
  if (id !== '__team__' && !getChannel(id, channelId!)) { res.status(404).json({ error: 'channel not found' }); return; }
  const detail = getToolDetail(id, channelId!, messageId, detailId);
  if (!detail) { res.status(404).json({ error: 'tool detail not found' }); return; }
  res.json(detail);
});

// POST /api/workspaces/:id/channels/:channelId/messages
router.post('/:channelId/messages', (req: Request<ChannelParams>, res: Response) => {
  const { id, channelId } = req.params;
  const { content, type, attachments } = req.body;
  if (!content && !attachments?.length) { res.status(400).json({ error: 'content required' }); return; }
  if (!getChannel(id, channelId!)) { res.status(404).json({ error: 'channel not found' }); return; }
  const message = createMessage(id, channelId!, { senderId: 'user', content, type, attachments });
  broadcastToWorkspace(id, 'channel.message', message);
  const channel = getChannel(id, channelId!);
  if (channel && !channel.name.trim()) {
    scheduleChannelTitleGeneration({
      workspaceId: id,
      channelId: channelId!,
      requirement: stripHtml(content),
      broadcast: (event, data) => broadcastToWorkspace(id, event, data),
    });
  }
  res.status(201).json(message);
});

// PUT /api/workspaces/:id/channels/:channelId/messages/:messageId
router.put('/:channelId/messages/:messageId', (req: Request<ChannelParams & { messageId: string }>, res: Response) => {
  const { id, channelId, messageId } = req.params;
  const { content } = req.body;
  if (!content) { res.status(400).json({ error: 'content required' }); return; }
  const message = updateMessage(id, channelId!, messageId!, { content });
  if (!message) { res.status(404).json({ error: 'message not found' }); return; }
  broadcastToWorkspace(id, 'channel.message.updated', message);
  res.json(message);
});

// DELETE /api/workspaces/:id/channels/:channelId/messages/:messageId
router.delete('/:channelId/messages/:messageId', (req: Request<ChannelParams & { messageId: string }>, res: Response) => {
  const { id, channelId, messageId } = req.params;
  const ok = deleteMessage(id, channelId!, messageId!);
  if (!ok) { res.status(404).json({ error: 'message not found' }); return; }
  broadcastToWorkspace(id, 'channel.message.deleted', { channelId, messageId });
  res.status(204).end();
});

// DELETE /api/workspaces/:id/channels/:channelId/messages
router.delete('/:channelId/messages', (req: Request<ChannelParams>, res: Response) => {
  const { id, channelId } = req.params;
  const ok = clearMessages(id, channelId!);
  if (!ok) { res.status(404).json({ error: 'no messages to clear' }); return; }
  broadcastToWorkspace(id, 'channel.messages.cleared', { channelId });
  res.status(204).end();
});

export default router;
