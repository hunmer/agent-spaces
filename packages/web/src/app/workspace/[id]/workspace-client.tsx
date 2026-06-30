"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useWorkspaceStore } from "@/stores/workspace";
import { useChannelStore } from "@/stores/channel";
import { useMobilePanelStore } from "@/stores/mobile-panel";
import type { Workspace } from "@agent-spaces/shared";
import { useRouter } from "next/navigation";
import { tauriNavigate } from "@/lib/navigate";

const MobileTabBar = dynamic(
  () => import("@/components/layout/mobile-tab-bar").then((mod) => mod.MobileTabBar),
  {
    ssr: false,
    loading: () => null,
  },
);

const WorkspaceShell = dynamic(
  () => import("@/components/layout/workspace-shell").then((mod) => mod.WorkspaceShell),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    ),
  },
);

function useWorkspaceId() {
  const searchParams = useSearchParams();
  const queryId = searchParams.get("workspaceId") || "";
  const [pathId, setPathId] = useState("");

  useEffect(() => {
    const match = window.location.pathname.match(/\/workspace\/([^/]+)/);
    setPathId(match?.[1] || "");
  }, []);

  return useMemo(() => queryId || pathId, [pathId, queryId]);
}

export function WorkspaceClient() {
  const id = useWorkspaceId();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const upsertWorkspace = useWorkspaceStore((state) => state.upsertWorkspace);
  const ensureAndActivateChannel = useChannelStore((state) => state.ensureAndActivateChannel);
  const setActivePanel = useMobilePanelStore((state) => state.setActivePanel);

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
        localStorage.setItem("lastWorkspaceId", id);
      })
      .catch((e) => setError(e.message));
  }, [id, upsertWorkspace]);

  useEffect(() => {
    const channelId = searchParams.get("channelId");
    if (!id || !channelId) return;
    void ensureAndActivateChannel(id, channelId);
    setActivePanel("chat");
  }, [ensureAndActivateChannel, id, searchParams, setActivePanel]);

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error}</p>
        <button type="button" onClick={() => tauriNavigate(router, "/")} className="text-sm underline">
          Back to home
        </button>
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
