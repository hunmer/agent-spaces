import { create } from 'zustand';

const STORAGE_KEY = 'custom-shortcuts';

/** 自定义动作类型 —— 预设清单，按需扩展 */
export type CustomActionType = 'openMiniAppFloating';

/** 动作参数字段 schema（仅支持 select，后续可扩展） */
export interface CustomActionParamField {
  key: string;
  type: 'select';
  /** 动态选项来源：miniApps 从 sdk.miniApp.list() 实时拉取 */
  source?: 'miniApps';
  /** 多语言 key */
  labelKey?: string;
}

export interface CustomActionDef {
  type: CustomActionType;
  /** 多语言 key，见 settings.json 的 customAction.* */
  labelKey: string;
  paramsSchema: CustomActionParamField[];
}

/** 预设动作清单 */
export const CUSTOM_ACTION_DEFS: CustomActionDef[] = [
  {
    type: 'openMiniAppFloating',
    labelKey: 'customActionOpenMiniAppFloating',
    paramsSchema: [
      { key: 'miniAppId', type: 'select', source: 'miniApps', labelKey: 'selectMiniApp' },
    ],
  },
];

export function getActionDef(type: CustomActionType): CustomActionDef | undefined {
  return CUSTOM_ACTION_DEFS.find((d) => d.type === type);
}

/** 用户自定义快捷键项 */
export interface CustomShortcutItem {
  id: string;
  name: string;
  actionType: CustomActionType;
  params: Record<string, string>;
  /** 如 'ctrl+alt+m' */
  keys: string;
}

interface CustomShortcutState {
  items: CustomShortcutItem[];
  addItem: (item: CustomShortcutItem) => void;
  updateItem: (id: string, patch: Partial<Omit<CustomShortcutItem, 'id'>>) => void;
  removeItem: (id: string) => void;
  /** 判断键盘事件是否命中某自定义快捷键 */
  matchEvent: (e: KeyboardEvent) => CustomShortcutItem | undefined;
}

function loadItems(): CustomShortcutItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function persist(items: CustomShortcutItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

function eventMatchesKeys(e: KeyboardEvent, keys: string): boolean {
  if (!keys) return false;
  const parts = keys.toLowerCase().split('+').map((p) => p.trim());
  const ctrl = parts.includes('ctrl');
  const shift = parts.includes('shift');
  const alt = parts.includes('alt');
  const meta = parts.includes('meta') || parts.includes('cmd');
  const key = parts[parts.length - 1];
  return (
    e.ctrlKey === ctrl &&
    e.shiftKey === shift &&
    e.altKey === alt &&
    e.metaKey === meta &&
    e.key.toLowerCase() === key
  );
}

export const useCustomShortcuts = create<CustomShortcutState>((set, get) => ({
  items: loadItems(),

  addItem: (item) =>
    set((state) => {
      const items = [...state.items, item];
      persist(items);
      return { items };
    }),

  updateItem: (id, patch) =>
    set((state) => {
      const items = state.items.map((it) => (it.id === id ? { ...it, ...patch } : it));
      persist(items);
      return { items };
    }),

  removeItem: (id) =>
    set((state) => {
      const items = state.items.filter((it) => it.id !== id);
      persist(items);
      return { items };
    }),

  matchEvent: (e) => get().items.find((it) => eventMatchesKeys(e, it.keys)),
}));
