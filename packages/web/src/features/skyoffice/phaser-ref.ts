import type Phaser from 'phaser'

/**
 * 全局 Phaser.Game 引用（由 SkyOfficeApp 在 useEffect 里 new 后赋值）。
 * Zustand store 的副作用 action（如 toggleBackgroundMode、setFocused）通过它访问场景。
 * 用 globalThis 而非 window，以便在 SSR 期间不报错（实际只在 client 使用）。
 */
declare global {
  // eslint-disable-next-line no-var
  var game: Phaser.Game | undefined
}

/** 类型安全地获取当前 Phaser.Game（仅在 client 组件内调用）。 */
export function getPhaserGame(): Phaser.Game | undefined {
  return globalThis.game
}
