import * as Phaser from 'phaser'
import Bootstrap from './scenes/Bootstrap'
import Background from './scenes/Background'
import Game from './scenes/Game'

/**
 * 创建 Phaser.Game 实例（工厂函数，非模块顶层执行）。
 *
 * 必须在 client 端、拿到 DOM 容器后调用（SkyOfficeApp 的 useEffect 内）。
 * scale 用容器尺寸而非 window，以便在页面布局中正确自适应。
 *
 * @param parent Phaser canvas 挂载的 DOM 元素
 */
export function createPhaserGame(parent: HTMLElement, onReady?: (game: Phaser.Game) => void): Phaser.Game {
  const rect = parent.getBoundingClientRect()
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#93cbee',
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.ScaleModes.RESIZE,
      width: rect.width || window.innerWidth,
      height: rect.height || window.innerHeight,
    },
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: 0 }, debug: false },
    },
    autoFocus: true,
    scene: [Bootstrap, Background, Game],
    callbacks: { postBoot: onReady },
  }
  const phaserGame = new Phaser.Game(config)
  // 全局引用，供 Zustand store 副作用和 React 组件访问场景
  ;(globalThis as any).game = phaserGame
  return phaserGame
}
