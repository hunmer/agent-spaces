import { Router } from 'express';
import type { Request, Response } from 'express';
import { listRobotAccounts, createAccount, updateAccount, deleteRobotAccount } from '../services/robot-account.js';
import { getGlobalWeChatQRCode, pollGlobalWeChatQRCode } from '../services/global-wechat-qr.js';

type Params = { id: string };

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(listRobotAccounts());
});

router.post('/', (req: Request, res: Response) => {
  const { name, type, lark, wechat } = req.body as {
    name?: string;
    type?: 'lark' | 'wechat';
    lark?: { appId: string; appSecret: string };
    wechat?: { token: string; baseUrl?: string; accountId: string; userId?: string };
  };
  if (!name || !type) { res.status(400).json({ error: 'name and type are required' }); return; }
  if (!['lark', 'wechat'].includes(type)) { res.status(400).json({ error: 'type must be lark or wechat' }); return; }
  if (type === 'lark' && (!lark?.appId || !lark?.appSecret)) { res.status(400).json({ error: 'lark.appId and lark.appSecret are required' }); return; }
  if (type === 'wechat' && (!wechat?.token || !wechat?.accountId)) { res.status(400).json({ error: 'wechat.token and wechat.accountId are required' }); return; }
  const account = createAccount({ name, type, lark, wechat });
  res.status(201).json(account);
});

router.put('/:id', (req: Request<Params>, res: Response) => {
  const { id } = req.params;
  const { name, lark, wechat } = req.body as {
    name?: string;
    lark?: { appId: string; appSecret: string };
    wechat?: { token: string; baseUrl?: string; accountId: string; userId?: string };
  };
  const updated = updateAccount(id, { name, lark, wechat });
  if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(updated);
});

router.delete('/:id', (req: Request<Params>, res: Response) => {
  const deleted = deleteRobotAccount(req.params.id);
  if (!deleted) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ ok: true });
});

// Global WeChat QR login (not bound to a workspace)
router.post('/wechat/qr', async (_req: Request, res: Response) => {
  try {
    const result = await getGlobalWeChatQRCode();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to get WeChat QR code' });
  }
});

router.post('/wechat/qr/poll', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body as { sessionId?: string };
    const result = await pollGlobalWeChatQRCode(sessionId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to poll WeChat QR status' });
  }
});

export default router;
