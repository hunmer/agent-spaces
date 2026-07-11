"use client";

import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useConfirmStore } from "@/stores/confirm";

/**
 * 全局确认弹窗。挂在 AppShell 内，消费 useConfirmStore。
 * 任意位置调用 confirmDialog({ message }) 即可弹出。
 */
export function GlobalConfirmDialog() {
  const t = useTranslations("common");
  const open = useConfirmStore((s) => s.open);
  const message = useConfirmStore((s) => s.message);
  const title = useConfirmStore((s) => s.title);
  const destructive = useConfirmStore((s) => s.destructive);
  const action = useConfirmStore((s) => s.action);
  const cancel = useConfirmStore((s) => s.cancel);
  const _close = useConfirmStore((s) => s._close);

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) _close(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title || t("confirm")}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => _close(false)}>
            {cancel || t("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            onClick={() => _close(true)}
          >
            {action || t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
