import React, { useState, useEffect } from 'react'
import styled from 'styled-components'

import { phaserEvents } from '../events/EventCenter'
import { useAppSelector } from '../hooks'
import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'

/**
 * ChairZoneMenu —— 点击椅子时弹出的小菜单，用于选择该椅子归属哪个 zone。
 *
 * 流程：
 *   1. Phaser 的 Chair 收到 pointerdown → emit('chair-zone-click', {chairIndex, x, y, currentZone})
 *   2. 本组件监听该事件，在屏幕坐标 (x, y) 处显示菜单
 *   3. 用户选择 zone → 调 network.setChairZone 写回 map.json
 *   4. 写回成功后 emit('chair-zone-updated') 让 Game 更新椅子颜色提示
 *
 * 事件穿透防护（Bug 修复）：
 *   - 菜单和遮罩在 mousedown 阶段就 stopPropagation + preventDefault，
 *     避免同一个鼠标点击穿透到 Phaser canvas 触发下方椅子的 pointerdown。
 *   - 如果只用 onClick 关闭菜单，浏览器会把 mousedown→mouseup→click 都派发，
 *     canvas 在 mousedown 时就已经收到了事件 → 又弹出新菜单。
 */
const ZONE_OPTIONS: Array<{ value: string; label: string; color: string }> = [
  { value: '', label: 'None', color: '#9e9e9e' },
  { value: 'working', label: 'Working', color: '#4caf50' },
  { value: 'meeting', label: 'Meeting', color: '#2196f3' },
  { value: 'relaxing', label: 'Relaxing', color: '#ff9800' },
]

interface ClickPayload {
  chairIndex: number
  x: number
  y: number
  currentZone: string
}

const MenuWrap = styled.div<{ top: number; left: number }>`
  position: fixed;
  top: ${(p) => p.top}px;
  left: ${(p) => p.left}px;
  background: #222639;
  border-radius: 8px;
  box-shadow: 0px 4px 16px #0000008f;
  padding: 4px;
  z-index: 10000;
  min-width: 120px;
  /* 阻止内部文字被选中（避免双击选中文字后穿透） */
  user-select: none;
`

/**
 * 遮罩层：覆盖整个屏幕，捕获所有鼠标事件，防止穿透到 canvas。
 * 在 mousedown 阶段就拦截，比 onClick 更早。
 */
const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 9999;
`

const MenuItem = styled.button<{ color: string; active: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  color: ${(p) => (p.active ? p.color : '#ddd')};
  font-size: 13px;
  cursor: pointer;
  border-radius: 4px;
  text-align: left;
  font-weight: ${(p) => (p.active ? 'bold' : 'normal')};

  &:hover {
    background: #ffffff14;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${(p) => p.color};
    flex-shrink: 0;
  }
`

const Tip = styled.div`
  padding: 6px 10px;
  color: #888;
  font-size: 11px;
  text-align: center;
  border-bottom: 1px solid #ffffff14;
  margin-bottom: 2px;
`

export default function ChairZoneMenu() {
  const [payload, setPayload] = useState<ClickPayload | null>(null)
  const [saving, setSaving] = useState(false)
  const loggedIn = useAppSelector((state) => state.user.loggedIn)

  useEffect(() => {
    if (!loggedIn) return
    const handler = (p: ClickPayload) => {
      setPayload(p)
    }
    phaserEvents.on('chair-zone-click', handler)
    return () => {
      phaserEvents.off('chair-zone-click', handler)
    }
  }, [loggedIn])

  /**
   * 菜单显示/隐藏时，启用/禁用 Phaser 的输入系统。
   *
   * 这是最可靠的方式防止"点击菜单选项 → 事件穿透到 canvas → 触发下方椅子"
   * 的问题。React 的 stopPropagation 只作用于合成事件，无法阻止原生事件
   * 派发到 canvas；而直接禁用 scene.input 从根本上杜绝 Phaser 接收任何指针事件。
   */
  useEffect(() => {
    const game = phaserGame.scene.keys.game as Game | undefined
    if (!game) return
    if (payload) {
      // 菜单打开：禁用 Phaser 输入
      game.input.enabled = false
    } else {
      // 菜单关闭：恢复 Phaser 输入
      game.input.enabled = true
    }
    return () => {
      // 组件卸载时确保恢复
      game.input.enabled = true
    }
  }, [payload])

  if (!loggedIn || !payload) return null

  const game = phaserGame.scene.keys.game as Game

  /**
   * 阻止鼠标事件冒泡（双保险，主要靠 input.enabled=false 防穿透）。
   */
  const swallowEvent = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
  }

  const handleSelect = async (zone: string) => {
    if (saving) return
    setSaving(true)
    try {
      const ok = await game.network.setChairZone(payload.chairIndex, zone)
      if (ok) {
        phaserEvents.emit('chair-zone-updated', { chairIndex: payload.chairIndex, zone })
      }
    } catch (e) {
      console.error('set chair zone failed:', e)
    } finally {
      setSaving(false)
      setPayload(null)
    }
  }

  const close = () => {
    if (!saving) setPayload(null)
  }

  // 边界检查：菜单不超出屏幕
  const left = Math.min(payload.x, window.innerWidth - 140)
  const top = Math.min(payload.y, window.innerHeight - 180)

  return (
    <>
      {/* 遮罩：mousedown 阶段就拦截，关闭菜单 */}
      <Backdrop
        onMouseDown={(e) => {
          swallowEvent(e)
          close()
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      {/* 菜单本体：所有鼠标事件都阻止冒泡，防止穿透 */}
      <MenuWrap
        top={top}
        left={left}
        onMouseDown={swallowEvent}
        onMouseUp={swallowEvent}
        onClick={swallowEvent}
      >
        <Tip>Chair #{payload.chairIndex} zone</Tip>
        {ZONE_OPTIONS.map((opt) => (
          <MenuItem
            key={opt.value}
            color={opt.color}
            active={payload.currentZone === opt.value}
            disabled={saving}
            // 关键：在 mousedown 阶段就 stopPropagation，避免穿透到 canvas
            onMouseDown={swallowEvent}
            onClick={(e) => {
              swallowEvent(e)
              handleSelect(opt.value)
            }}
          >
            <span className="dot" />
            {opt.label}
          </MenuItem>
        ))}
      </MenuWrap>
    </>
  )
}
