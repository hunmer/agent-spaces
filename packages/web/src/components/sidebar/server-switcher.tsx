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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, ChevronsUpDown, Pencil, Plus, Server, Trash2 } from "lucide-react";
import {
  type ServerConfig,
  loadServers,
  saveServers,
  loadActiveId,
  saveActiveId,
  setActiveServerCookie,
} from "@/lib/server";

export function ServerSwitcher() {
  const { isMobile } = useSidebar();
  const [servers, setServers] = React.useState<ServerConfig[]>(loadServers);
  const [activeId, setActiveId] = React.useState(loadActiveId);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");

  const activeServer = servers.find((s) => s.id === activeId) || servers[0];
  const isEditing = editingId !== null;

  const openAddDialog = () => {
    setEditingId(null);
    setName("");
    setUrl("");
    setDialogOpen(true);
  };

  const openEditDialog = (server: ServerConfig) => {
    setEditingId(server.id);
    setName(server.name);
    setUrl(server.url);
    setDialogOpen(true);
  };

  const saveServer = () => {
    if (!name.trim() || !url.trim()) return;
    let normalizedUrl = url.trim().replace(/\/$/, "");
    if (!/^https?:\/\//.test(normalizedUrl)) normalizedUrl = "http://" + normalizedUrl;

    if (isEditing) {
      const updated = servers.map((s) =>
        s.id === editingId ? { ...s, name: name.trim(), url: normalizedUrl } : s,
      );
      setServers(updated);
      saveServers(updated);
      if (editingId === activeId) setActiveServerCookie(normalizedUrl);
    } else {
      const server: ServerConfig = {
        id: Date.now().toString(),
        name: name.trim(),
        url: normalizedUrl,
      };
      const updated = [...servers, server];
      setServers(updated);
      saveServers(updated);
    }
    setDialogOpen(false);
  };

  const switchServer = (server: ServerConfig) => {
    setActiveId(server.id);
    saveActiveId(server.id);
    setActiveServerCookie(server.id === "default" ? null : server.url);
    window.location.reload();
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
                  Servers
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
                    <div className="text-xs text-muted-foreground truncate">
                      {server.url}
                    </div>
                  </div>
                  {server.id === activeId && (
                    <Check className="size-4 text-primary shrink-0" />
                  )}
                  {server.id !== "default" && (
                    <>
                      <Pencil
                        className="size-3.5 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditDialog(server);
                        }}
                      />
                      <Trash2
                        className="size-3.5 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeServer(server.id);
                        }}
                      />
                    </>
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2 p-2" onClick={openAddDialog}>
                <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                  <Plus className="size-4" />
                </div>
                <div className="font-medium text-muted-foreground">Add Server</div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Server" : "Add Server"}</DialogTitle>
            <DialogDescription>
              {isEditing ? "Update server connection details." : "Add an API server to connect to."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Server"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">URL</label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://192.168.1.100:3100"
                onKeyDown={(e) => e.key === "Enter" && saveServer()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveServer} disabled={!name.trim() || !url.trim()}>
              {isEditing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
