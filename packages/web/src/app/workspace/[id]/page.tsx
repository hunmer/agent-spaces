"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { WorkspaceTabs } from "@/components/layout/workspace-tabs";
import { useWorkspaceTabs } from "@/stores/workspace-tabs";
import type { Workspace } from "@agent-spaces/shared";

export default function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { openTab, activeId } = useWorkspaceTabs();

  useEffect(() => {
    fetch(`/api/workspaces/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((ws) => {
        setWorkspace(ws);
        openTab({ id: ws.id, name: ws.name });
      })
      .catch((e) => setError(e.message));
  }, [id, openTab]);

  useEffect(() => {
    if (activeId && activeId !== id) {
      router.push(`/workspace/${activeId}`);
    }
  }, [activeId, id, router]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error}</p>
        <Link href="/" className="text-sm underline">
          Back to home
        </Link>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col">
      <WorkspaceTabs />
      <div className="flex-1 overflow-hidden">
        <WorkspaceShell workspaceId={workspace.id} />
      </div>
    </div>
  );
}
