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

  // mini-app data 目录文件（原图/缩略图等本地产物）：<img src> 同样需要 query token。
  if (/^\/api\/mini-apps\/[^/]+\/data\/file$/.test(req.path)) {
    const queryToken = req.query.token;
    if (typeof queryToken === 'string' && queryToken === secret) return next();
  }

  // mini-app 外链图片代理（解决跨域防盗链/CORS）：<img src> 无法带 Authorization header，
  // 由后端 fetch 外链图片字节流透传，这里支持 query token 鉴权。URL 校验在路由层完成。
  if (/^\/api\/mini-apps\/[^/]+\/proxy-image$/.test(req.path)) {
    const queryToken = req.query.token;
    if (typeof queryToken === 'string' && queryToken === secret) return next();
  }

  // mini-app src 目录静态资源（js/css/字体等，供沙箱 iframe 加载 ESM 项目如 Excalidraw）：
  // path 段形式（src/file/<rel>）直接放行：与 Excalidraw 的 new URL(rel, base) 拼接兼容，
  // base 不能带 token query（会被 new URL 丢弃），且 src 为只读前端资源、路径已防穿越，风险可控。
  if (/^\/api\/mini-apps\/[^/]+\/src\/file\//.test(req.path)) return next();

  // query 形式（src/file?path=）支持 query token，用于 <script src>/<link> 直接引用。
  if (/^\/api\/mini-apps\/[^/]+\/src\/file$/.test(req.path)) {
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
