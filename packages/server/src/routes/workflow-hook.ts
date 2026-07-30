// Workflow webhook hook handler — SSE streaming of execution results

import { Router } from 'express';
import type { ExecutionManager } from '../services/execution-manager.js';
import type { WorkflowTriggerService } from '../services/workflow-trigger-service.js';

const SSE_TIMEOUT_MS = 5 * 60_000;

export function createWorkflowHookRouter(
  triggerService: WorkflowTriggerService,
  executionManager: ExecutionManager,
): Router {
  const router = Router();

  router.post('/hook/:hookName', (req, res) => {
    const hookName = req.params.hookName as string;
    console.log(`[workflow-hook] Incoming hook request: hook="${hookName}"`);

    const bindings = triggerService.getHookBindings(hookName);
    if (bindings.length === 0) {
      console.warn(`[workflow-hook] No bindings found for hook "${hookName}"`);
      res.status(404).json({ error: `No workflows bound to hook "${hookName}"` });
      return;
    }

    const body: {
      workflowId?: string;
      input?: Record<string, unknown>;
      pluginConfigs?: Record<string, string | Record<string, unknown>>;
      plugin_configs?: Record<string, string | Record<string, unknown>>;
    } = req.body || {};
    console.log(`[workflow-hook] Bound workflow count for hook "${hookName}": ${bindings.length}`);
    let targets = bindings;
    if (body.workflowId) {
      targets = bindings.filter(b => b.workflowId === body.workflowId);
      if (targets.length === 0) {
        console.warn(`[workflow-hook] Workflow ${body.workflowId} is not bound to hook "${hookName}"`);
        res.status(404).json({ error: `Workflow ${body.workflowId} not bound to hook "${hookName}"` });
        return;
      }
    }
    console.log(`[workflow-hook] Dispatching hook "${hookName}" to ${targets.length} workflow(s); requested workflowId=${body.workflowId || 'ALL'}; inputKeys=${Object.keys(body.input || {}).join(',') || '(none)'}`);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let completed = 0;
    let closed = false;

    const sse = (event: string, payload: unknown) => {
      if (closed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    const timeoutId = setTimeout(() => {
      if (!closed) {
        sse('timeout', { message: 'SSE timeout, closing' });
        res.write('event: done\ndata: {}\n\n');
        closed = true;
        res.end();
      }
    }, SSE_TIMEOUT_MS);

    res.on('close', () => {
      closed = true;
      clearTimeout(timeoutId);
    });

    const total = targets.length;
    for (const binding of targets) {
      console.log(`[workflow-hook] Executing workflow ${binding.workflowId} from hook "${hookName}" (trigger=${binding.triggerId})`);
      executionManager.execute(
        {
          workflowId: binding.workflowId,
          input: body.input || {},
          ...((body.pluginConfigs || body.plugin_configs) ? { pluginConfigs: body.pluginConfigs || body.plugin_configs } : {}),
        },
        '__hook__',
        (channel, payload) => sse(channel, payload),
      ).then(() => {
        console.log(`[workflow-hook] Workflow ${binding.workflowId} completed for hook "${hookName}"`);
        completed++;
        if (completed === total && !closed) {
          clearTimeout(timeoutId);
          res.write('event: done\ndata: {}\n\n');
          closed = true;
          res.end();
        }
      }).catch((err: any) => {
        console.error(`[workflow-hook] Workflow ${binding.workflowId} failed for hook "${hookName}": ${err.message}`);
        sse('workflow:error', { workflowId: binding.workflowId, error: err.message });
        completed++;
        if (completed === total && !closed) {
          clearTimeout(timeoutId);
          res.write('event: done\ndata: {}\n\n');
          closed = true;
          res.end();
        }
      });
    }
  });

  return router;
}
