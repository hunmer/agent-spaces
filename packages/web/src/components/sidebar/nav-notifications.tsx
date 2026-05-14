"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BellIcon, CheckIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from 'next-intl';
import { useNotificationStore } from "@/stores/notification";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@agent-spaces/shared";
import { NotificationCenterDialog } from "./notification-center-dialog";

export function NotificationsPopover({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations('sidebar.notifications');
  const notifications = useNotificationStore((s) => s.notifications);
  const markRead = useNotificationStore((s) => s.markRead);
  const clearAll = useNotificationStore((s) => s.clearAll);
  const unreadCount = notifications.filter((n) => !n.read).length;
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null);

  const recent = notifications.slice(0, 5);

  const handleNotificationClick = (n: AppNotification) => {
    if (!n.read) markRead(workspaceId, n.id);
    setSelectedNotification(n);
    setDialogOpen(true);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={
          <Button variant="ghost" size="icon" className="rounded-full relative" aria-label={t('openAriaLabel')} />
        }>
            <BellIcon className="size-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
        </PopoverTrigger>
        <PopoverContent side="right" className="w-80 my-6 p-0" align="start">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-sm font-semibold">{t('title')}</span>
            {notifications.length > 0 && (
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => clearAll(workspaceId)}
                  title={t('clearAll')}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
          <ScrollArea className="max-h-80">
            {recent.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t('empty')}
              </div>
            ) : (
              <div className="divide-y">
                {recent.map((n) => (
                  <button
                    key={n.id}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors",
                      !n.read && "bg-accent/30",
                    )}
                    onClick={() => handleNotificationClick(n)}
                  >
                    <div className={cn(
                      "mt-1 size-2 rounded-full shrink-0",
                      !n.read ? "bg-blue-500" : "bg-transparent",
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{n.title}</p>
                      {n.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.description}</p>
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
          {notifications.length > 5 && (
            <>
              <div className="border-t" />
              <button
                className="w-full px-4 py-2.5 text-sm text-muted-foreground hover:text-primary hover:bg-accent/30 transition-colors"
                onClick={() => { setOpen(false); setDialogOpen(true); }}
              >
                {t('viewAll')}
              </button>
            </>
          )}
        </PopoverContent>
      </Popover>

      <NotificationCenterDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        workspaceId={workspaceId}
        initialNotification={selectedNotification}
      />
    </>
  );
}

import { useState } from "react";
