"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/sidebar/app-sidebar";
import { WorkspaceTabs } from "@/components/layout/workspace-tabs";
import { WorkspaceDialog } from "@/components/workspace/workspace-dialog";
import { useWorkspaceStore } from "@/stores/workspace";
import { isLoginPath, isWorkflowSharePath, isMiniAppPreviewPath } from "@/lib/routes";
import { sdk } from "@/lib/sdk";
import { useLLMStore } from "@/stores/llm";
import { CustomShortcutExecutor } from "@/components/layout/custom-shortcut-executor";
import { GlobalConfirmDialog } from "@/components/layout/global-confirm-dialog";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const loadCatalog = useLLMStore((s) => s.loadCatalog);
  const [showTabs, setShowTabs] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("showWorkspaceTabs");
    return saved === null ? false : saved !== "false";
  });

  useEffect(() => {
    const handler = (e: Event) => setShowTabs((e as CustomEvent).detail);
    window.addEventListener("workspace-tabs-visibility", handler);
    return () => window.removeEventListener("workspace-tabs-visibility", handler);
  }, []);

  // 登录后预加载 catalog，用于 provider 图标按 id 统一显示
  useEffect(() => {
    if (!isLoginPath(pathname)) loadCatalog();
  }, [pathname, loadCatalog]);

  if (isLoginPath(pathname)) {
    return <>{children}</>;
  }

  if (isWorkflowSharePath(pathname) || isMiniAppPreviewPath(pathname)) {
    return <>{children}</>;
  }

  return (
    <>
      <SidebarProvider className="h-[var(--app-content-height)] min-h-0 bg-sidebar">
        <DashboardSidebar />
        <SidebarInset className="!bg-transparent">
          {showTabs && <WorkspaceTabs />}
          {children}
        </SidebarInset>
      </SidebarProvider>
      <GlobalWorkspaceDialog />
      <CustomShortcutExecutor />
    </>
  );
}

function GlobalWorkspaceDialog() {
  const dialogOpen = useWorkspaceStore((s) => s.dialogOpen);
  const editingWorkspace = useWorkspaceStore((s) => s.editingWorkspace);
  const closeWorkspaceDialog = useWorkspaceStore((s) => s.closeWorkspaceDialog);
  const upsertWorkspace = useWorkspaceStore((s) => s.upsertWorkspace);

  const handleSubmit = async (data: { name: string; boundDirs: string[] }) => {
    if (editingWorkspace) {
      const ws = await sdk.workspace.update(editingWorkspace.id, data);
      upsertWorkspace(ws);
    } else {
      const ws = await sdk.workspace.create(data);
      upsertWorkspace(ws);
    }
  };

  return (
    <WorkspaceDialog
      open={dialogOpen}
      onOpenChange={(open) => { if (!open) closeWorkspaceDialog(); }}
      workspace={editingWorkspace}
      onSubmit={handleSubmit}
    />
  );
}
