import { Router } from 'express';
import type { Request, Response } from 'express';
import * as ws from '../services/workflow.js';
import type { WorkflowTriggerService } from '../services/workflow-trigger-service.js';

const router = Router();
let workflowTriggerService: WorkflowTriggerService | null = null;

export function setWorkflowTriggerService(service: WorkflowTriggerService): void {
  workflowTriggerService = service;
}

function reloadWorkflowTriggers(workflowId: string): void {
  if (!workflowTriggerService) {
    console.warn(`[workflow] Trigger service unavailable; skip reloading triggers for workflow ${workflowId}`);
    return;
  }
  workflowTriggerService.reloadWorkflow(workflowId);
}

function removeWorkflowTriggers(workflowId: string): void {
  if (!workflowTriggerService) {
    console.warn(`[workflow] Trigger service unavailable; skip removing triggers for workflow ${workflowId}`);
    return;
  }
  workflowTriggerService.removeWorkflow(workflowId);
}

// ---- Workflow CRUD ----

router.get('/', (_req: Request, res: Response) => {
  try {
    const folderId = _req.query.folderId as string | undefined;
    const workflows = ws.listWorkflows(folderId === 'null' ? null : folderId);
    res.json(workflows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Static routes must be declared before /:workflowId.

router.get('/folders', (_req: Request, res: Response) => {
  try {
    res.json(ws.listFolders());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/folders', (req: Request, res: Response) => {
  try {
    const folder = ws.createFolder(req.body);
    res.status(201).json(folder);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/folders/:folderId', (req: Request<{ folderId: string }>, res: Response) => {
  try {
    ws.updateFolder(req.params.folderId, req.body);
    const folders = ws.listFolders();
    res.json(folders.find(f => f.id === req.params.folderId));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/folders/:folderId', (req: Request<{ folderId: string }>, res: Response) => {
  try {
    ws.deleteFolder(req.params.folderId);
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/execution-logs/all', (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    res.json(ws.listAllExecutionLogs(limit));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/validate-cron', (req: Request, res: Response) => {
  try {
    const { cron } = req.body;
    if (typeof cron !== 'string') {
      res.status(400).json({ error: 'cron field is required' });
      return;
    }
    res.json(ws.validateCron(cron));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:workflowId', (req: Request<{ workflowId: string }>, res: Response) => {
  try {
    const workflow = ws.getWorkflow(req.params.workflowId);
    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }
    res.json(workflow);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const workflow = ws.createWorkflow(req.body);
    reloadWorkflowTriggers(workflow.id);
    res.status(201).json(workflow);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:workflowId', (req: Request<{ workflowId: string }>, res: Response) => {
  try {
    const workflow = ws.updateWorkflow(req.params.workflowId, req.body);
    reloadWorkflowTriggers(workflow.id);
    res.json(workflow);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:workflowId', (req: Request<{ workflowId: string }>, res: Response) => {
  try {
    ws.deleteWorkflow(req.params.workflowId);
    removeWorkflowTriggers(req.params.workflowId);
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:workflowId/duplicate', (req: Request<{ workflowId: string }>, res: Response) => {
  try {
    const workflow = ws.duplicateWorkflow(req.params.workflowId);
    reloadWorkflowTriggers(workflow.id);
    res.status(201).json(workflow);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ---- Versions ----

router.get('/:workflowId/versions', (req: Request<{ workflowId: string }>, res: Response) => {
  try {
    res.json(ws.listVersions(req.params.workflowId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:workflowId/versions', (req: Request<{ workflowId: string }>, res: Response) => {
  try {
    const version = ws.createVersion(req.params.workflowId, req.body);
    res.status(201).json(version);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:workflowId/versions/:versionId', (req: Request<{ workflowId: string; versionId: string }>, res: Response) => {
  try {
    const version = ws.getVersion(req.params.workflowId, req.params.versionId);
    if (!version) { res.status(404).json({ error: 'Version not found' }); return; }
    res.json(version);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:workflowId/versions/:versionId', (req: Request<{ workflowId: string; versionId: string }>, res: Response) => {
  try {
    ws.deleteVersion(req.params.workflowId, req.params.versionId);
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:workflowId/versions', (req: Request<{ workflowId: string }>, res: Response) => {
  try {
    ws.clearVersions(req.params.workflowId);
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ---- Per-Workflow Execution Logs ----

router.get('/:workflowId/execution-logs', (req: Request<{ workflowId: string }>, res: Response) => {
  try {
    res.json(ws.listExecutionLogs(req.params.workflowId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:workflowId/execution-logs/:logId', (req: Request<{ workflowId: string; logId: string }>, res: Response) => {
  try {
    const log = ws.getExecutionLog(req.params.workflowId, req.params.logId);
    if (!log) { res.status(404).json({ error: 'Execution log not found' }); return; }
    res.json(log);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:workflowId/execution-logs/:logId/path', (req: Request<{ workflowId: string; logId: string }>, res: Response) => {
  try {
    const filePath = ws.getExecutionLogPath(req.params.workflowId, req.params.logId);
    res.json({ path: filePath });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:workflowId/path', (req: Request<{ workflowId: string }>, res: Response) => {
  try {
    const workflow = ws.getWorkflow(req.params.workflowId);
    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }
    const filePath = ws.getWorkflowPath(req.params.workflowId);
    res.json({ path: filePath });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:workflowId/execution-logs/:logId', (req: Request<{ workflowId: string; logId: string }>, res: Response) => {
  try {
    ws.deleteExecutionLog(req.params.workflowId, req.params.logId);
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:workflowId/execution-logs', (req: Request<{ workflowId: string }>, res: Response) => {
  try {
    ws.clearExecutionLogs(req.params.workflowId);
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ---- Staging ----

router.get('/:workflowId/staging', (req: Request<{ workflowId: string }>, res: Response) => {
  try {
    res.json(ws.loadStaging(req.params.workflowId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:workflowId/staging', (req: Request<{ workflowId: string }>, res: Response) => {
  try {
    ws.saveStaging(req.params.workflowId, req.body);
    res.json({ ok: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:workflowId/staging', (req: Request<{ workflowId: string }>, res: Response) => {
  try {
    ws.clearStaging(req.params.workflowId);
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ---- Operation History ----

router.get('/:workflowId/operation-history', (req: Request<{ workflowId: string }>, res: Response) => {
  try {
    res.json(ws.loadOperationHistory(req.params.workflowId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:workflowId/operation-history', (req: Request<{ workflowId: string }>, res: Response) => {
  try {
    const entries = Array.isArray(req.body) ? req.body : req.body?.entries;
    ws.saveOperationHistory(req.params.workflowId, Array.isArray(entries) ? entries : []);
    res.json({ ok: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:workflowId/operation-history', (req: Request<{ workflowId: string }>, res: Response) => {
  try {
    ws.clearOperationHistory(req.params.workflowId);
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ---- Workflow Agent Chat ----

router.get('/:workflowId/chat', (req: Request<{ workflowId: string }>, res: Response) => {
  try {
    res.json(ws.loadChat(req.params.workflowId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:workflowId/chat', (req: Request<{ workflowId: string }>, res: Response) => {
  try {
    ws.saveChat(req.params.workflowId, Array.isArray(req.body?.messages) ? req.body.messages : []);
    res.json({ ok: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:workflowId/chat', (req: Request<{ workflowId: string }>, res: Response) => {
  try {
    ws.clearChat(req.params.workflowId);
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ---- Plugin Config Schemes ----

router.get('/:workflowId/plugin-schemes/:pluginId', (req: Request<{ workflowId: string; pluginId: string }>, res: Response) => {
  try {
    res.json(ws.listPluginSchemes(req.params.workflowId, req.params.pluginId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:workflowId/plugin-schemes/:pluginId/:schemeName', (req: Request<{ workflowId: string; pluginId: string; schemeName: string }>, res: Response) => {
  try {
    ws.createPluginScheme(req.params.workflowId, req.params.pluginId, req.params.schemeName);
    res.status(201).json({ ok: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:workflowId/plugin-schemes/:pluginId/:schemeName', (req: Request<{ workflowId: string; pluginId: string; schemeName: string }>, res: Response) => {
  try {
    res.json(ws.readPluginScheme(req.params.workflowId, req.params.pluginId, req.params.schemeName));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:workflowId/plugin-schemes/:pluginId/:schemeName', (req: Request<{ workflowId: string; pluginId: string; schemeName: string }>, res: Response) => {
  try {
    ws.savePluginScheme(req.params.workflowId, req.params.pluginId, req.params.schemeName, req.body || {});
    res.json({ ok: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:workflowId/plugin-schemes/:pluginId/:schemeName', (req: Request<{ workflowId: string; pluginId: string; schemeName: string }>, res: Response) => {
  try {
    ws.deletePluginScheme(req.params.workflowId, req.params.pluginId, req.params.schemeName);
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
