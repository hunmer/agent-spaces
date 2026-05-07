"use client";

import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/auth";
import type { Workspace, WorkflowTemplate } from "@agent-spaces/shared";
import { WorkflowsPage } from "@/components/workflows/workflows-page";

export default function WorkflowsRoute() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  useEffect(() => {
    fetch("/api/workspaces", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then(setWorkspaces);
  }, []);

  return <WorkflowsPage workspaces={workspaces} />;
}
