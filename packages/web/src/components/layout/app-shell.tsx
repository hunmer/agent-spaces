"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/sidebar/app-sidebar";
import { WorkspaceDialog } from "@/components/workspace/workspace-dialog";
import { useWorkspaceStore } from "@/stores/workspace";
import { isLoginPath, isWorkflowSharePath, isMiniAppPreviewPath } from "@/lib/routes";
import { sdk } from "@/lib/sdk";
import { useLLMStore } from "@/stores/llm";
import { CustomShortcutExecutor } from "@/components/layout/custom-shortcut-executor";
import { GlobalConfirmDialog } from "@/components/layout/global-confirm-dialog";
import { saveRuntimeCliDiscovery } from "@/lib/runtime-cli-settings";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { tauriNavigate } from "@/lib/navigate";
import { useTranslations } from "next-intl";
import { FolderOpen, Check } from "lucide-react";
import type { Workspace } from "@agent-spaces/shared";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const loadCatalog = useLLMStore((s) => s.loadCatalog);

  // 登录后预加载 catalog，用于 provider 图标按 id 统一显示
  useEffect(() => {
    if (!isLoginPath(pathname)) loadCatalog();
  }, [pathname, loadCatalog]);

  // 应用启动时拉取 runtime 探测结果写入 localStorage，确保 agent-editor 无需先访问 runtime-tab 即可显示完整 runtime 列表
  useEffect(() => {
    if (isLoginPath(pathname)) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await sdk.http.post<{ items: Parameters<typeof saveRuntimeCliDiscovery>[0] }>(
          "/api/runtime/discover-cli",
          {},
        );
        if (!cancelled) saveRuntimeCliDiscovery(data.items);
      } catch {
        // 静默失败，用户进入 runtime-tab 时会再次重试
      }
    })();
    return () => { cancelled = true; };
  }, [pathname]);

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
          {children}
        </SidebarInset>
      </SidebarProvider>
      <GlobalWorkspaceDialog />
      <GlobalConfirmDialog />
      <CustomShortcutExecutor />
    </>
  );
}

function GlobalWorkspaceDialog() {
  const dialogOpen = useWorkspaceStore((s) => s.dialogOpen);
  const editingWorkspace = useWorkspaceStore((s) => s.editingWorkspace);
  const closeWorkspaceDialog = useWorkspaceStore((s) => s.closeWorkspaceDialog);
  const upsertWorkspace = useWorkspaceStore((s) => s.upsertWorkspace);
  const router = useRouter();
  const t = useTranslations("workspace");
  const [createdWorkspace, setCreatedWorkspace] = useState<Workspace | null>(null);

  const handleSubmit = async (data: { name: string; boundDirs: string[] }) => {
    if (editingWorkspace) {
      const ws = await sdk.workspace.update(editingWorkspace.id, data);
      upsertWorkspace(ws);
    } else {
      const ws = await sdk.workspace.create(data);
      upsertWorkspace(ws);
      setCreatedWorkspace(ws);
    }
  };

  const handleSwitch = () => {
    if (!createdWorkspace) return;
    tauriNavigate(router, `/workspace/${createdWorkspace.id}`);
    setCreatedWorkspace(null);
  };

  return (
    <>
      <WorkspaceDialog
        open={dialogOpen}
        onOpenChange={(open) => { if (!open) closeWorkspaceDialog(); }}
        workspace={editingWorkspace}
        onSubmit={handleSubmit}
      />
      <Dialog open={!!createdWorkspace} onOpenChange={(open) => { if (!open) setCreatedWorkspace(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Check className="size-4" />
              </span>
              {t("success.title")}
            </DialogTitle>
            <DialogDescription>
              {createdWorkspace
                ? t("success.description", { name: createdWorkspace.name })
                : t("success.description", { name: "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatedWorkspace(null)}>
              {t("success.stayHere")}
            </Button>
            <Button onClick={handleSwitch} className="gap-1.5">
              <FolderOpen className="size-4" />
              {t("success.switchNow")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
