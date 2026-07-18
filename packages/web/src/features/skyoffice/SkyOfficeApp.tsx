'use client'

import { useEffect, useRef } from 'react'
import { Toaster } from 'sonner'
import { useUserStore } from './stores/user-store'
import { useRoomStore } from './stores/room-store'
import { createPhaserGame } from './PhaserGame'
import RoomSelectionDialog from './components/RoomSelectionDialog'
import LoginDialog from './components/LoginDialog'
import AgentFeed from './components/AgentFeed'
import DebugPanel from './components/DebugPanel'
import ChairZoneMenu from './components/ChairZoneMenu'
import HelperButtonGroup from './components/HelperButtonGroup'
import MobileVirtualJoystick from './components/MobileVirtualJoystick'
import type Bootstrap from './scenes/Bootstrap'

/**
 * SkyOffice 顶层容器（替代原 Vite App.tsx）。
 *
 * 职责：
 *   1. 挂载 Phaser canvas 容器（useEffect 内 createPhaserGame，client-only）
 *   2. 挂载 sonner Toaster（RoomSelectionDialog 错误提示用）
 *   3. 按 Zustand 三态切换主 UI（loggedIn / roomJoined）
 *   4. Backdrop 用 pointer-events:none 透传点击给 Phaser，子元素再 pointer-events:auto
 *
 * 必须由 dynamic(..., { ssr: false }) 包裹（Phaser 访问 window）。
 */
export function SkyOfficeApp({ teamId }: { teamId?: string } = {}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const loggedIn = useUserStore((s) => s.loggedIn)
  const roomJoined = useRoomStore((s) => s.roomJoined)

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false
    useRoomStore.getState().setLobbyJoined(false)
    useRoomStore.getState().setRoomJoined(false)
    useUserStore.getState().setLoggedIn(false)
    const game = createPhaserGame(containerRef.current, (readyGame) => {
      if (!teamId) return
      void (async () => {
        try {
          const server = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3100'
          const response = await fetch(`${server}/api/skyoffice/team-rooms/${encodeURIComponent(teamId)}`, { method: 'POST' })
          if (!response.ok) throw new Error(await response.text())
          const { roomId } = await response.json() as { roomId: string }
          const bootstrap = readyGame.scene.keys.bootstrap as Bootstrap
          await bootstrap.network.joinCustomById(roomId)
          if (cancelled) return
          bootstrap.launchGame(true)
          useUserStore.getState().setLoggedIn(true)
        } catch (error) {
          console.error('[skyoffice] failed to join team room:', error)
        }
      })()
    })
    return () => {
      cancelled = true
      game.destroy(true)
      ;(globalThis as any).game = undefined
    }
  }, [teamId])

  let ui
  if (loggedIn) {
    ui = (
      <>
        <AgentFeed />
        <MobileVirtualJoystick />
      </>
    )
  } else if (roomJoined) {
    ui = <LoginDialog />
  } else {
    ui = <RoomSelectionDialog />
  }

  return (
    <div className={`relative overflow-hidden bg-[#93cbee] ${teamId ? 'h-[480px] w-full' : 'h-screen w-screen'}`}>
      {/* Phaser canvas 挂载点 */}
      <div ref={containerRef} className="absolute inset-0" />
      {/* UI 层：默认透传点击给 Phaser，子元素自行开启 pointer-events */}
      <div className="pointer-events-none absolute inset-0 [&>*]:pointer-events-auto">
        {ui}
        <HelperButtonGroup />
        {loggedIn && <DebugPanel />}
        {loggedIn && <ChairZoneMenu />}
      </div>
      <Toaster position="top-center" richColors />
    </div>
  )
}
