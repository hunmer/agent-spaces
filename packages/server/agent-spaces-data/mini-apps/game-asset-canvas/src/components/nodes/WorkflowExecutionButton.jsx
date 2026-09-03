import { ExternalLink } from '@agent-spaces/ui';

export default function WorkflowExecutionButton({ execution }) {
  if (!execution?.workflowId || !execution?.logId) return null;

  const openResult = () => {
    const workflowId = encodeURIComponent(execution.workflowId);
    const logId = encodeURIComponent(execution.logId);
    window.open(`/workflows/${workflowId}?logId=${logId}`, '_blank', 'noopener');
  };

  return (
    <button
      type="button"
      title="查看工作流执行结果"
      aria-label="查看工作流执行结果"
      onClick={openResult}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:border-primary hover:text-primary"
    >
      <ExternalLink className="h-4 w-4" />
    </button>
  );
}
