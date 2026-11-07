import { Router } from 'express';
import type { Request, Response } from 'express';
import * as commandService from '../services/command.js';
import * as processManager from '../services/command-process-manager.js';

const router = Router({ mergeParams: true });

router.get('/', (req: Request<{ id: string }>, res: Response) => {
  const workspaceId = req.params.id;
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId required' }); return; }
  try {
    res.json(commandService.listCommands(workspaceId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/processes', (req: Request<{ id: string }>, res: Response) => {
  const workspaceId = req.params.id;
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId required' }); return; }
  res.json(processManager.getCommandProcesses(workspaceId));
});

router.post('/', (req: Request<{ id: string }>, res: Response) => {
  const workspaceId = req.params.id;
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId required' }); return; }
  try {
    const cmd = commandService.createCommand(workspaceId, req.body);
    res.status(201).json(cmd);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:commandId', (req: Request<{ id: string; commandId: string }>, res: Response) => {
  const { id: workspaceId, commandId } = req.params;
  if (!workspaceId || !commandId) { res.status(400).json({ error: 'workspaceId and commandId required' }); return; }
  try {
    const cmd = commandService.updateCommand(workspaceId, commandId, req.body);
    res.json(cmd);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:commandId', (req: Request<{ id: string; commandId: string }>, res: Response) => {
  const { id: workspaceId, commandId } = req.params;
  if (!workspaceId || !commandId) { res.status(400).json({ error: 'workspaceId and commandId required' }); return; }
  try {
    const process = processManager.getCommandProcess(commandId);
    if (process) {
      try { processManager.stopCommand(workspaceId, commandId); } catch {}
    }
    commandService.deleteCommand(workspaceId, commandId);
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:commandId/run', (req: Request<{ id: string; commandId: string }>, res: Response) => {
  const { id: workspaceId, commandId } = req.params;
  if (!workspaceId || !commandId) { res.status(400).json({ error: 'workspaceId and commandId required' }); return; }
  try {
    const sessionId = processManager.runCommand(workspaceId, commandId);
    console.log(`[command] POST run: workspace=${workspaceId} command=${commandId} -> session=${sessionId}`);
    res.json({ sessionId });
  } catch (error: any) {
    console.error(`[command] POST run error: workspace=${workspaceId} command=${commandId}`, error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post('/:commandId/stop', (req: Request<{ id: string; commandId: string }>, res: Response) => {
  const { id: workspaceId, commandId } = req.params;
  if (!workspaceId || !commandId) { res.status(400).json({ error: 'workspaceId and commandId required' }); return; }
  try {
    processManager.stopCommand(workspaceId, commandId);
    console.log(`[command] POST stop: workspace=${workspaceId} command=${commandId}`);
    res.json({ ok: true });
  } catch (error: any) {
    console.error(`[command] POST stop error: workspace=${workspaceId} command=${commandId}`, error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post('/:commandId/restart', (req: Request<{ id: string; commandId: string }>, res: Response) => {
  const { id: workspaceId, commandId } = req.params;
  if (!workspaceId || !commandId) { res.status(400).json({ error: 'workspaceId and commandId required' }); return; }
  try {
    const sessionId = processManager.restartCommand(workspaceId, commandId);
    console.log(`[command] POST restart: workspace=${workspaceId} command=${commandId} -> session=${sessionId}`);
    res.json({ sessionId });
  } catch (error: any) {
    console.error(`[command] POST restart error: workspace=${workspaceId} command=${commandId}`, error.message);
    res.status(400).json({ error: error.message });
  }
});

export default router;
