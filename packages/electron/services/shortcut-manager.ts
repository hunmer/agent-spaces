import { globalShortcut, BrowserWindow } from 'electron'
import { getShortcutBindings, setShortcutBindings } from './store.js'
import {
  type ShortcutBinding,
  SHORTCUT_ACTIONS,
  getMergedBindings
} from '@agent-spaces/shared'

export type { ShortcutGroup, ShortcutAction, ShortcutBinding } from '@agent-spaces/shared'
export { SHORTCUT_GROUPS, SHORTCUT_ACTIONS, getMergedBindings } from '@agent-spaces/shared'


export function getFullBindings(): ShortcutBinding[] {
  return getMergedBindings(getShortcutBindings())
}

export function registerGlobalShortcuts(): void {
  globalShortcut.unregisterAll()
  const bindings = getFullBindings()
  for (const binding of bindings) {
    if (!binding.enabled || !binding.global || !binding.accelerator) continue
    try {
      globalShortcut.register(binding.accelerator, () => {
        const win = BrowserWindow.getAllWindows()[0]
        if (!win) return
        if (binding.id === 'toggle-window') {
          if (win.isMinimized()) {
            win.restore()
            win.focus()
          } else {
            win.minimize()
          }
        } else {
          if (win.isMinimized()) win.restore()
          win.focus()
          win.webContents.send('shortcut', binding.id)
        }
      })
    } catch {
      console.warn(`[ShortcutManager] 注册全局快捷键失败: ${binding.accelerator} (${binding.id})`)
    }
  }
}

export function unregisterGlobalShortcuts(): void {
  globalShortcut.unregisterAll()
}

export function updateShortcutBinding(id: string, accelerator: string, isGlobal: boolean, enabled = true): { success: boolean; error?: string; conflictId?: string } {
  const action = SHORTCUT_ACTIONS.find(a => a.id === id)
  if (!action) return { success: false, error: '功能不存在' }

  if (accelerator && enabled) {
    const mergedBindings = getFullBindings()
    const conflict = mergedBindings.find(b => b.id !== id && b.accelerator === accelerator && b.enabled)
    if (conflict) {
      const conflictAction = SHORTCUT_ACTIONS.find(a => a.id === conflict.id)
      return { success: false, error: `快捷键已被「${conflictAction?.label}」占用`, conflictId: conflict.id }
    }
  }

  const bindings = getShortcutBindings()
  const idx = bindings.findIndex(b => b.id === id)
  const binding: ShortcutBinding = { id, accelerator, global: isGlobal, enabled }
  if (idx >= 0) {
    bindings[idx] = binding
  } else {
    bindings.push(binding)
  }
  setShortcutBindings(bindings)
  registerGlobalShortcuts()
  return { success: true }
}

export function clearShortcutBinding(id: string): void {
  updateShortcutBinding(id, '', false, true)
}
