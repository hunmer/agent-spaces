"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Check, X, ChevronRight, Terminal } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCliSessionsStore } from "@/stores/cli-sessions";
import {
  readCliTabs,
  readActiveTabId,
  subscribeCliTabs,
  type CliTabInfo,
} from "@/lib/cli-panel-layout";
import { selectActiveSessionTabWhenReady, closeActiveSessionTab } from "@/components/cli/cli-panel";
import { getCliIconUrl } from "@/lib/cli-icons";

function TabIcon({ cliId, className }: { cliId?: string; className?: string }) {
  const url = cliId ? getCliIconUrl(cliId) : null;
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={className} />;
  }
  return <Terminal className={className} />;
}

/**
 * CLI 会话列表（cli-list tab 内容）。
 *
 * - 顶部「New Session」创建并自动激活
 * - 会话项可垂直拖拽排序
 * - 单击切换激活；双击重命名；右侧按钮删除
 * - 每个会话项展开后显示其 panel 内的 tab 列表（点击聚焦+选中该 tab，× 关闭）
 */
export function CliSessionList() {
  const sessions = useCliSessionsStore((s) => s.sessions);
  const activeId = useCliSessionsStore((s) => s.activeId);
  const tabVersion = useCliSessionsStore((s) => s.tabVersion);
  const createSession = useCliSessionsStore((s) => s.createSession);
  const removeSession = useCliSessionsStore((s) => s.removeSession);
  const renameSession = useCliSessionsStore((s) => s.renameSession);
  const setActive = useCliSessionsStore((s) => s.setActive);
  const reorderSessions = useCliSessionsStore((s) => s.reorderSessions);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([activeId ?? ""]));
  const inputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (editingId) inputRef.current?.focus();
  }, [editingId]);

  const startRename = (id: string, currentName: string) => {
    setEditingId(id);
    setDraftName(currentName);
  };
  const commitRename = () => {
    if (editingId) renameSession(editingId, draftName);
    setEditingId(null);
  };
  const cancelRename = () => {
    setEditingId(null);
    setDraftName("");
  };

  const handleCreate = () => {
    const id = createSession();
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const handleRemove = (id: string, name: string) => {
    if (window.confirm(`Delete session "${name}"? Its terminals and layout will be lost.`)) {
      removeSession(id);
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    reorderSessions(String(active.id), String(over.id));
  };

  const handleSelectTab = (sessionId: string, tabId: string) => {
    setActive(sessionId);
    // 切换 session 时 panel 会以 key 重挂，api ref 短暂为 null；
    // selectActiveSessionTabWhenReady 内部 rAF 轮询，直到 panel 就绪再 selectTab。
    selectActiveSessionTabWhenReady(tabId);
  };

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    closeActiveSessionTab(tabId);
  };

  return (
    <div className="flex h-full flex-col" data-tour-tab="cli-list">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="text-sm font-medium">CLI Sessions</span>
        <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={handleCreate}>
          <Plus className="size-3.5" />
          New
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-2">
        {sessions.length === 0 ? (
          <div className="mt-8 flex flex-col items-center justify-center gap-2 px-4 text-center text-xs text-muted-foreground">
            <Plus className="size-6 opacity-50" />
            <p>No sessions yet.</p>
            <p>Click &quot;New&quot; to create a CLI session.</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={sessions.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <ul className="flex flex-col gap-1">
                {sessions.map((session) => (
                  <SortableSessionItem
                    key={session.id}
                    session={session}
                    isActive={session.id === activeId}
                    isEditing={session.id === editingId}
                    isExpanded={expanded.has(session.id)}
                    tabVersion={tabVersion}
                    draftName={draftName}
                    inputRef={inputRef}
                    onDraftChange={setDraftName}
                    onActivate={() => setActive(session.id)}
                    onToggleExpand={() => toggleExpand(session.id)}
                    onStartRename={() => startRename(session.id, session.name)}
                    onCommitRename={commitRename}
                    onCancelRename={cancelRename}
                    onRemove={() => handleRemove(session.id, session.name)}
                    onSelectTab={(tabId) => handleSelectTab(session.id, tabId)}
                    onCloseTab={handleCloseTab}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

interface SortableSessionItemProps {
  session: { id: string; name: string; createdAt: number };
  isActive: boolean;
  isEditing: boolean;
  isExpanded: boolean;
  /** 通过 tabVersion 变化触发重新读取 localStorage */
  tabVersion: number;
  draftName: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onDraftChange: (v: string) => void;
  onActivate: () => void;
  onToggleExpand: () => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onRemove: () => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (e: React.MouseEvent, tabId: string) => void;
}

function SortableSessionItem({
  session, isActive, isEditing, isExpanded, tabVersion,
  draftName, inputRef, onDraftChange,
  onActivate, onToggleExpand, onStartRename, onCommitRename, onCancelRename, onRemove,
  onSelectTab, onCloseTab,
}: SortableSessionItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: session.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  // 读取本 session 的 tab 列表（仅在展开时订阅）
  const [tabs, setTabs] = useState<CliTabInfo[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  useEffect(() => {
    if (!isExpanded) return;
    const refresh = () => {
      setTabs(readCliTabs(session.id));
      setActiveTabId(readActiveTabId(session.id));
    };
    refresh();
    const unsub = subscribeCliTabs(session.id, refresh);
    return unsub;
  }, [isExpanded, session.id, tabVersion]);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={[
        "rounded-md border transition-colors",
        isActive ? "border-primary bg-primary/5" : "border-transparent hover:bg-accent/50",
        isDragging && "opacity-60 shadow-md z-10",
      ].filter(Boolean).join(" ")}
    >
      <div className="group flex items-center gap-1 px-2 py-1.5">
        {/* 拖拽手柄 */}
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-foreground"
          {...attributes}
          {...listeners}
          title="Drag to reorder"
          aria-label="Drag handle"
        >
          <span className="inline-block size-3 select-none">⋮⋮</span>
        </button>

        {/* 展开箭头 */}
        <button
          type="button"
          onClick={onToggleExpand}
          className="text-muted-foreground hover:text-foreground"
          title={isExpanded ? "Collapse" : "Expand"}
        >
          <ChevronRight className={`size-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
        </button>

        {isEditing ? (
          <>
            <Input
              ref={inputRef}
              value={draftName}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCommitRename();
                if (e.key === "Escape") onCancelRename();
              }}
              className="h-6 flex-1 px-1 text-xs"
              onClick={(e) => e.stopPropagation()}
            />
            <Button size="icon" variant="ghost" className="size-6" onClick={onCommitRename} title="Save">
              <Check className="size-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="size-6" onClick={onCancelRename} title="Cancel">
              <X className="size-3.5" />
            </Button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="flex-1 truncate text-left text-sm"
              onClick={onActivate}
              onDoubleClick={onStartRename}
              title={session.name}
            >
              {session.name}
            </button>
            {tabs.length > 0 && (
              <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">{tabs.length}</span>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="size-6 opacity-0 group-hover:opacity-100"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              title="Delete"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </>
        )}
      </div>

      {/* Tab 列表 */}
      {isExpanded && (
        <ul className="ml-7 mr-1 mb-1 flex flex-col gap-0.5 border-l pl-2">
          {tabs.length === 0 ? (
            <li className="py-1 text-[11px] text-muted-foreground">No terminals</li>
          ) : (
            tabs.map((tab) => {
              const isTabActive = tab.id === activeTabId;
              return (
                <li key={tab.id}>
                  <button
                    type="button"
                    onClick={() => onSelectTab(tab.id)}
                    className={[
                      "group flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs",
                      isTabActive ? "bg-primary/10 text-foreground" : "hover:bg-accent text-muted-foreground",
                    ].join(" ")}
                    title={tab.name}
                  >
                    <TabIcon cliId={tab.cliId} className="size-3.5 shrink-0 rounded-sm" />
                    <span className="flex-1 truncate">{tab.name}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      className="rounded p-0.5 opacity-0 hover:bg-accent group-hover:opacity-100"
                      onClick={(e) => onCloseTab(e, tab.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onCloseTab(e as unknown as React.MouseEvent, tab.id); } }}
                      title="Close tab"
                    >
                      <X className="size-3" />
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </li>
  );
}
