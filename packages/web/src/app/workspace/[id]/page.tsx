"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { WorkspaceTabs } from "@/components/layout/workspace-tabs";
import type { Workspace } from "@agent-spaces/shared";

export default function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/workspaces/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setWorkspace)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error}</p>
        <Link href="/" className="text-sm underline">
          Back to home
        </Link>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <WorkspaceTabs />
      <div className="flex-1 overflow-hidden">
        <WorkspaceShell workspaceId={workspace.id} />
      </div>
    </div>
  );
}
