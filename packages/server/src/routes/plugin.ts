import { Router } from 'express';
import type { Request, Response } from 'express';
import { dirname, basename } from 'path';
import * as pluginService from '../services/plugin.js';
import { createBuiltinPluginApi } from '../services/plugin-runtime-api.js';

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

// 本地插件 README.md（从插件目录读取）
router.get('/:pluginId/readme', (req: Request<{ pluginId: string }>, res: Response) => {
  try {
    const content = pluginService.getPluginReadme(req.params.pluginId);
    if (content === null) return res.status(404).json({ error: 'README not found' });
    res.type('text/markdown; charset=utf-8').send(content);
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

router.post('/store/:pluginId/install', async (req: Request<{ pluginId: string }, unknown, { sourceUrl?: string; md5?: string; files?: string[] }>, res: Response) => {
  try {
    res.json(await pluginService.installTemplatePlugin(req.params.pluginId, req.body?.sourceUrl, req.body?.md5, req.body?.files));
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

router.get('/:pluginId/config-schemes', (req: Request<{ pluginId: string }>, res: Response) => {
  try {
    res.json(pluginService.listPluginConfigSchemes(req.params.pluginId));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:pluginId/config-schemes/:schemeName', (req: Request<{ pluginId: string; schemeName: string }>, res: Response) => {
  try {
    pluginService.createPluginConfigScheme(req.params.pluginId, req.params.schemeName);
    res.status(201).json({ ok: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:pluginId/config-schemes/:schemeName', (req: Request<{ pluginId: string; schemeName: string }>, res: Response) => {
  try {
    res.json(pluginService.readPluginConfigScheme(req.params.pluginId, req.params.schemeName));
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

router.put('/:pluginId/config-schemes/:schemeName', (req: Request<{ pluginId: string; schemeName: string }>, res: Response) => {
  try {
    pluginService.savePluginConfigScheme(req.params.pluginId, req.params.schemeName, req.body || {});
    res.json({ ok: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:pluginId/config-schemes/:schemeName', (req: Request<{ pluginId: string; schemeName: string }>, res: Response) => {
  try {
    pluginService.deletePluginConfigScheme(req.params.pluginId, req.params.schemeName);
    res.status(204).send();
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
    const { name, args, workspaceId } = req.body ?? {};
    if (!name) { res.status(400).json({ error: 'name is required' }); return; }

    const result = await pluginService.executePluginTool(pluginId, name, args ?? {}, createBuiltinPluginApi({ workspaceId: typeof workspaceId === 'string' ? workspaceId : undefined }), resolveLocale(req));
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(error?.message?.includes('not found') ? 404 : 500).json({ error: error?.message ?? String(error) });
  }
});

export default router;
