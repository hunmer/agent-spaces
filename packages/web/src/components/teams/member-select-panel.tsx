"use client";

import { useMemo, useState } from "react";
import type { AgentConfig } from "@agent-spaces/shared";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserPlus } from "lucide-react";
import { TeamMemberRow } from "@/components/teams/team-member-row";
import { getMemberDisplayName } from "@/lib/agent-members";

export interface MemberSelectPanelProps {
  label?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  query: string;
  onQueryChange: (q: string) => void;
  candidates: Array<{ agent?: AgentConfig; label: string; id: string }>;
  selected: string[];
  onToggle: (id: string) => void;
}

/** 复用 TeamMemberRow 的成员选择面板（选择模式） */
export function MemberSelectPanel({
  label,
  searchPlaceholder,
  emptyText,
  query,
  onQueryChange,
  candidates,
  selected,
  onToggle,
}: MemberSelectPanelProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {label ? <label className="text-sm font-medium">{label}</label> : null}
      <Input value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder={searchPlaceholder} />
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {candidates.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : null}
        {candidates.map(({ agent, label: displayLabel, id }) => (
          <TeamMemberRow
            key={id}
            agent={agent}
            name={displayLabel}
            variant="select"
            selected={selected.includes(id)}
            onToggle={() => onToggle(id)}
          />
        ))}
      </div>
    </div>
  );
}

interface MemberSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: Array<{ agent?: AgentConfig; label: string; id: string }>;
  /** 确认选择回调，返回选中的 id 列表 */
  onConfirm: (ids: string[]) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  /** 预选中的 id 列表（打开时初始化） */
  defaultSelected?: string[];
}

/**
 * 基于 TeamMemberRow 的成员选择对话框。
 * 供添加团队成员等场景复用，确认后一次性回调选中的 id 列表。
 */
export function MemberSelectDialog({
  open,
  onOpenChange,
  candidates,
  onConfirm,
  title,
  description,
  confirmLabel,
  defaultSelected = [],
}: MemberSelectDialogProps) {
  const t = useTranslations("common");
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [initialized, setInitialized] = useState(false);

  // 对话框打开时初始化预选
  if (open && !initialized) {
    setSelected(defaultSelected ? [...defaultSelected] : []);
    setInitialized(true);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => c.label.toLowerCase().includes(q));
  }, [candidates, query]);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  };

  const handleClose = (val: boolean) => {
    if (!val) {
      setSelected([]);
      setQuery("");
      setInitialized(false);
    }
    onOpenChange(val);
  };

  const handleConfirm = () => {
    onConfirm(selected);
    handleClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex !h-[70vh] !w-[60vw] !max-w-none flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <MemberSelectPanel
          candidates={filtered}
          selected={selected}
          onToggle={toggle}
          query={query}
          onQueryChange={setQuery}
          emptyText={t("empty")}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleConfirm}>
            <UserPlus className="size-3.5" />
            {confirmLabel ?? t("confirm")} ({selected.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 由 AgentConfig 列表构建候选（排除指定 id） */
export function buildCandidates(
  agents: AgentConfig[],
  excludeIds: Set<string>,
): Array<{ agent?: AgentConfig; label: string; id: string }> {
  return agents
    .filter((a) => a.enabled !== false)
    .filter((a) => !excludeIds.has(a.id))
    .map((a) => ({ agent: a, label: getMemberDisplayName(agents, a.id), id: a.id }));
}
