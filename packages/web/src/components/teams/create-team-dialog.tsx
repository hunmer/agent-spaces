"use client";

import { useEffect, useState } from "react";
import type { AgentConfig } from "@agent-spaces/shared";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MemberPicker } from "@/components/common/member-picker";
import { getMemberDisplayName } from "@/lib/agent-members";

export interface TeamFormValues {
  name: string;
  description: string;
  purpose: string;
  visibility: "private" | "open";
  members: string[];
}

export interface TeamFormDefaults {
  name?: string;
  description?: string;
  purpose?: string;
  visibility?: "private" | "open";
  members?: string[];
}

interface EditTarget {
  name: string;
  description?: string | null;
  purpose?: string | null;
  visibility: "private" | "open";
}

interface CreateTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  loading: boolean;
  agents: AgentConfig[];
  defaultValues?: TeamFormDefaults;
  editTarget?: EditTarget | null;
  onSubmit: (values: TeamFormValues) => Promise<void>;
}

const EMPTY: TeamFormValues = {
  name: "",
  description: "",
  purpose: "",
  visibility: "private",
  members: [],
};

export function CreateTeamDialog({
  open,
  onOpenChange,
  mode,
  loading,
  agents,
  defaultValues,
  editTarget,
  onSubmit,
}: CreateTeamDialogProps) {
  const t = useTranslations("teams");
  const tc = useTranslations("common");

  const [values, setValues] = useState<TeamFormValues>(EMPTY);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && editTarget) {
      setValues({
        name: editTarget.name,
        description: editTarget.description ?? "",
        purpose: editTarget.purpose ?? "",
        visibility: editTarget.visibility,
        members: [],
      });
    } else {
      setValues({
        name: defaultValues?.name ?? "",
        description: defaultValues?.description ?? "",
        purpose: defaultValues?.purpose ?? "",
        visibility: defaultValues?.visibility ?? "private",
        members: defaultValues?.members ? [...defaultValues.members] : [],
      });
    }
  }, [open, mode, editTarget, defaultValues]);

  const candidates = agents
    .filter((a) => a.enabled !== false)
    .map((a, i) => ({ id: a.id, label: getMemberDisplayName(agents, a.id), sortIndex: i }));

  const toggleMember = (id: string) => {
    setValues((prev) =>
      prev.members.includes(id)
        ? { ...prev, members: prev.members.filter((m) => m !== id) }
        : { ...prev, members: [...prev.members, id] },
    );
  };

  const handleClose = (next: boolean) => {
    if (!next) setValues(EMPTY);
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!values.name.trim()) return;
    await onSubmit({
      name: values.name.trim(),
      description: values.description.trim(),
      purpose: values.purpose.trim(),
      visibility: values.visibility,
      members: values.members,
    });
    handleClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md lg:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("dialog.createTitle") : t("dialog.editTitle")}</DialogTitle>
          <DialogDescription>{mode === "create" ? t("dialog.createDescription") : t("dialog.editDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-4 pt-2 lg:flex-row">
          <div className="flex-1 space-y-3">
            <Input
              value={values.name}
              onChange={(e) => setValues({ ...values, name: e.target.value })}
              placeholder={t("form.name")}
            />
            <Textarea
              value={values.description}
              onChange={(e) => setValues({ ...values, description: e.target.value })}
              placeholder={t("form.description")}
              rows={3}
              className="max-h-48 resize-none"
            />
            <Textarea
              value={values.purpose}
              onChange={(e) => setValues({ ...values, purpose: e.target.value })}
              placeholder={t("form.purpose")}
              rows={2}
              className="max-h-32 resize-none"
            />
            <Select
              value={values.visibility}
              onValueChange={(next) => {
                if (!next) return;
                setValues({ ...values, visibility: next as "private" | "open" });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">{t("visibility.private")}</SelectItem>
                <SelectItem value="open">{t("visibility.open")}</SelectItem>
              </SelectContent>
            </Select>

            <div className="lg:hidden">
              <MemberPicker
                key={String(open)}
                candidates={candidates}
                selected={values.members}
                onToggle={toggleMember}
                label={t("form.membersLabel")}
                searchPlaceholder={t("form.searchAgent")}
                emptyText={t("form.noAgents")}
              />
            </div>
          </div>

          <div className="hidden min-h-0 lg:flex lg:w-64 xl:w-72 flex-col border-l pl-4">
            <MemberPicker
              key={String(open)}
              candidates={candidates}
              selected={values.members}
              onToggle={toggleMember}
              label={t("form.membersLabel")}
              searchPlaceholder={t("form.searchAgent")}
              emptyText={t("form.noAgents")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={loading}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={loading || !values.name.trim()}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            {mode === "create" ? tc("create") : tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
