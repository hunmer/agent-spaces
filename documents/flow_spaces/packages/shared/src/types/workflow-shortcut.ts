// ============================================================
// Workflow Shortcut Types
// ============================================================

export type ShortcutGroup = 'tab' | 'navigation' | 'view' | 'tools' | 'window'

export interface ShortcutAction {
  id: string
  label: string
  defaultAccelerator: string
  supportsGlobal: boolean
  group: ShortcutGroup
}

export interface ShortcutBinding {
  id: string
  accelerator: string
  global: boolean
  enabled: boolean
}

// label / group label 为 i18n key（命名空间 `shortcuts`），由渲染层用 next-intl 翻译。
// 主进程等无法调用 i18n 的场景按 key 作为 fallback 处理。
export const SHORTCUT_GROUPS: { key: ShortcutGroup; label: string }[] = [
  { key: 'tab', label: 'shortcuts.group.tab' },
  { key: 'navigation', label: 'shortcuts.group.navigation' },
  { key: 'view', label: 'shortcuts.group.view' },
  { key: 'tools', label: 'shortcuts.group.tools' },
  { key: 'window', label: 'shortcuts.group.window' },
]

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  { id: 'new-tab', label: 'shortcuts.action.newTab', defaultAccelerator: 'CmdOrCtrl+T', supportsGlobal: true, group: 'tab' },
  { id: 'close-tab', label: 'shortcuts.action.closeTab', defaultAccelerator: 'CmdOrCtrl+W', supportsGlobal: true, group: 'tab' },
  { id: 'next-tab', label: 'shortcuts.action.nextTab', defaultAccelerator: 'CmdOrCtrl+Tab', supportsGlobal: true, group: 'tab' },
  { id: 'prev-tab', label: 'shortcuts.action.prevTab', defaultAccelerator: 'CmdOrCtrl+Shift+Tab', supportsGlobal: true, group: 'tab' },
  { id: 'reload-tab', label: 'shortcuts.action.reloadTab', defaultAccelerator: 'CmdOrCtrl+R', supportsGlobal: true, group: 'navigation' },
  { id: 'force-reload', label: 'shortcuts.action.forceReload', defaultAccelerator: 'CmdOrCtrl+Shift+R', supportsGlobal: true, group: 'navigation' },
  { id: 'toggle-fullscreen', label: 'shortcuts.action.toggleFullscreen', defaultAccelerator: 'F11', supportsGlobal: true, group: 'view' },
  { id: 'command-palette', label: 'shortcuts.action.commandPalette', defaultAccelerator: 'CmdOrCtrl+K', supportsGlobal: false, group: 'tools' },
]

export function getMergedBindings(stored: ShortcutBinding[]): ShortcutBinding[] {
  return SHORTCUT_ACTIONS.map((action) => {
    const custom = stored.find((b) => b.id === action.id)
    return {
      id: action.id,
      accelerator: custom?.accelerator ?? action.defaultAccelerator,
      global: custom?.global ?? false,
      enabled: custom?.enabled ?? true,
    }
  })
}
