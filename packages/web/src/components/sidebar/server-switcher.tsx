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
import { Check, ChevronsUpDown, Pencil, Plus, Server, Settings2, Trash2 } from "lucide-react";
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

  // Add/Edit dialog
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [secret, setSecret] = React.useState("");

  // Manager dialog
  const [managerOpen, setManagerOpen] = React.useState(false);
  const [mgrEditId, setMgrEditId] = React.useState<string | null>(null);
  const [mgrName, setMgrName] = React.useState("");
  const [mgrUrl, setMgrUrl] = React.useState("");
  const [mgrSecret, setMgrSecret] = React.useState("");

  const activeServer = servers.find((s) => s.id === activeId) || servers[0];

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

  // --- Quick Add dialog ---
  const openAddDialog = () => {
    setEditingId(null);
    setName("");
    setUrl("");
    setSecret("");
    setFormOpen(true);
  };

  const saveForm = () => {
    if (!name.trim() || !url.trim()) return;
    let u = url.trim().replace(/\/$/, "");
    if (!/^https?:\/\//.test(u)) u = "http://" + u;
    if (editingId) {
      const updated = servers.map((s) => (s.id === editingId ? { ...s, name: name.trim(), url: u, secret: secret.trim() || undefined } : s));
      setServers(updated);
      saveServers(updated);
      if (editingId === activeId) setActiveServerCookie(u);
    } else {
      const server: ServerConfig = { id: Date.now().toString(), name: name.trim(), url: u, secret: secret.trim() || undefined };
      const updated = [...servers, server];
      setServers(updated);
      saveServers(updated);
    }
    setFormOpen(false);
  };

  // --- Manager dialog ---
  const startMgrEdit = (server: ServerConfig) => {
    setMgrEditId(server.id);
    setMgrName(server.name);
    setMgrUrl(server.url);
    setMgrSecret(server.secret || "");
  };

  const cancelMgrEdit = () => {
    setMgrEditId(null);
    setMgrName("");
    setMgrUrl("");
    setMgrSecret("");
  };

  const saveMgrEdit = () => {
    if (!mgrName.trim() || !mgrUrl.trim()) return;
    let u = mgrUrl.trim().replace(/\/$/, "");
    if (!/^https?:\/\//.test(u)) u = "http://" + u;
    const updated = servers.map((s) => (s.id === mgrEditId ? { ...s, name: mgrName.trim(), url: u, secret: mgrSecret.trim() || undefined } : s));
    setServers(updated);
    saveServers(updated);
    if (mgrEditId === activeId) setActiveServerCookie(u);
    cancelMgrEdit();
  };

  const addFromManager = () => {
    if (!mgrName.trim() || !mgrUrl.trim()) return;
    let u = mgrUrl.trim().replace(/\/$/, "");
    if (!/^https?:\/\//.test(u)) u = "http://" + u;
    const server: ServerConfig = { id: Date.now().toString(), name: mgrName.trim(), url: u, secret: mgrSecret.trim() || undefined };
    const updated = [...servers, server];
    setServers(updated);
    saveServers(updated);
    cancelMgrEdit();
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
                    <div className="text-xs text-muted-foreground truncate">{server.url}</div>
                  </div>
                  {server.id === activeId && <Check className="size-4 text-primary shrink-0" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2 p-2" onClick={openAddDialog}>
                <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                  <Plus className="size-4" />
                </div>
                <div className="font-medium text-muted-foreground">Add Server</div>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 p-2" onClick={() => setManagerOpen(true)}>
                <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                  <Settings2 className="size-4" />
                </div>
                <div className="font-medium text-muted-foreground">Manage Servers</div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      {/* Quick Add/Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Server" : "Add Server"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update server connection details." : "Add an API server to connect to."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Server" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">URL</label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://192.168.1.100:3100"
                onKeyDown={(e) => e.key === "Enter" && saveForm()}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Secret</label>
              <Input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Optional API secret"
                onKeyDown={(e) => e.key === "Enter" && saveForm()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={saveForm} disabled={!name.trim() || !url.trim()}>
              {editingId ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manager dialog */}
      <Dialog open={managerOpen} onOpenChange={(open) => { setManagerOpen(open); if (!open) cancelMgrEdit(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Servers</DialogTitle>
            <DialogDescription>Add, edit, or remove API server connections.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            {servers.map((server) => (
              <div
                key={server.id}
                className="flex items-center gap-3 rounded-md border px-3 py-2"
              >
                <Server className="size-4 shrink-0 text-muted-foreground" />
                {mgrEditId === server.id ? (
                  <>
                    <Input
                      className="h-7 text-sm flex-1"
                      value={mgrName}
                      onChange={(e) => setMgrName(e.target.value)}
                      placeholder="Name"
                      autoFocus
                    />
                    <Input
                      className="h-7 text-sm flex-[1.5]"
                      value={mgrUrl}
                      onChange={(e) => setMgrUrl(e.target.value)}
                      placeholder="http://..."
                      onKeyDown={(e) => e.key === "Enter" && saveMgrEdit()}
                    />
                    <Button size="sm" variant="ghost" onClick={saveMgrEdit} className="h-7 px-2">Save</Button>
                    <Button size="sm" variant="ghost" onClick={cancelMgrEdit} className="h-7 px-2">X</Button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{server.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{server.url}</div>
                    </div>
                    {server.id === activeId && (
                      <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                        Active
                      </span>
                    )}
                    {server.id !== "default" && (
                      <>
                        <Pencil
                          className="size-3.5 shrink-0 text-muted-foreground cursor-pointer hover:text-foreground"
                          onClick={() => startMgrEdit(server)}
                        />
                        <Trash2
                          className="size-3.5 shrink-0 text-muted-foreground cursor-pointer hover:text-destructive"
                          onClick={() => removeServer(server.id)}
                        />
                      </>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          {mgrEditId === null && (
            <>
              <div className="border-t pt-3 mt-2 space-y-2">
                <div className="text-xs font-medium text-muted-foreground mb-2">New Server</div>
                <div className="flex items-center gap-2">
                  <Input
                    className="h-8 text-sm"
                    value={mgrName}
                    onChange={(e) => setMgrName(e.target.value)}
                    placeholder="Name"
                  />
                  <Button size="sm" onClick={addFromManager} disabled={!mgrName.trim() || !mgrUrl.trim()}>
                    <Plus className="size-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    className="h-8 text-sm flex-1"
                    value={mgrUrl}
                    onChange={(e) => setMgrUrl(e.target.value)}
                    placeholder="http://..."
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    className="h-8 text-sm flex-1"
                    type="password"
                    value={mgrSecret}
                    onChange={(e) => setMgrSecret(e.target.value)}
                    placeholder="Secret (optional)"
                    onKeyDown={(e) => e.key === "Enter" && addFromManager()}
                  />
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
