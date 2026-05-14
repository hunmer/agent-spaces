"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Trash2Icon, CheckCheckIcon } from "lucide-react";
import { useTranslations } from 'next-intl';
import { useNotificationStore } from "@/stores/notification";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@agent-spaces/shared";
import { useState } from "react";

const typeIcon: Record<string, string> = {
  issue_completed: "✓",
  issue_failed: "✕",
  task_completed: "✓",
  task_failed: "✕",
};

const typeColor: Record<string, string> = {
  issue_completed: "text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400",
  issue_failed: "text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400",
  task_completed: "text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400",
  task_failed: "text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400",
};

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
  const [detail, setDetail] = useState<AppNotification | null>(null);

  const show = initialNotification && !detail ? initialNotification : detail;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setDetail(null); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle>{t('centerTitle')}</DialogTitle>
            <div className="flex gap-1">
              {notifications.some((n) => !n.read) && (
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => markAllRead(workspaceId)}>
                  <CheckCheckIcon className="size-3.5" />
                  {t('markAllRead')}
                </Button>
              )}
              {notifications.length > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive" onClick={() => clearAll(workspaceId)}>
                  <Trash2Icon className="size-3.5" />
                  {t('clearAll')}
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {show ? (
          <div className="flex-1 overflow-auto px-6 py-4">
            <button
              className="text-xs text-muted-foreground hover:text-foreground mb-3 flex items-center gap-1"
              onClick={() => setDetail(null)}
            >
              ← {t('backToList')}
            </button>
            <div className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium mb-3", typeColor[show.type] ?? "")}>
              {typeIcon[show.type] ?? ""} {show.type}
            </div>
            <h3 className="text-lg font-semibold mb-2">{show.title}</h3>
            {show.description && (
              <p className="text-sm text-muted-foreground mb-3">{show.description}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(show.createdAt), { addSuffix: true })}
            </p>
            {Object.keys(show.data).length > 0 && (
              <pre className="mt-3 text-xs bg-muted rounded p-3 overflow-auto">
                {JSON.stringify(show.data, null, 2)}
              </pre>
            )}
          </div>
        ) : (
          <ScrollArea className="flex-1">
            {notifications.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                {t('empty')}
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    className={cn(
                      "flex w-full items-start gap-3 px-6 py-3.5 text-left hover:bg-accent/50 transition-colors",
                      !n.read && "bg-accent/30",
                    )}
                    onClick={() => {
                      if (!n.read) markRead(workspaceId, n.id);
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
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
