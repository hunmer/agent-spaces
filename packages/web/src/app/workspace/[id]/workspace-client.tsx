"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { useWorkspaceStore } from "@/stores/workspace";
import type { Workspace } from "@agent-spaces/shared";

function useWorkspaceId() {
  const [id, setId] = useState("");
  useEffect(() => {
    const match = window.location.pathname.match(/\/workspace\/([^/]+)/);
    setId(match?.[1] || "");
  }, []);
  return id;
}

export function WorkspaceClient() {
  const id = useWorkspaceId();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const upsertWorkspace = useWorkspaceStore((state) => state.upsertWorkspace);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/workspaces/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((workspace: Workspace) => {
        setWorkspace(workspace);
        upsertWorkspace(workspace);
      })
      .catch((e) => setError(e.message));
  }, [id, upsertWorkspace]);

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
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <MobileTabBar />
      <div className="min-h-0 flex-1 overflow-hidden">
        <WorkspaceShell workspaceId={workspace.id} boundDirs={workspace.boundDirs} />
      </div>
    </div>
  );
}
