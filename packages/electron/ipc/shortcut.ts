import {
  registerGlobalShortcuts,
  unregisterGlobalShortcuts
} from '../services/shortcut-manager.js'

// Shortcut IPC handlers 已迁移到 backend WS 通道（src/stores/shortcut.ts 使用 wsBridge）。
// 此文件仅导出全局快捷键注册/注销函数，由 main.ts 直接调用。

export { registerGlobalShortcuts, unregisterGlobalShortcuts }
