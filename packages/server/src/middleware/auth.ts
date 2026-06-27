import type { Request, Response, NextFunction } from 'express';
import { getSecret } from '../services/auth-store.js';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const secret = getSecret();

  const openPaths = ['/api/health', '/api/auth/login', '/api/auth/check', '/api/version', '/api/version/check'];
  if (openPaths.includes(req.path)) return next();

  // Allow public access to mini-app avatar images
  if (/^\/api\/mini-apps\/[^/]+\/avatar$/.test(req.path)) return next();

  // mini-app 本地文件代理（如 Eagle 资源库图片）：<img src> 无法带 Authorization
  // header，这里支持 query token 鉴权。路径校验在路由层完成。
  if (/^\/api\/mini-apps\/[^/]+\/local-file$/.test(req.path)) {
    const queryToken = req.query.token;
    if (typeof queryToken === 'string' && queryToken === secret) return next();
  }

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
