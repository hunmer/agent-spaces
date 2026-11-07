import { join } from 'node:path';
import { getDataDir, readJsonFile, writeJsonFile } from './json-store.js';

export type WorkflowFaultTolerance = 'ignore' | 'stop';

export interface WorkflowSettings {
  faultTolerance: WorkflowFaultTolerance;
}

export const DEFAULT_WORKFLOW_FAULT_TOLERANCE: WorkflowFaultTolerance = 'ignore';

const FILE = () => join(getDataDir(), 'workflow-settings.json');

function normalizeFaultTolerance(value: unknown): WorkflowFaultTolerance {
  return value === 'stop' ? 'stop' : 'ignore';
}

export function getWorkflowSettings(): WorkflowSettings {
  const settings = readJsonFile<Partial<WorkflowSettings>>(FILE()) ?? {};
  return {
    faultTolerance: normalizeFaultTolerance(settings.faultTolerance),
  };
}

export function saveWorkflowSettings(input: Partial<WorkflowSettings>): WorkflowSettings {
  const settings: WorkflowSettings = {
    faultTolerance: normalizeFaultTolerance(input.faultTolerance),
  };
  writeJsonFile(FILE(), settings);
  return settings;
}
