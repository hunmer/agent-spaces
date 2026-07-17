import Phaser from 'phaser'
import { ItemType } from '../../../types/Items'
import Item from './Item'
import { phaserEvents } from '../events/EventCenter'

/**
 * 椅子的 zone 标记（手动指定）。
 * 空字符串表示未标记。
 */
export type ChairZone = '' | 'working' | 'meeting' | 'relaxing'

/** zone 对应的提示色（用于在椅子上方显示彩色小圆点） */
export const ZONE_COLORS: Record<ChairZone, number> = {
  '': 0x000000,
  working: 0x4caf50,
  meeting: 0x2196f3,
  relaxing: 0xff9800,
}

/**
 * Chair —— 地图上的椅子。
 *
 * 交互行为：
 *   - 鼠标悬停（hover）：椅子变灰 + 上方显示 zone 颜色圆点（仅标记过的椅子）
 *   - 鼠标点击：弹出 zone 选择菜单（React 浮层）
 *
 * 视觉提示（zone 圆点）只在 hover 时显示，避免地图上常驻一堆圆点干扰画面。
 */
export default class Chair extends Item {
  itemDirection?: string
  /** 手动标记的 zone（由鼠标交互设置，写回 map.json） */
  zone: ChairZone = ''
  /** 该 chair 在 Chair 对象层的索引（用于调 API 写回） */
  chairIndex: number = -1
  /** 椅子上方的 zone 提示圆点（仅 hover 时可见） */
  private zoneMarker?: Phaser.GameObjects.Arc
  private pointerDownAt?: Phaser.Math.Vector2

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, frame?: string | number) {
    super(scene, x, y, texture, frame)

    this.itemType = ItemType.CHAIR

    // 启用鼠标交互
    this.setInteractive({ useHandCursor: true })
    this.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointerDownAt = new Phaser.Math.Vector2(pointer.x, pointer.y)
    })
    this.on('pointerup', this.handlePointerUp, this)
    this.on('pointerover', () => {
      this.setTint(0xcccccc)
      this.showZoneMarker()
    })
    this.on('pointerout', () => {
      this.clearTint()
      this.hideZoneMarker()
    })
  }

  /**
   * 设置 zone 标记。
   * 不直接写 map.json —— 由 React 菜单调用 API 写回，成功后再调用此方法。
   * 如果鼠标当前正悬停在这把椅子上，立即显示新颜色的圆点。
   */
  setZone(zone: ChairZone) {
    this.zone = zone
    // 如果圆点当前可见，更新颜色；否则什么都不做（hover 时才显示）
    if (this.zoneMarker && this.zoneMarker.visible) {
      this.hideZoneMarker()
      this.showZoneMarker()
    }
  }

  /** 显示 zone 颜色圆点（仅 hover 时调用） */
  private showZoneMarker() {
    if (this.zone === '') return
    // 已存在则更新颜色
    if (this.zoneMarker) {
      this.zoneMarker.destroy()
    }
    const color = ZONE_COLORS[this.zone]
    this.zoneMarker = this.scene.add
      .circle(this.x, this.y - this.height * 0.5 - 8, 5, color)
      .setStrokeStyle(1, 0x000000)
      .setDepth(10001)
      .setVisible(true)
  }

  /** 隐藏 zone 颜色圆点（pointerout 时调用） */
  private hideZoneMarker() {
    if (this.zoneMarker) {
      this.zoneMarker.destroy()
      this.zoneMarker = undefined
    }
  }

  /** 鼠标点击：通过 phaserEvents 通知 React 弹出 zone 选择菜单 */
  private handlePointerUp(pointer: Phaser.Input.Pointer) {
    if (!this.pointerDownAt || Phaser.Math.Distance.BetweenPoints(this.pointerDownAt, pointer) > 6) return
    // 用浏览器原生事件坐标（event.clientX/Y）确保和 React 定位一致
    const evt = pointer.event as MouseEvent
    phaserEvents.emit('chair-zone-click', {
      chairIndex: this.chairIndex,
      x: evt.clientX,
      y: evt.clientY,
      currentZone: this.zone,
    })
  }

  destroy(fromScene?: boolean) {
    this.hideZoneMarker()
    this.off('pointerdown')
    this.off('pointerup')
    this.off('pointerover')
    this.off('pointerout')
    super.destroy(fromScene)
  }

  onOverlapDialog() {
    if (this.zone) {
      this.setDialogBox(`Zone: ${this.zone}`)
    } else {
      this.setDialogBox('Press E to sit')
    }
  }
}
