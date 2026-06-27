"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useKeyboardShortcuts, SHORTCUT_DEFS } from "@/stores/keyboard-shortcuts";
import {
  useCustomShortcuts,
  CUSTOM_ACTION_DEFS,
  getActionDef,
  type CustomActionType,
  type CustomShortcutItem,
} from "@/stores/custom-shortcuts";
import { Keyboard, RotateCcw, Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { MiniAppProject } from "@agent-spaces/sdk";
import { sdk } from "@/lib/sdk";

function formatKeys(keys: string) {
  const map: Record<string, string> = { ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt', meta: 'Meta', cmd: 'Cmd' };
  return keys.split('+').map(p => map[p] ?? p.toUpperCase());
}

/** 解析键盘事件 → 'ctrl+alt+m' 字符串；纯修饰键返回 null；Esc 返回 '__esc__' */
function eventToKeys(e: KeyboardEvent): string | null {
  if (e.key === 'Escape') return '__esc__';
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('ctrl');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  if (e.metaKey) parts.push('meta');
  parts.push(e.key.toLowerCase());
  return parts.join('+');
}

export function ShortcutsTab() {
  const t = useTranslations("settings");
  const { getShortcut, setShortcut, resetShortcut } = useKeyboardShortcuts();
  const [recordingId, setRecordingId] = useState<string | null>(null);

  // ---- 内置快捷键录制 ----
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!recordingId) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      setRecordingId(null);
      return;
    }
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

    const parts: string[] = [];
    if (e.ctrlKey) parts.push('ctrl');
    if (e.shiftKey) parts.push('shift');
    if (e.altKey) parts.push('alt');
    if (e.metaKey) parts.push('meta');
    parts.push(e.key.toLowerCase());

    setShortcut(recordingId, parts.join('+'));
    setRecordingId(null);
  }, [recordingId, setShortcut]);

  useEffect(() => {
    if (!recordingId) return;
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [recordingId, handleKeyDown]);

  return (
    <div className="space-y-6">
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5 block">
          {t("shortcuts")}
        </label>
        <div className="space-y-2">
          {SHORTCUT_DEFS.map(def => {
            const keys = getShortcut(def.id);
            const isRecording = recordingId === def.id;
            return (
              <div key={def.id} className="flex items-center justify-between py-2 px-3 rounded-lg border">
                <span className="text-sm">{t(def.labelKey)}</span>
                <div className="flex items-center gap-2">
                  {isRecording ? (
                    <span className="text-xs text-primary animate-pulse">
                      {t("recordingShortcut")}
                    </span>
                  ) : (
                    <div className="flex items-center gap-0.5">
                      {formatKeys(keys).map((part, i) => (
                        <kbd key={i} className="inline-flex items-center rounded border bg-muted px-1.5 py-0.5 text-[11px] font-mono">
                          {part}
                        </kbd>
                      ))}
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0"
                    onClick={() => setRecordingId(isRecording ? null : def.id)}
                    title={t("recordShortcut")}
                  >
                    <Keyboard className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0"
                    onClick={() => resetShortcut(def.id)}
                    title={t("resetShortcut")}
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <CustomShortcutsSection />
    </div>
  );
}

/** 用户自定义快捷键栏目 */
function CustomShortcutsSection() {
  const t = useTranslations("settings");
  const { items, removeItem } = useCustomShortcuts();
  const [editing, setEditing] = useState<CustomShortcutItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const openCreate = useCallback(() => {
    setEditing(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((item: CustomShortcutItem) => {
    setEditing(item);
    setDialogOpen(true);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {t("customShortcuts")}
        </label>
        <Button variant="outline" size="sm" onClick={openCreate} className="h-7 text-xs">
          <Plus className="size-3.5 mr-1" />
          {t("addCustomAction")}
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
          {t("noCustomShortcuts")}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const def = getActionDef(item.actionType);
            return (
              <div key={item.id} className="flex items-center justify-between py-2 px-3 rounded-lg border">
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{item.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {def ? t(def.labelKey) : item.actionType}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-0.5">
                    {formatKeys(item.keys).map((part, i) => (
                      <kbd key={i} className="inline-flex items-center rounded border bg-muted px-1.5 py-0.5 text-[11px] font-mono">
                        {part}
                      </kbd>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0"
                    onClick={() => openEdit(item)}
                    title={t("editAction")}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => removeItem(item.id)}
                    title={t("resetShortcut")}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CustomShortcutDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
    </div>
  );
}

/** 新建/编辑自定义快捷键对话框 */
function CustomShortcutDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: CustomShortcutItem | null;
}) {
  const t = useTranslations("settings");
  const { addItem, updateItem, items } = useCustomShortcuts();

  const [name, setName] = useState('');
  const [actionType, setActionType] = useState<CustomActionType>('openMiniAppFloating');
  const [params, setParams] = useState<Record<string, string>>({});
  const [keys, setKeys] = useState('');
  const [recording, setRecording] = useState(false);

  // mini-app 列表（source: 'miniApps' 时动态加载）
  const [miniApps, setMiniApps] = useState<MiniAppProject[]>([]);
  const [miniAppsLoading, setMiniAppsLoading] = useState(false);

  const actionDef = useMemo(() => getActionDef(actionType), [actionType]);

  // 打开时同步编辑态 / 重置
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setActionType(editing.actionType);
      setParams(editing.params);
      setKeys(editing.keys);
    } else {
      setName('');
      setActionType('openMiniAppFloating');
      setParams({});
      setKeys('');
    }
    setRecording(false);
  }, [open, editing]);

  // 当前 action 需要 mini-app 列表时加载
  const needsMiniApps = actionDef?.paramsSchema.some((f) => f.source === 'miniApps');
  useEffect(() => {
    if (!open || !needsMiniApps) return;
    setMiniAppsLoading(true);
    sdk.miniApp.list().then((list) => setMiniApps(list)).catch(() => setMiniApps([])).finally(() => setMiniAppsLoading(false));
  }, [open, needsMiniApps]);

  // 快捷键录制
  useEffect(() => {
    if (!recording) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const k = eventToKeys(e);
      if (k === '__esc__') {
        setRecording(false);
        return;
      }
      if (k) {
        setKeys(k);
        setRecording(false);
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [recording]);

  // 校验：name 非空、必填类 schema 参数已填（switch 类可选）、keys 非空、keys 不与其它项冲突
  const canSubmit = useMemo(() => {
    if (!name.trim() || !keys) return false;
    const required = actionDef?.paramsSchema.every((f) => f.type === 'switch' || params[f.key]) ?? true;
    if (!required) return false;
    const conflict = items.some((it) => it.keys === keys && it.id !== editing?.id);
    return !conflict;
  }, [name, keys, params, actionDef, items, editing]);

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    const payload = {
      name: name.trim(),
      actionType,
      params,
      keys,
    };
    if (editing) {
      updateItem(editing.id, payload);
    } else {
      addItem({ id: crypto.randomUUID(), ...payload });
    }
    onOpenChange(false);
  }, [canSubmit, name, actionType, params, keys, editing, addItem, updateItem, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? t('editAction') : t('addCustomAction')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 名称 */}
          <div className="space-y-1.5">
            <Label htmlFor="cs-name">{t('actionName')}</Label>
            <Input
              id="cs-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('actionName')}
            />
          </div>

          {/* 动作类型 */}
          <div className="space-y-1.5">
            <Label>{t('actionType')}</Label>
            <Select value={actionType} onValueChange={(v) => v && setActionType(v as CustomActionType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CUSTOM_ACTION_DEFS.map((d) => (
                  <SelectItem key={d.type} value={d.type}>
                    {t(d.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 动态参数 */}
          {actionDef?.paramsSchema.map((field) => {
            if (field.type === 'switch') {
              const checked = params[field.key] === 'true';
              return (
                <div key={field.key} className="flex items-center justify-between py-1">
                  <Label>{field.labelKey ? t(field.labelKey) : field.key}</Label>
                  <Switch
                    checked={checked}
                    onCheckedChange={(v) => setParams((p) => ({ ...p, [field.key]: String(v) }))}
                  />
                </div>
              );
            }
            // select
            return (
              <div key={field.key} className="space-y-1.5">
                <Label>{field.labelKey ? t(field.labelKey) : field.key}</Label>
                {field.source === 'miniApps' ? (
                  <Select
                    value={params[field.key] ?? ''}
                    onValueChange={(v) => setParams((p) => ({ ...p, [field.key]: v ?? '' }))}
                    disabled={miniAppsLoading}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={miniAppsLoading ? t('loading') : t('selectMiniApp')} />
                    </SelectTrigger>
                    <SelectContent>
                      {miniApps.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </div>
            );
          })}

          {/* 快捷键 */}
          <div className="space-y-1.5">
            <Label>{t('recordShortcut')}</Label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 flex-1 min-h-[32px]">
                {recording ? (
                  <span className="text-xs text-primary animate-pulse">{t('recordingShortcut')}</span>
                ) : (
                  formatKeys(keys).map((part, i) => (
                    <kbd key={i} className="inline-flex items-center rounded border bg-muted px-1.5 py-0.5 text-[11px] font-mono">
                      {part}
                    </kbd>
                  ))
                )}
              </div>
              <Button variant="outline" size="sm" className="h-8" onClick={() => setRecording((r) => !r)}>
                <Keyboard className="size-3.5 mr-1" />
                {t('recordShortcut')}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline">{t('cancel')}</Button>} />
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {editing ? t('save') : t('addCustomAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
