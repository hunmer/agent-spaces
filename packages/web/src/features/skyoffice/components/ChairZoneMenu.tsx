'use client'

import { useEffect, useState } from 'react'
import { phaserEvents } from '../events/EventCenter'
import { useUserStore } from '../stores/user-store'
import { getPhaserGame } from '../phaser-ref'
import type Game from '../scenes/Game'

/**
 * ChairZoneMenu —— 点击椅子时弹出的小菜单（选择该椅子归属哪个 zone）。
 *
 * 事件穿透防护（Bug 修复，必须保留）：
 *   1. 菜单显示时禁用 Phaser scene.input（根本杜绝 canvas 接收指针事件）
 *   2. 菜单/遮罩在 mousedown 阶段就 stopPropagation + preventDefault（双保险）
 * 原因：React stopPropagation 只阻合成事件，无法阻止原生事件派发到 canvas；
 * 直接禁用 scene.input 是最可靠的方式。
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

export default function ChairZoneMenu() {
  const [payload, setPayload] = useState<ClickPayload | null>(null)
  const [saving, setSaving] = useState(false)
  const loggedIn = useUserStore((s) => s.loggedIn)

  // 监听 Phaser 的 chair-zone-click 事件
  useEffect(() => {
    if (!loggedIn) return
    const handler = (p: ClickPayload) => setPayload(p)
    phaserEvents.on('chair-zone-click', handler)
    return () => {
      phaserEvents.off('chair-zone-click', handler)
    }
  }, [loggedIn])

  // 菜单显示/隐藏时，启用/禁用 Phaser 输入系统（防穿透核心）
  useEffect(() => {
    const game = getPhaserGame()?.scene.keys.game as Game | undefined
    if (!game) return
    if (payload) {
      game.input.enabled = false
    } else {
      game.input.enabled = true
    }
    return () => {
      game.input.enabled = true
    }
  }, [payload])

  if (!loggedIn || !payload) return null

  const game = getPhaserGame()?.scene.keys.game as Game | undefined

  const swallowEvent = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
  }

  const handleSelect = async (zone: string) => {
    if (saving || !game) return
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
      {/* 遮罩：mousedown 阶段就拦截关闭菜单 */}
      <div
        className="fixed inset-0 z-[9999]"
        onMouseDown={(e) => {
          swallowEvent(e)
          close()
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      {/* 菜单本体：所有鼠标事件阻止冒泡 */}
      <div
        className="fixed z-[10000] min-w-[120px] select-none rounded-lg bg-[#222639] p-1 shadow-[0_4px_16px_#0000008f]"
        style={{ top, left }}
        onMouseDown={swallowEvent}
        onMouseUp={swallowEvent}
        onClick={swallowEvent}
      >
        <div className="mb-0.5 border-b border-[#ffffff14] px-2.5 py-1.5 text-center text-[11px] text-[#888]">
          Chair #{payload.chairIndex} zone
        </div>
        {ZONE_OPTIONS.map((opt) => {
          const active = payload.currentZone === opt.value
          return (
            <button
              key={opt.value}
              disabled={saving}
              onMouseDown={swallowEvent}
              onClick={(e) => {
                swallowEvent(e)
                handleSelect(opt.value)
              }}
              className="flex w-full cursor-pointer items-center gap-2 rounded px-3 py-2 text-left text-[13px] transition-colors hover:bg-[#ffffff14] disabled:opacity-50"
              style={{ color: active ? opt.color : '#ddd', fontWeight: active ? 'bold' : 'normal' }}
            >
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: opt.color }} />
              {opt.label}
            </button>
          )
        })}
      </div>
    </>
  )
}
