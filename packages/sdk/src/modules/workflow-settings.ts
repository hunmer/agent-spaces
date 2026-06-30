import type { HttpClient } from '../client';

export type WorkflowFaultTolerance = 'ignore' | 'stop';

export interface WorkflowSettings {
  faultTolerance: WorkflowFaultTolerance;
}

export function createWorkflowSettingsApi(http: HttpClient) {
  return {
    get: (): Promise<WorkflowSettings> =>
      http.get('/api/workflow-settings'),

    update: (settings: Partial<WorkflowSettings>): Promise<WorkflowSettings> =>
      http.put('/api/workflow-settings', settings),
  };
}
