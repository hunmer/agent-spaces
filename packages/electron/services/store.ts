import Store from 'electron-store'

// ===== Shortcut 类型 =====
export interface ShortcutBinding {
  id: string
  accelerator: string
  global: boolean
  enabled: boolean
}

// ===== Store 实例 =====
interface StoreSchema {
  shortcutBindings: ShortcutBinding[]
  windowMaximized: boolean
}

const store = new Store<StoreSchema>({
  defaults: {
    shortcutBindings: [],
    windowMaximized: false,
  }
})

// ===== Shortcut Bindings =====
export function getShortcutBindings(): ShortcutBinding[] {
  return store.get('shortcutBindings', [])
}

export function setShortcutBindings(bindings: ShortcutBinding[]): void {
  store.set('shortcutBindings', bindings)
}

// ===== Window State =====
export function getWindowMaximized(): boolean {
  return store.get('windowMaximized', false)
}

export function setWindowMaximized(maximized: boolean): void {
  store.set('windowMaximized', maximized)
}
