"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BellIcon } from "lucide-react";
import { useTranslations } from 'next-intl';
import { useNotificationStore } from "@/stores/notification";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import type { AppNotification } from "@agent-spaces/shared";
import { NotificationCenterDialog } from "./notification-center-dialog";

export function NotificationsPopover({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations('sidebar.notifications');
  const router = useRouter();
  const isMobile = useIsMobile();
  const notifications = useNotificationStore((s) => s.notifications);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const unreadCount = notifications.filter((n) => !n.read).length;
  const unreadItems = notifications.filter((n) => !n.read);
  const recent = notifications.slice(0, 10);
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null);

  const goToNotifications = () => router.push("/notifications");

  const handleNotificationClick = (n: AppNotification) => {
    if (!n.read) markRead(workspaceId, n.id);
    setSelectedNotification(n);
    setDialogOpen(true);
  };

  const handleMarkAllRead = () => markAllRead(workspaceId);

  const bellButton = (
    <Button
      variant="ghost"
      size="icon"
      className="rounded-full relative cursor-pointer"
      aria-label={t('openAriaLabel')}
      onClick={isMobile ? goToNotifications : undefined}
    >
      <BellIcon className="size-5" />
      {unreadCount > 0 && (
        <Badge className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full p-0 flex items-center justify-center text-[10px]">
          {unreadCount > 99 ? '99+' : unreadCount}
        </Badge>
      )}
    </Button>
  );

  // On mobile, render a plain button that navigates to the full-screen route.
  if (isMobile) {
    return bellButton;
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button variant="ghost" size="icon" className="rounded-full relative cursor-pointer" aria-label={t('openAriaLabel')} />
          }
        >
          <BellIcon className="size-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full p-0 flex items-center justify-center text-[10px]">
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </PopoverTrigger>
        <PopoverContent side="right" className="p-0 my-6" align="start">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{t('title')}</span>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {unreadCount} {t('new')}
                </Badge>
              )}
            </div>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllRead}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer h-auto py-0.5"
              >
                {t('markAllRead')}
              </Button>
            )}
          </div>
          <div>
            <Tabs defaultValue="all" className="flex-col gap-0">
              <div className="px-4 py-2 border-b">
                <TabsList className="h-8 w-full">
                  <TabsTrigger value="all" className="flex-1 text-xs">
                    {t('all')}
                  </TabsTrigger>
                  <TabsTrigger value="unread" className="flex-1 text-xs">
                    {t('unread')}
                    {unreadCount > 0 && (
                      <span className="text-xs">({unreadCount})</span>
                    )}
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="all" className="mt-0">
                <ScrollArea className="max-h-[50dvh]">
                  {recent.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-2">
                      <BellIcon className="h-8 w-8 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">{t('empty')}</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {recent.map((n) => (
                        <button
                          key={n.id}
                          className={cn(
                            "flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors cursor-pointer",
                            !n.read && "bg-muted dark:bg-muted/30",
                          )}
                          onClick={() => handleNotificationClick(n)}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{n.title}</p>
                            {n.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.description}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                            </p>
                          </div>
                          {!n.read && (
                            <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="unread" className="mt-0">
                <ScrollArea className="max-h-[50dvh]">
                  {unreadItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-2">
                      <BellIcon className="h-8 w-8 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">{t('allCaughtUp')}</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {unreadItems.slice(0, 10).map((n) => (
                        <button
                          key={n.id}
                          className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors cursor-pointer bg-muted dark:bg-muted/30"
                          onClick={() => handleNotificationClick(n)}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{n.title}</p>
                            {n.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.description}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                            </p>
                          </div>
                          <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>

            {notifications.length > 0 && (
              <div className="px-4 py-3 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-sm cursor-pointer"
                  onClick={() => { setSelectedNotification(null); setOpen(false); setDialogOpen(true); }}
                >
                  {t('viewAll')}
                </Button>
              </div>
            )}
          </div>
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
