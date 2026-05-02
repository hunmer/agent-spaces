import { Router, type Request, type Response } from 'express';
import { listChannels, createChannel, getChannel, updateChannel } from '../services/channel.js';
import { listMessages, createMessage } from '../services/message.js';
import { broadcastToWorkspace } from '../ws/handler.js';

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
  const { name, type, members } = req.body;
  const channel = updateChannel(id, channelId!, { name, type, members });
  if (!channel) { res.status(404).json({ error: 'channel not found' }); return; }
  broadcastToWorkspace(id, 'channel.updated', channel);
  res.json(channel);
});

// GET /api/workspaces/:id/channels/:channelId/messages
router.get('/:channelId/messages', (req: Request<ChannelParams>, res: Response) => {
  const { id, channelId } = req.params;
  const { limit, before } = req.query;
  if (!getChannel(id, channelId!)) { res.status(404).json({ error: 'channel not found' }); return; }
  res.json(listMessages(id, channelId!, { limit: limit ? Number(limit) : undefined, before: before as string | undefined }));
});

// POST /api/workspaces/:id/channels/:channelId/messages
router.post('/:channelId/messages', (req: Request<ChannelParams>, res: Response) => {
  const { id, channelId } = req.params;
  const { content, type } = req.body;
  if (!content) { res.status(400).json({ error: 'content required' }); return; }
  if (!getChannel(id, channelId!)) { res.status(404).json({ error: 'channel not found' }); return; }
  const message = createMessage(id, channelId!, { senderId: 'user', content, type });
  broadcastToWorkspace(id, 'channel.message', message);
  res.status(201).json(message);
});

export default router;
