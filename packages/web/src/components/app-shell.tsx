"use client";

import { usePathname } from "next/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/sidebar/app-sidebar";
import { WorkspaceTabs } from "@/components/layout/workspace-tabs";
import { DevInspector } from "@/components/dev-inspector";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <>
      <DevInspector />
      <SidebarProvider>
        <DashboardSidebar />
        <SidebarInset>
          <WorkspaceTabs />
          {children}
        </SidebarInset>
      </SidebarProvider>
    </>
  );
}
