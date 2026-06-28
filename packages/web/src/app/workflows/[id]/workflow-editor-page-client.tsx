"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { workflowApi } from "@/lib/workflow-api";
import { nativeNavigate } from "@/lib/navigate";
import type { Workflow } from "@agent-spaces/shared";
import { WorkflowEditor } from "@/components/workflow/workflow-editor";

export default function WorkflowEditorPageClient() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initialPrompt, setInitialPrompt] = useState(() => searchParams.get("prompt") || "");

  const id = searchParams.get("workflowId") || params.id;
  const embeddedMode = searchParams.get("embedded") === "issue" ? "issue" : null;

  useEffect(() => {
    const prompt = searchParams.get("prompt");
    if (!prompt) return;
    setInitialPrompt((current) => current || prompt);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("prompt");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `/workflows/${id}?${nextQuery}` : `/workflows/${id}`);
  }, [id, router, searchParams]);

  useEffect(() => {
    if (!id || id === "_") return;
    workflowApi
      .get(id)
      .then((wf) => setWorkflow(wf))
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error}</p>
        <button
          type="button"
          onClick={() => nativeNavigate(router, "/workflows")}
          className="text-sm underline"
        >
          Back to workflows
        </button>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <WorkflowEditor
      template={workflow}
      initialAgentPrompt={initialPrompt}
      embeddedMode={embeddedMode}
      onBack={() => nativeNavigate(router, "/workflows")}
    />
  );
}
