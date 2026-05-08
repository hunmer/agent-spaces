"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAgentStore } from "@/stores/agent";
import type { Workspace } from "@agent-spaces/shared";
import { Download, Loader2, AlertCircle } from "lucide-react";
import { FolderPicker } from "@/components/ui/folder-picker";
import {
  Progress,
  ProgressTrack,
  ProgressIndicator,
  ProgressLabel,
} from "@/components/ui/progress";
import { useTranslations } from 'next-intl';

interface WorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace?: Workspace | null;
  onSubmit: (data: { name: string; boundDirs: string[] }) => Promise<void>;
}

interface CloneProgress {
  phase: "counting" | "compressing" | "receiving" | "resolving" | "done" | "error";
  progress: number;
  received?: number;
  total?: number;
  error?: string;
  cloneDir?: string;
}

export function WorkspaceDialog({ open, onOpenChange, workspace, onSubmit }: WorkspaceDialogProps) {
  return (
    <WorkspaceDialogContent
      key={open ? workspace?.id ?? "new" : "closed"}
      open={open}
      onOpenChange={onOpenChange}
      workspace={workspace}
      onSubmit={onSubmit}
    />
  );
}

function WorkspaceDialogContent({ open, onOpenChange, workspace, onSubmit }: WorkspaceDialogProps) {
  const t = useTranslations('workspace');
  const tc = useTranslations('common');
  const agents = useAgentStore((s) => s.agents);
  const [name, setName] = useState(workspace?.name ?? "");
  const [dir, setDir] = useState(workspace?.boundDirs[0] ?? "");
  const [loading, setLoading] = useState(false);

  // Git clone states
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloneLoading, setCloneLoading] = useState(false);
  const [cloneProgress, setCloneProgress] = useState<CloneProgress | null>(null);

  const isEdit = !!workspace;

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
        setCloneProgress({ phase: "error", progress: 0, error: err.error || t('clone.cloneFailed') });
        setCloneLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setCloneProgress({ phase: "error", progress: 0, error: t('clone.noResponseBody') });
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
  }, [cloneUrl, dir, name, t]);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t('dialog.editTitle') : t('dialog.newTitle')}</DialogTitle>
          <DialogDescription>
            {isEdit ? t('dialog.editDescription') : t('dialog.newDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <input
            className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            placeholder={t('dialog.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
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
              title={!dir ? t('clone.selectFolderFirst') : t('clone.fromGitTooltip')}
            >
              <Download className="size-4" />
              {t('clone.createFromGit')}
            </Button>
          )}
          {isEdit && agents.length > 0 && (
            <div className="rounded-xl border border-border p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <span className="text-muted-foreground">{agents.length}</span>
                <span>{t('agents')}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {agents.map((agent) => (
                  <span key={agent.id} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                    {agent.name || agent.role}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {tc('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!name || !dir || loading}>
            {isEdit ? tc('save') : tc('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Git Clone Dialog */}
    <Dialog open={cloneDialogOpen} onOpenChange={(v) => { if (!cloneLoading) setCloneDialogOpen(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('clone.title')}</DialogTitle>
          <DialogDescription>
            {t('clone.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <input
            className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            placeholder="https://github.com/user/repo.git"
            value={cloneUrl}
            onChange={(e) => setCloneUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            disabled={cloneLoading}
          />
          <p className="text-xs text-muted-foreground">
            {t('clone.cloneTo')}{dir}/{cloneUrl ? (cloneUrl.split("/").pop()?.replace(".git", "") || "repo") : "..."}
          </p>

          {cloneProgress && cloneProgress.phase !== "done" && cloneProgress.phase !== "error" && (
            <div className="space-y-1.5">
              <Progress value={cloneProgress.progress}>
                <ProgressLabel>{t(`clone.phase.${cloneProgress.phase}`)}</ProgressLabel>
                <span className="ml-auto text-sm text-muted-foreground tabular-nums">{cloneProgress.progress}%</span>
                <ProgressTrack>
                  <ProgressIndicator />
                </ProgressTrack>
              </Progress>
              {cloneProgress.received != null && cloneProgress.total != null && (
                <p className="text-xs text-muted-foreground">
                  {cloneProgress.received} / {cloneProgress.total} {t('clone.objects')}
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
            {tc('cancel')}
          </Button>
          <Button onClick={handleClone} disabled={!cloneUrl || cloneLoading}>
            {cloneLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('clone.cloning')}
              </>
            ) : (
              <>
                <Download className="size-4" />
                {t('clone.clone')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
