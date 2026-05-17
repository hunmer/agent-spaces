"use client";

import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Check, ChevronsUpDown, Plus, Server, Settings2 } from "lucide-react";
import {
  type ServerConfig,
  loadServers,
  saveServers,
  loadActiveId,
  saveActiveId,
  setActiveServerCookie,
} from "@/lib/server";
import { useTranslations } from "next-intl";
import { ServerFormDialog } from "./server-form-dialog";
import { ServerManagerDialog } from "./server-manager-dialog";
import { useEditorStore } from "@/stores/editor";

export function ServerSwitcher() {
  const { isMobile } = useSidebar();
  const t = useTranslations("sidebar");
  const [servers, setServers] = React.useState<ServerConfig[]>(loadServers);
  const [activeId, setActiveId] = React.useState(loadActiveId);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [managerOpen, setManagerOpen] = React.useState(false);

  const activeServer = servers.find((s) => s.id === activeId) || servers[0];

  const switchServer = (server: ServerConfig) => {
    useEditorStore.getState().resetEditorState();
    setActiveId(server.id);
    saveActiveId(server.id);
    setActiveServerCookie(server.url);
    window.location.href = "/";
  };

  const removeServer = (id: string) => {
    if (id === "default") return;
    const updated = servers.filter((s) => s.id !== id);
    setServers(updated);
    saveServers(updated);
    if (activeId === id) {
      const fallback = updated.find((s) => s.id === "default") || updated[0];
      if (fallback) switchServer(fallback);
    }
  };

  const handleFormSave = (updated: ServerConfig[]) => {
    setServers(updated);
    saveServers(updated);
    const saved = editingId ? updated.find((s) => s.id === editingId) : updated[updated.length - 1];
    if (editingId && saved && editingId === activeId) setActiveServerCookie(saved.url);
  };

  const handleManagerUpdate = (updated: ServerConfig[]) => {
    setServers(updated);
    saveServers(updated);
    const active = updated.find((server) => server.id === activeId);
    if (active) setActiveServerCookie(active.url);
  };

  if (!activeServer) return null;

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                />
              }
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-background text-foreground">
                <Server className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{activeServer.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {activeServer.url.replace(/^https?:\/\//, "")}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg mb-4"
              align="start"
              side={isMobile ? "bottom" : "right"}
              sideOffset={4}
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {t("server.servers")}
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              {servers.map((server) => (
                <DropdownMenuItem
                  key={server.id}
                  onClick={() => switchServer(server)}
                  className="gap-2 p-2"
                >
                  <div className="flex size-6 items-center justify-center rounded-sm border">
                    <Server className="size-3.5 shrink-0" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{server.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{server.url}</div>
                  </div>
                  {server.id === activeId && <Check className="size-4 text-primary shrink-0" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2 p-2" onClick={() => { setEditingId(null); setFormOpen(true); }}>
                <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                  <Plus className="size-4" />
                </div>
                <div className="font-medium text-muted-foreground">{t("server.addServer")}</div>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 p-2" onClick={() => setManagerOpen(true)}>
                <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                  <Settings2 className="size-4" />
                </div>
                <div className="font-medium text-muted-foreground">{t("server.manageServers")}</div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <ServerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editingId={editingId}
        servers={servers}
        onSave={handleFormSave}
      />

      <ServerManagerDialog
        open={managerOpen}
        onOpenChange={setManagerOpen}
        servers={servers}
        activeId={activeId}
        onUpdate={handleManagerUpdate}
        onRemove={removeServer}
        onSwitch={switchServer}
      />
    </>
  );
}
