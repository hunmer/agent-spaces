import { Router, type Request, type Response } from 'express';
import { listChannels, createChannel, getChannel, updateChannel, deleteChannel } from '../services/channel.js';
import { listMessages, createMessage, updateMessage, deleteMessage, clearMessages } from '../services/message.js';
import { broadcastToWorkspace, hasActiveChannelRuns, markInactiveChannelRunsStopped, stopChannelRuns } from '../ws/handler.js';
import { getToolDetail } from '../services/tool-detail.js';

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
  const { name, type, members } = req.body;
  if (!name) { res.status(400).json({ error: 'name required' }); return; }
  const channel = createChannel(req.params.id, { name, type: type || 'general', members });
  broadcastToWorkspace(req.params.id, 'channel.updated', channel);
  res.status(201).json(channel);
});

// PUT /api/workspaces/:id/channels/:channelId
router.put('/:channelId', (req: Request<ChannelParams>, res: Response) => {
  const { id, channelId } = req.params;
  const patch: Parameters<typeof updateChannel>[2] = {};
  for (const key of ['name', 'type', 'issueId', 'members', 'pinnedMentionId', 'draft', 'todos'] as const) {
    if (Object.hasOwn(req.body, key)) patch[key] = req.body[key];
  }
  const channel = updateChannel(id, channelId!, patch);
  if (!channel) { res.status(404).json({ error: 'channel not found' }); return; }
  broadcastToWorkspace(id, 'channel.updated', channel);
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
  if (!getChannel(id, channelId!)) { res.status(404).json({ error: 'channel not found' }); return; }
  if (!hasActiveChannelRuns(id, channelId!)) {
    markInactiveChannelRunsStopped(id, channelId!);
  }
  res.json(listMessages(id, channelId!, { limit: limit ? Number(limit) : undefined, before: before as string | undefined }));
});

// GET /api/workspaces/:id/channels/:channelId/messages/:messageId/tool-details/:detailId
router.get('/:channelId/messages/:messageId/tool-details/:detailId', (req: Request<ChannelParams & { messageId: string; detailId: string }>, res: Response) => {
  const { id, channelId, messageId, detailId } = req.params;
  if (!getChannel(id, channelId!)) { res.status(404).json({ error: 'channel not found' }); return; }
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
