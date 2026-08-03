export type MiniAppHostSlotController = {
  onActiveChange?: (active: boolean) => void;
};

type HostSlotEntry = {
  element: HTMLElement;
  controller?: MiniAppHostSlotController;
};

type ElementListener = (element: HTMLElement | null) => void;
type ActiveListener = (active: boolean) => void;

const slots = new Map<string, HostSlotEntry>();
const activeStates = new Map<string, boolean>();
const elementListeners = new Map<string, Set<ElementListener>>();
const activeListeners = new Map<string, Set<ActiveListener>>();

const slotKey = (projectId: string, name: string) => `${projectId}:${name}`;

function notifyElement(key: string, element: HTMLElement | null) {
  elementListeners.get(key)?.forEach((listener) => listener(element));
}

function notifyActive(key: string, active: boolean) {
  activeListeners.get(key)?.forEach((listener) => listener(active));
}

export function registerMiniAppHostSlot(
  projectId: string,
  name: string,
  element: HTMLElement,
  controller?: MiniAppHostSlotController,
) {
  const key = slotKey(projectId, name);
  const active = activeStates.get(key) ?? false;
  slots.set(key, { element, controller });
  notifyElement(key, element);
  if (active) controller?.onActiveChange?.(true);

  return () => {
    if (slots.get(key)?.element !== element) return;
    slots.delete(key);
    notifyElement(key, null);
  };
}

/** mini-app 把自身 tab 状态同步给宿主。 */
export function updateMiniAppHostSlotState(projectId: string, name: string, active: boolean) {
  const key = slotKey(projectId, name);
  activeStates.set(key, active);
  notifyActive(key, active);
}

/** 宿主请求 mini-app 激活或关闭对应插槽。 */
export function activateMiniAppHostSlot(projectId: string, name: string, active: boolean) {
  const key = slotKey(projectId, name);
  const entry = slots.get(key);
  activeStates.set(key, active);
  notifyActive(key, active);
  entry?.controller?.onActiveChange?.(active);
}

export function subscribeMiniAppHostSlot(projectId: string, name: string, listener: ElementListener) {
  const key = slotKey(projectId, name);
  const listeners = elementListeners.get(key) ?? new Set<ElementListener>();
  listeners.add(listener);
  elementListeners.set(key, listeners);
  listener(slots.get(key)?.element ?? null);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) elementListeners.delete(key);
  };
}

export function subscribeMiniAppHostSlotActive(projectId: string, name: string, listener: ActiveListener) {
  const key = slotKey(projectId, name);
  const listeners = activeListeners.get(key) ?? new Set<ActiveListener>();
  listeners.add(listener);
  activeListeners.set(key, listeners);
  listener(activeStates.get(key) ?? false);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) activeListeners.delete(key);
  };
}

export function clearMiniAppHostSlots(projectId: string) {
  const prefix = `${projectId}:`;
  const keys = new Set([...slots.keys(), ...activeStates.keys()]);
  for (const key of keys) {
    if (!key.startsWith(prefix)) continue;
    slots.delete(key);
    activeStates.delete(key);
    notifyElement(key, null);
    notifyActive(key, false);
  }
}
