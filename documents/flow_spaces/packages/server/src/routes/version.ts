import { Router, type Request, type Response } from 'express';
import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLocalVersion, getCachedLatest, fetchLatestVersion, isNewerVersion } from '../services/version.js';

const router = Router();
const isSourceRuntime = /[\\/]src[\\/]routes$/.test(import.meta.dirname);
const isDev = process.env.NODE_ENV === 'development' || (!process.env.NODE_ENV && isSourceRuntime);

let isUpdating = false;

// GET /version — cached version info (openPaths in auth.ts)
router.get('/version', async (_req: Request, res: Response) => {
  const local = getLocalVersion();
  if (isDev) {
    res.json({ local, latest: null, updateAvailable: false, dev: true });
    return;
  }
  let latest = getCachedLatest();
  if (!latest) {
    latest = await fetchLatestVersion(false);
  }
  res.json({ local, latest, updateAvailable: latest ? isNewerVersion(latest, local) : false });
});

// GET /version/check — force npm lookup (openPaths in auth.ts)
router.get('/version/check', async (_req: Request, res: Response) => {
  const local = getLocalVersion();
  if (isDev) {
    res.json({ local, latest: null, updateAvailable: false, dev: true });
    return;
  }
  const latest = await fetchLatestVersion(true);
  res.json({
    local,
    latest,
    updateAvailable: latest ? isNewerVersion(latest, local) : false,
  });
});

// POST /version/update — trigger self-update (requires auth)
router.post('/version/update', (_req: Request, res: Response) => {
  if (isDev) {
    res.status(403).json({ error: 'Updates are disabled in development mode' });
    return;
  }
  if (isUpdating) {
    res.status(409).json({ error: 'Update already in progress' });
    return;
  }
  isUpdating = true;

  const pid = process.pid;
  const ppid = process.ppid;
  const projectRoot = join(import.meta.dirname, '..', '..');
  const isWin = process.platform === 'win32';

  let scriptPath: string;
  if (isWin) {
    scriptPath = join(tmpdir(), `agent-spaces-update-${pid}.cmd`);
    const cmd = [
      '@echo off',
      'timeout /t 2 /nobreak >nul',
      `taskkill /pid ${ppid} /f /t >nul 2>&1`,
      `taskkill /pid ${pid} /f /t >nul 2>&1`,
      `cd /d "${projectRoot}"`,
      'call pnpm install',
      'call pnpm start',
    ].join('\r\n');
    writeFileSync(scriptPath, cmd, 'utf-8');
  } else {
    scriptPath = join(tmpdir(), `agent-spaces-update-${pid}.sh`);
    const sh = [
      '#!/bin/sh',
      'sleep 2',
      `kill -9 ${ppid} 2>/dev/null || true`,
      `kill -9 ${pid} 2>/dev/null || true`,
      `cd "${projectRoot}"`,
      'pnpm install',
      'pnpm start',
    ].join('\n');
    writeFileSync(scriptPath, sh, 'utf-8');
  }

  const child = spawn(isWin ? 'cmd' : '/bin/sh', isWin ? ['/c', scriptPath] : [scriptPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();

  setTimeout(() => {
    try { unlinkSync(scriptPath); } catch {}
  }, 10_000);

  res.json({ ok: true });
});

export default router;
