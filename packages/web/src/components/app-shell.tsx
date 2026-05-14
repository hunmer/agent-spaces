"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/sidebar/app-sidebar";
import { WorkspaceTabs } from "@/components/layout/workspace-tabs";
import { DevInspector } from "@/components/dev-inspector";
import { isLoginPath } from "@/lib/routes";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [showTabs, setShowTabs] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("showWorkspaceTabs");
    return saved === null ? true : saved !== "false";
  });

  useEffect(() => {
    const handler = (e: Event) => setShowTabs((e as CustomEvent).detail);
    window.addEventListener("workspace-tabs-visibility", handler);
    return () => window.removeEventListener("workspace-tabs-visibility", handler);
  }, []);

  if (isLoginPath(pathname)) {
    return <>{children}</>;
  }

  return (
    <>
      <DevInspector />
      <SidebarProvider className="h-[var(--app-viewport-height)] min-h-0 bg-[#f2f3f5] dark:bg-[#0f1117]">
        <DashboardSidebar />
        <SidebarInset className="!bg-transparent">
          {showTabs && <WorkspaceTabs />}
          {children}
        </SidebarInset>
      </SidebarProvider>
    </>
  );
}
