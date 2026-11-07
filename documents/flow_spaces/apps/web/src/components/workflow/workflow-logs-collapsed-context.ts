import { createContext, useContext } from 'react';

const WorkflowLogsCollapsedContext = createContext<{
  collapsed: boolean;
  toggle: () => void;
}>({ collapsed: true, toggle: () => {} });

export { WorkflowLogsCollapsedContext };

export function useWorkflowLogsCollapsed() {
  return useContext(WorkflowLogsCollapsedContext);
}
