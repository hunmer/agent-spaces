"use client";

import { usePathname } from "next/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/sidebar/app-sidebar";
import { WorkspaceTabs } from "@/components/layout/workspace-tabs";
import { DevInspector } from "@/components/dev-inspector";
import { isLoginPath } from "@/lib/routes";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isLoginPath(pathname)) {
    return <>{children}</>;
  }

  return (
    <>
      <DevInspector />
      <SidebarProvider className="bg-[#f2f3f5] dark:bg-[#0f1117]">
        <DashboardSidebar />
        <SidebarInset className="!bg-transparent">
          <WorkspaceTabs />
          {children}
        </SidebarInset>
      </SidebarProvider>
    </>
  );
}
