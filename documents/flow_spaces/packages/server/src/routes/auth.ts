import { Router } from 'express';
import { getSecret, setSecret } from '../services/auth-store.js';

const router = Router();

router.post('/login', (req, res) => {
  const { secret } = req.body as { secret?: string };
  const currentSecret = getSecret();

  if ((secret ?? '') !== currentSecret) {
    res.status(403).json({ error: 'Invalid secret' });
    return;
  }

  res.json({ ok: true, token: currentSecret });
});

router.get('/check', (req, res) => {
  const currentSecret = getSecret();
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : '';

  res.json({ authenticated: token === currentSecret, secretSet: currentSecret !== '' });
});

router.post('/change-secret', (req, res) => {
  const { newSecret, currentToken } = req.body as { newSecret?: string; currentToken?: string };
  const currentSecret = getSecret();

  if ((currentToken ?? '') !== currentSecret) {
    res.status(403).json({ error: 'Unauthorized' });
    return;
  }

  setSecret(newSecret ?? '');
  res.json({ ok: true });
});

export default router;
