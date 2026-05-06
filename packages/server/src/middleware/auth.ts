import type { Request, Response, NextFunction } from 'express';
import { getSecret } from '../services/auth-store.js';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const secret = getSecret();

  const openPaths = ['/api/health', '/api/auth/login', '/api/auth/check'];
  if (openPaths.includes(req.path)) return next();

  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

export function verifyToken(token: string | null): boolean {
  const secret = getSecret();
  return (token ?? '') === secret;
}
