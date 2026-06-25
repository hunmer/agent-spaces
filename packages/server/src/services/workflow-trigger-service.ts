import crypto from 'node:crypto';
import type { default as nodeCronType, ScheduledTask } from 'node-cron';
import type { Workflow, WorkflowTrigger } from '@agent-spaces/shared';
import * as store from '../storage/workflow-store.js';
import type { ExecutionManager } from './execution-manager.js';

interface HookBinding {
  workflowId: string;
  triggerId: string;
}

export class WorkflowTriggerService {
  private cronJobs = new Map<string, ScheduledTask>();
  private hookIndex = new Map<string, Set<HookBinding>>();
  private nodeCron: typeof nodeCronType | null = null;
  private executionManager: ExecutionManager | null = null;

  constructor(private port: number = 3100) {
    try {
      this.nodeCron = require('node-cron');
    } catch {
      // node-cron not available
    }
  }

  setExecutionManager(em: ExecutionManager): void {
    this.executionManager = em;
    console.log('[TriggerService] Execution manager attached');
  }

  async start(): Promise<void> {
    const workflows = store.listWorkflows();
    console.log(`[TriggerService] Starting trigger registration for ${workflows.length} workflow(s)`);
    for (const wf of workflows) {
      this.registerTriggers(wf);
    }
    console.log(`[TriggerService] Started. ${this.cronJobs.size} cron jobs, ${this.hookIndex.size} hooks registered`);
  }

  reloadWorkflow(workflowId: string): void {
    console.log(`[TriggerService] Reloading triggers for workflow ${workflowId}`);
    this.clearTriggersForWorkflow(workflowId);
    const wf = store.getWorkflow(workflowId);
    if (wf) {
      this.registerTriggers(wf);
      return;
    }
    console.warn(`[TriggerService] Workflow ${workflowId} not found during reload`);
  }

  removeWorkflow(workflowId: string): void {
    console.log(`[TriggerService] Removing triggers for workflow ${workflowId}`);
    this.clearTriggersForWorkflow(workflowId);
  }

  getHookBindings(hookName: string): HookBinding[] {
    return Array.from(this.hookIndex.get(hookName) ?? []);
  }

  getHookConflicts(hookName: string, excludeWorkflowId?: string): { conflictWorkflowIds: string[] } {
    const bindings = this.hookIndex.get(hookName) ?? new Set();
    const ids = Array.from(bindings)
      .map(b => b.workflowId)
      .filter(id => id !== excludeWorkflowId);
    return { conflictWorkflowIds: [...new Set(ids)] };
  }

  getHookUrl(hookName: string): string {
    return `http://localhost:${this.port}/api/workflows/hook/${hookName}`;
  }

  validateCron(cronExpr: string): { valid: boolean; nextRuns: string[]; error?: string } {
    if (!this.nodeCron) return { valid: false, nextRuns: [], error: 'node-cron not available' };
    if (!this.nodeCron.validate(cronExpr)) {
      return { valid: false, nextRuns: [], error: 'Invalid cron expression' };
    }
    try {
      const CronExpressionParser = require('cron-parser');
      const interval = CronExpressionParser.parse(cronExpr);
      const nextRuns: string[] = [];
      for (let i = 0; i < 5; i++) {
        const iso = interval.next().toISOString();
        if (iso) nextRuns.push(iso);
      }
      return { valid: true, nextRuns };
    } catch (err: any) {
      return { valid: false, nextRuns: [], error: err.message };
    }
  }

  stop(): void {
    console.log(`[TriggerService] Stopping. ${this.cronJobs.size} cron jobs, ${this.hookIndex.size} hook(s) will be cleared`);
    for (const [, task] of this.cronJobs) {
      task.stop();
    }
    this.cronJobs.clear();
    this.hookIndex.clear();
  }

  private registerTriggers(wf: Workflow): void {
    if (!wf.triggers || wf.triggers.length === 0) {
      console.log(`[TriggerService] Workflow ${wf.id} has no triggers to register`);
      return;
    }
    console.log(`[TriggerService] Registering ${wf.triggers.length} trigger(s) for workflow ${wf.id}`);
    for (const trigger of wf.triggers) {
      if (!trigger.enabled) {
        console.log(`[TriggerService] Skip disabled trigger ${trigger.id} for workflow ${wf.id}`);
        continue;
      }
      if (trigger.type === 'cron') {
        this.registerCronJob(wf.id, trigger);
      } else if (trigger.type === 'hook') {
        this.registerHookBinding(wf.id, trigger);
      }
    }
  }

  private registerCronJob(workflowId: string, trigger: WorkflowTrigger & { type: 'cron' }): void {
    if (!this.nodeCron) {
      console.warn(`[TriggerService] node-cron unavailable, skip cron trigger ${trigger.id} for workflow ${workflowId}`);
      return;
    }
    const key = `${workflowId}:${trigger.id}`;
    try {
      console.log(`[TriggerService] Register cron trigger ${trigger.id} for workflow ${workflowId}: expr="${trigger.cron}" timezone="${trigger.timezone || 'system'}"`);
      const task = this.nodeCron.schedule(trigger.cron, () => {
        console.log(`[TriggerService] Cron fired for workflow ${workflowId} (trigger=${trigger.id}, expr="${trigger.cron}", timezone="${trigger.timezone || 'system'}")`);
        if (this.executionManager) {
          console.log(`[TriggerService] Dispatching cron execution for workflow ${workflowId} via execution manager`);
          this.executionManager.execute({ workflowId }, '__cron__').catch((err: any) => {
            console.error(`[TriggerService] Cron execution failed for ${workflowId}: ${err.message}`);
          });
        } else {
          console.warn(`[TriggerService] Execution manager missing; cron trigger ${trigger.id} for workflow ${workflowId} cannot run`);
        }
      }, { timezone: trigger.timezone });
      this.cronJobs.set(key, task);
      console.log(`[TriggerService] Cron trigger ${trigger.id} registered under key ${key}`);
    } catch (err: any) {
      console.error(`[TriggerService] Invalid cron "${trigger.cron}" for workflow ${workflowId}: ${err.message}`);
    }
  }

  private registerHookBinding(workflowId: string, trigger: WorkflowTrigger & { type: 'hook' }): void {
    let bindings = this.hookIndex.get(trigger.hookName);
    if (!bindings) {
      bindings = new Set();
      this.hookIndex.set(trigger.hookName, bindings);
    }
    bindings.add({ workflowId, triggerId: trigger.id });
    console.log(`[TriggerService] Register hook trigger ${trigger.id} for workflow ${workflowId}: hook="${trigger.hookName}" bindings=${bindings.size}`);
  }

  private clearTriggersForWorkflow(workflowId: string): void {
    for (const [key, task] of this.cronJobs) {
      if (key.startsWith(`${workflowId}:`)) {
        task.stop();
        this.cronJobs.delete(key);
        console.log(`[TriggerService] Cleared cron trigger ${key}`);
      }
    }
    for (const [hookName, bindings] of this.hookIndex) {
      for (const binding of bindings) {
        if (binding.workflowId === workflowId) {
          bindings.delete(binding);
          console.log(`[TriggerService] Cleared hook trigger ${binding.triggerId} for workflow ${workflowId} from hook "${hookName}"`);
        }
      }
      if (bindings.size === 0) {
        this.hookIndex.delete(hookName);
        console.log(`[TriggerService] Removed empty hook binding set for "${hookName}"`);
      }
    }
  }
}
