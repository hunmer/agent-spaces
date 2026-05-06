"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { AgentConfig, Workspace } from "@agent-spaces/shared";
import { AddMemberDialog, type AddMemberCandidate } from "@/components/chat/add-member-dialog";
import { Bot, Download, Plus, X, Loader2, AlertCircle } from "lucide-react";
import { FolderPicker } from "@/components/ui/folder-picker";
import {
  Progress,
  ProgressTrack,
  ProgressIndicator,
  ProgressLabel,
} from "@/components/ui/progress";

interface WorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace?: Workspace | null;
  onSubmit: (data: { name: string; boundDirs: string[] }) => Promise<void>;
  onAgentsChanged?: () => void;
}

interface CloneProgress {
  phase: "counting" | "compressing" | "receiving" | "resolving" | "done" | "error";
  progress: number;
  received?: number;
  total?: number;
  error?: string;
  cloneDir?: string;
}

const phaseLabel: Record<CloneProgress["phase"], string> = {
  counting: "计算对象中...",
  compressing: "压缩中...",
  receiving: "接收数据中...",
  resolving: "解析中...",
  done: "完成",
  error: "失败",
};

export function WorkspaceDialog({ open, onOpenChange, workspace, onSubmit, onAgentsChanged }: WorkspaceDialogProps) {
  return (
    <WorkspaceDialogContent
      key={open ? workspace?.id ?? "new" : "closed"}
      open={open}
      onOpenChange={onOpenChange}
      workspace={workspace}
      onSubmit={onSubmit}
      onAgentsChanged={onAgentsChanged}
    />
  );
}

function WorkspaceDialogContent({ open, onOpenChange, workspace, onSubmit, onAgentsChanged }: WorkspaceDialogProps) {
  const [name, setName] = useState(workspace?.name ?? "");
  const [dir, setDir] = useState(workspace?.boundDirs[0] ?? "");
  const [loading, setLoading] = useState(false);
  const [addAgentOpen, setAddAgentOpen] = useState(false);
  const [agentCandidates, setAgentCandidates] = useState<AddMemberCandidate[]>([]);
  const [workspaceAgents, setWorkspaceAgents] = useState<AgentConfig[]>(workspace?.agents ?? []);
  const [agentLoading, setAgentLoading] = useState(false);

  // Git clone states
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloneLoading, setCloneLoading] = useState(false);
  const [cloneProgress, setCloneProgress] = useState<CloneProgress | null>(null);

  const isEdit = !!workspace;

  useEffect(() => {
    if (!open || !workspace) return;
    const controller = new AbortController();
    fetch(`/api/workspaces/${workspace.id}/agent-templates`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json() as Promise<Array<{ id: string; name?: string; role: string; description?: string }>>;
      })
      .then((agents) => {
        setAgentCandidates(agents.map((agent) => ({
          id: agent.id,
          label: agent.name || agent.role,
          description: agent.description || agent.role,
        })));
      })
      .catch((err) => {
        if (err.name !== "AbortError") setAgentCandidates([]);
      });
    return () => controller.abort();
  }, [open, workspace]);

  const handleSubmit = async () => {
    if (!name || !dir) return;
    setLoading(true);
    try {
      await onSubmit({ name, boundDirs: [dir] });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAgents = async (agentIds: string[]) => {
    if (!workspace || agentIds.length === 0) return;
    setAgentLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/agents/from-templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentIds }),
      });
      if (!res.ok) throw new Error(await res.text());
      const added = await res.json() as AgentConfig[];
      setWorkspaceAgents((prev) => [...prev, ...added]);
      setAgentCandidates((prev) => prev.filter((candidate) => !agentIds.includes(candidate.id)));
      onAgentsChanged?.();
    } finally {
      setAgentLoading(false);
    }
  };

  const handleClone = useCallback(async () => {
    if (!cloneUrl || !dir) return;
    setCloneLoading(true);
    setCloneProgress(null);

    try {
      const res = await fetch("/api/workspaces/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: cloneUrl, targetDir: dir }),
      });

      if (!res.ok) {
        const err = await res.json();
        setCloneProgress({ phase: "error", progress: 0, error: err.error || "Clone failed" });
        setCloneLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setCloneProgress({ phase: "error", progress: 0, error: "No response body" });
        setCloneLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6)) as CloneProgress;
              setCloneProgress(data);
              if (data.phase === "done" || data.phase === "error") {
                setCloneLoading(false);
                if (data.phase === "done" && data.cloneDir) {
                  setDir(data.cloneDir);
                  if (!name) {
                    setName(cloneUrl.split("/").pop()?.replace(".git", "") || "");
                  }
                  setCloneDialogOpen(false);
                  setCloneUrl("");
                  setCloneProgress(null);
                }
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      setCloneProgress({ phase: "error", progress: 0, error: err.message });
      setCloneLoading(false);
    }
  }, [cloneUrl, dir, name]);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Workspace" : "New Workspace"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update workspace settings." : "Create a new workspace bound to a local directory."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <input
            className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            placeholder="Workspace name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && handleSubmit()}
          />
          <div>
            <FolderPicker
              value={dir}
              onChange={setDir}
              placeholder="/path/to/project"
            />
          </div>
          {!isEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => setCloneDialogOpen(true)}
              disabled={!dir}
              title={!dir ? "请先选择目标文件夹" : "从 Git 仓库克隆"}
            >
              <Download className="size-4" />
              从 Git 创建
            </Button>
          )}
          {isEdit && (
            <div className="rounded-xl border border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Bot className="size-4 text-muted-foreground" />
                  Agents
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAddAgentOpen(true)}
                  disabled={agentLoading || agentCandidates.length === 0}
                >
                  <Plus className="size-3.5" />
                  Add Agent
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {workspaceAgents.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No agents in this workspace</span>
                ) : (
                  workspaceAgents.map((agent) => (
                    <span key={agent.id} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                      {agent.name || agent.role}
                      <X className="size-3 text-muted-foreground" />
                    </span>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name || !dir || loading}>
            {isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Git Clone Dialog */}
    <Dialog open={cloneDialogOpen} onOpenChange={(v) => { if (!cloneLoading) setCloneDialogOpen(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>从 Git 创建</DialogTitle>
          <DialogDescription>
            输入 Git 仓库地址，克隆到选定的文件夹中。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <input
            className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            placeholder="https://github.com/user/repo.git"
            value={cloneUrl}
            onChange={(e) => setCloneUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !cloneLoading && cloneUrl && handleClone()}
            disabled={cloneLoading}
          />
          <p className="text-xs text-muted-foreground">
            将克隆到: {dir}/{cloneUrl ? (cloneUrl.split("/").pop()?.replace(".git", "") || "repo") : "..."}
          </p>

          {cloneProgress && cloneProgress.phase !== "done" && cloneProgress.phase !== "error" && (
            <div className="space-y-1.5">
              <Progress value={cloneProgress.progress}>
                <ProgressLabel>{phaseLabel[cloneProgress.phase]}</ProgressLabel>
                <span className="ml-auto text-sm text-muted-foreground tabular-nums">{cloneProgress.progress}%</span>
                <ProgressTrack>
                  <ProgressIndicator />
                </ProgressTrack>
              </Progress>
              {cloneProgress.received != null && cloneProgress.total != null && (
                <p className="text-xs text-muted-foreground">
                  {cloneProgress.received} / {cloneProgress.total} objects
                </p>
              )}
            </div>
          )}

          {cloneProgress?.phase === "error" && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3">
              <AlertCircle className="size-4 mt-0.5 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">{cloneProgress.error}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { if (!cloneLoading) setCloneDialogOpen(false); }} disabled={cloneLoading}>
            Cancel
          </Button>
          <Button onClick={handleClone} disabled={!cloneUrl || cloneLoading}>
            {cloneLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Cloning...
              </>
            ) : (
              <>
                <Download className="size-4" />
                Clone
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {workspace && (
      <AddMemberDialog
        open={addAgentOpen}
        onOpenChange={setAddAgentOpen}
        candidates={agentCandidates}
        onAdd={handleAddAgents}
      />
    )}
    </>
  );
}
