"use client";

import { useTranslations } from "next-intl";
import { SettingsPageLayout } from "@/components/settings/settings-page-layout";
import { NotificationCenterDialog } from "@/components/sidebar/notification-center-dialog";
import { useWorkspaceStore } from "@/stores/workspace";
import { workspaceIdFromLocation } from "@/lib/routes";

export default function NotificationsPage() {
  const t = useTranslations("sidebar.notifications");
  const workspaces = useWorkspaceStore((s) => s.workspaces);

  let workspaceId = "";
  if (typeof window !== "undefined") {
    workspaceId =
      workspaceIdFromLocation(window.location.pathname, window.location.search) ?? "";
  }
  if (!workspaceId && workspaces.length > 0) {
    workspaceId = workspaces[0].id;
  }

  return (
    <SettingsPageLayout title={t("centerTitle")}>
      <NotificationCenterDialog
        open={true}
        onOpenChange={() => {}}
        workspaceId={workspaceId}
        standalone
      />
    </SettingsPageLayout>
  );
}
