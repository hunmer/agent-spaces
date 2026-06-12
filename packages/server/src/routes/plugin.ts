import { Router } from 'express';
import type { Request, Response } from 'express';
import { dirname, basename } from 'path';
import { randomUUID } from 'node:crypto';
import * as pluginService from '../services/plugin.js';
import { createBuiltinPluginApi } from '../services/plugin-runtime-api.js';
import { broadcastToWorkspace } from '../ws/connection-manager.js';
import { startTask, finishTask, failTask } from '../services/mini-app-tasks.js';

const router = Router();

function resolveLocale(req: Request): string | undefined {
  const queryLocale = typeof req.query.locale === 'string' ? req.query.locale : undefined;
  const acceptLanguage = req.headers['accept-language'];
  return queryLocale || (Array.isArray(acceptLanguage) ? acceptLanguage[0] : acceptLanguage);
}

router.get('/:pluginId/icon', (req: Request<{ pluginId: string }>, res: Response) => {
  try {
    const pluginId = req.params.pluginId;
    const result = pluginService.getPluginIconPath(pluginId);
    if (!result) return res.status(404).json({ error: 'Icon not found' });
    res.sendFile(basename(result), { root: dirname(result) }, (err) => {
      if (err) {
        console.warn('[plugin] icon send failed', { pluginId, path: result, error: err.message });
        if (!res.headersSent) res.status(404).json({ error: 'Icon file not found' });
      }
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/', (req: Request, res: Response) => {
  try {
    res.json(pluginService.listPlugins(resolveLocale(req)));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/workflow', (req: Request, res: Response) => {
  try {
    res.json(pluginService.listWorkflowPlugins(resolveLocale(req)));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/store/:pluginId/install', async (req: Request<{ pluginId: string }, unknown, { sourceUrl?: string; md5?: string }>, res: Response) => {
  try {
    res.json(await pluginService.installTemplatePlugin(req.params.pluginId, req.body?.sourceUrl, req.body?.md5));
  } catch (error: any) {
    console.error('[plugin] failed to install store plugin', {
      pluginId: req.params.pluginId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(400).json({ error: error.message });
  }
});

router.post('/:pluginId/enable', (req: Request<{ pluginId: string }>, res: Response) => {
  try {
    res.json(pluginService.setPluginEnabled(req.params.pluginId, true));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:pluginId/disable', (req: Request<{ pluginId: string }>, res: Response) => {
  try {
    res.json(pluginService.setPluginEnabled(req.params.pluginId, false));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:pluginId', (req: Request<{ pluginId: string }>, res: Response) => {
  try {
    pluginService.uninstallPlugin(req.params.pluginId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:pluginId/config', (req: Request<{ pluginId: string }>, res: Response) => {
  try {
    res.json(pluginService.getPluginConfig(req.params.pluginId));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:pluginId/config', (req: Request<{ pluginId: string }>, res: Response) => {
  try {
    res.json(pluginService.savePluginConfig(req.params.pluginId, req.body || {}));
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/:pluginId/workflow-nodes', (req: Request<{ pluginId: string }>, res: Response) => {
  try {
    res.json({ pluginId: req.params.pluginId, nodes: pluginService.getWorkflowNodes(req.params.pluginId, resolveLocale(req)) });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ---- Plugin Tools ----

router.get('/:pluginId/tools', (req: Request<{ pluginId: string }>, res: Response) => {
  try {
    const tools = pluginService.getPluginTools(req.params.pluginId, resolveLocale(req));
    res.json(tools);
  } catch (error: any) {
    res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message });
  }
});

router.post('/:pluginId/tools/execute', async (req: Request<{ pluginId: string }>, res: Response) => {
  try {
    const pluginId = req.params.pluginId;
    const { name, args, workspaceId, executorId, taskId, meta } = req.body ?? {};
    if (!name) { res.status(400).json({ error: 'name is required' }); return; }

    // WS 频道编排：仅当调用方提供 workspaceId（= projectId）时启用，向后兼容普通 execute
    const track = typeof workspaceId === 'string' && workspaceId.length > 0;
    const effectiveTaskId = track ? (taskId || randomUUID()) : null;

    if (track) {
      startTask({
        taskId: effectiveTaskId!,
        projectId: workspaceId,
        pluginId,
        toolName: name,
        executorId: typeof executorId === 'string' ? executorId : 'unknown',
        meta: meta && typeof meta === 'object' ? meta : undefined,
      });
      broadcastToWorkspace(workspaceId, 'miniApp.taskStarted', {
        taskId: effectiveTaskId,
        executorId: typeof executorId === 'string' ? executorId : 'unknown',
        pluginId,
        toolName: name,
        meta: meta && typeof meta === 'object' ? meta : undefined,
      });
    }

    try {
      const result = await pluginService.executePluginTool(pluginId, name, args ?? {}, createBuiltinPluginApi(), resolveLocale(req));
      if (track) {
        finishTask(workspaceId, effectiveTaskId!, result);
        broadcastToWorkspace(workspaceId, 'miniApp.taskFinished', {
          taskId: effectiveTaskId,
          executorId: typeof executorId === 'string' ? executorId : 'unknown',
          pluginId,
          toolName: name,
          meta: meta && typeof meta === 'object' ? meta : undefined,
          result,
        });
      }
      res.json({ success: true, result });
    } catch (error: any) {
      if (track) {
        failTask(workspaceId, effectiveTaskId!, error?.message || String(error));
        broadcastToWorkspace(workspaceId, 'miniApp.taskFailed', {
          taskId: effectiveTaskId,
          executorId: typeof executorId === 'string' ? executorId : 'unknown',
          pluginId,
          toolName: name,
          meta: meta && typeof meta === 'object' ? meta : undefined,
          error: error?.message || String(error),
        });
      }
      res.status(error?.message?.includes('not found') ? 404 : 500).json({ error: error?.message });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
