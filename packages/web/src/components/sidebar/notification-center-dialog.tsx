"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2Icon, CheckCheckIcon, ArrowLeftIcon } from "lucide-react";
import { useTranslations } from 'next-intl';
import { useNotificationStore } from "@/stores/notification";
import { useWorkspaceStore } from "@/stores/workspace";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { AppNotification, Issue, NotificationType } from "@agent-spaces/shared";
import { useState, useEffect, useMemo } from "react";
import { sdk } from "@/lib/sdk";
import { IssueDetailWorkflowPanel } from "@/components/issue/issue-detail-workflow-panel";

const typeIcon: Record<string, string> = {
  issue_completed: "✓",
  issue_failed: "✕",
};

const typeColor: Record<string, string> = {
  issue_completed: "text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400",
  issue_failed: "text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400",
};

const NOTIFICATION_TYPES: NotificationType[] = [
  "issue_completed",
  "issue_failed",
];

export function NotificationCenterDialog({
  open,
  onOpenChange,
  workspaceId,
  initialNotification,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  initialNotification?: AppNotification | null;
}) {
  const t = useTranslations('sidebar.notifications');
  const notifications = useNotificationStore((s) => s.notifications);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const clearAll = useNotificationStore((s) => s.clearAll);
  const remove = useNotificationStore((s) => s.remove);
  const load = useNotificationStore((s) => s.load);
  const workspaces = useWorkspaceStore((s) => s.workspaces);

  const [detail, setDetail] = useState<AppNotification | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);

  // Load notifications when workspace selection changes
  useEffect(() => {
    if (!open) return;
    const targetId = selectedWorkspaceId ?? workspaceId;
    load(targetId);
  }, [open, selectedWorkspaceId, workspaceId, load]);

  const filtered = useMemo(() => {
    let list = notifications;
    if (selectedType) {
      list = list.filter((n) => n.type === selectedType);
    }
    return list;
  }, [notifications, selectedType]);

  const show = initialNotification && !detail ? initialNotification : detail;
  const activeWsId = selectedWorkspaceId ?? workspaceId;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setDetail(null); onOpenChange(v); }}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0" style={{ maxWidth: '80vw', width: '80vw', height: '80vh' }}>
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DialogTitle>{t('centerTitle')}</DialogTitle>
              {notifications.some((n) => !n.read) && (
                <span className="inline-flex items-center justify-center size-5 rounded-full bg-blue-500 text-[10px] font-medium text-white">
                  {notifications.filter((n) => !n.read).length}
                </span>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex">
          {/* Left sidebar: filters */}
          <div className="w-56 shrink-0 border-r bg-muted/30 flex flex-col">
            {/* Workspace filter */}
            <div className="p-4 border-b">
              <p className="text-xs font-medium text-muted-foreground mb-2">{t('workspaceFilter')}</p>
              <div className="space-y-0.5">
                <button
                  className={cn(
                    "w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-colors truncate",
                    !selectedWorkspaceId ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                  )}
                  onClick={() => { setSelectedWorkspaceId(null); setDetail(null); }}
                >
                  {t('allWorkspaces')}
                </button>
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    className={cn(
                      "w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-colors truncate",
                      selectedWorkspaceId === ws.id ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                    )}
                    onClick={() => { setSelectedWorkspaceId(ws.id); setDetail(null); }}
                  >
                    {ws.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Type filter */}
            <div className="p-4 flex-1">
              <p className="text-xs font-medium text-muted-foreground mb-2">{t('typeFilter')}</p>
              <div className="space-y-0.5">
                <button
                  className={cn(
                    "w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-colors",
                    !selectedType ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                  )}
                  onClick={() => { setSelectedType(null); setDetail(null); }}
                >
                  {t('allTypes')}
                </button>
                {NOTIFICATION_TYPES.map((nt) => (
                  <button
                    key={nt}
                    className={cn(
                      "w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-colors flex items-center gap-2",
                      selectedType === nt ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                    )}
                    onClick={() => { setSelectedType(nt); setDetail(null); }}
                  >
                    <span className={cn("inline-flex items-center justify-center size-5 rounded-full text-[10px] shrink-0", typeColor[nt] ?? "")}>
                      {typeIcon[nt] ?? ""}
                    </span>
                    {t(`type.${nt}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: notification list / detail */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto">
              {show ? (
                <div className="px-6 py-4">
                  <button onClick={() => setDetail(null)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors">
                    <ArrowLeftIcon className="size-3.5" />
                    {t('backToList')}
                  </button>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold truncate">{show.title}</h3>
                    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", typeColor[show.type] ?? "")}>
                      {typeIcon[show.type] ?? ""} {t(`type.${show.type}`, { defaultValue: show.type })}
                    </span>
                  </div>
                  {show.description && (
                    <p className="text-sm text-muted-foreground mb-3">{show.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(show.createdAt), { addSuffix: true })}
                  </p>
                  {isIssueNotification(show) && (show.data.issueId as string) && (
                    <div className="mt-4">
                      <NotificationIssueWorkflow
                        workspaceId={activeWsId}
                        issueId={show.data.issueId as string}
                      />
                    </div>
                  )}
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                  {t('noResults')}
                </div>
              ) : (
                <div className="divide-y">
                  {filtered.map((n) => (
                    <button
                      key={n.id}
                      className={cn(
                        "flex w-full items-start gap-3 px-6 py-3.5 text-left hover:bg-accent/50 transition-colors",
                        !n.read && "bg-accent/30",
                      )}
                      onClick={() => {
                        if (!n.read) markRead(activeWsId, n.id);
                        setDetail(n);
                      }}
                    >
                      <div className={cn(
                        "mt-1 size-2 rounded-full shrink-0",
                        !n.read ? "bg-blue-500" : "bg-transparent",
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{n.title}</p>
                        {n.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{n.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium", typeColor[n.type] ?? "")}>
                            {typeIcon[n.type] ?? ""} {t(`type.${n.type}`, { defaultValue: n.type })}
                          </span>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!show && notifications.length > 0 && (
              <div className="px-6 py-3 border-t shrink-0 flex items-center justify-between">
                {notifications.some((n) => !n.read) && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => markAllRead(activeWsId)}>
                    <CheckCheckIcon className="size-3.5" />
                    {t('markAllRead')}
                  </Button>
                )}
                <div className="flex-1" />
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive" onClick={() => { clearAll(activeWsId); onOpenChange(false); }}>
                  <Trash2Icon className="size-3.5" />
                  {t('clearAll')}
                </Button>
              </div>
            )}
            {show && (
              <div className="px-6 py-3 border-t shrink-0 flex justify-end">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive" onClick={() => { remove(activeWsId, show.id); setDetail(null); }}>
                  <Trash2Icon className="size-3.5" />
                  {t('delete')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function isIssueNotification(n: AppNotification): boolean {
  return n.type === 'issue_completed' || n.type === 'issue_failed';
}

function NotificationIssueWorkflow({ workspaceId, issueId }: { workspaceId: string; issueId: string }) {
  const t = useTranslations('issue');
  const [issue, setIssue] = useState<Issue | null>(null);

  useEffect(() => {
    let active = true;
    setIssue(null);
    sdk.issue.get(workspaceId, issueId)
      .then((res) => { if (active) setIssue(res); })
      .catch(() => { if (active) setIssue(null); });
    return () => { active = false; };
  }, [workspaceId, issueId]);

  if (!issue) return null;
  return (
    <IssueDetailWorkflowPanel
      issue={issue}
      workspaceId={workspaceId}
      t={t}
    />
  );
}
