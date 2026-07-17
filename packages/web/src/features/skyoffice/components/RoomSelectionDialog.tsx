'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { getPhaserGame } from '../phaser-ref'
import type Bootstrap from '../scenes/Bootstrap'
import { useRoomStore } from '../stores/room-store'

/**
 * RoomSelectionDialog —— 入口选房（shadcn 版）。
 * 流程：Join Public Lobby（公共大厅）/ Join Custom Room（输入 roomId）。
 */
export default function RoomSelectionDialog() {
  const [showJoinForm, setShowJoinForm] = useState(false)
  const [roomId, setRoomId] = useState('')
  const [joining, setJoining] = useState(false)
  const lobbyJoined = useRoomStore((s) => s.lobbyJoined)

  const getBootstrap = () => getPhaserGame()?.scene.keys.bootstrap as Bootstrap | undefined

  const handleConnectPublic = () => {
    const bootstrap = getBootstrap()
    if (!bootstrap) return
    setJoining(true)
    bootstrap.network
      .joinOrCreatePublic()
      .then(() => bootstrap.launchGame())
      .catch((error) => {
        console.error(error)
        toast.error(String(error?.message || error) || 'Failed to connect, please try again!')
        setJoining(false)
      })
  }

  const handleJoinCustom = () => {
    if (!roomId.trim()) return
    const bootstrap = getBootstrap()
    if (!bootstrap) return
    setJoining(true)
    bootstrap.network
      .joinCustomById(roomId.trim())
      .then(() => bootstrap.launchGame())
      .catch((error) => {
        console.error(error)
        const msg =
          (error && (error.message as string)) ||
          (typeof error === 'string' ? error : '') ||
          'Failed to join room'
        toast.error(msg)
        setJoining(false)
      })
  }

  return (
    <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-[60px]">
      <div className="rounded-2xl bg-[#222639] p-9 px-[60px] shadow-[0_0_5px_#0000006f]">
        {showJoinForm ? (
          <div className="relative flex flex-col items-center justify-center gap-5">
            <h1 className="text-center text-2xl text-[#eee]">Join Custom Room</h1>
            <h2 className="m-0 text-center text-lg text-[#c2c2c2]">
              Enter the roomId returned by the HTTP API
            </h2>
            <div className="flex w-[360px] flex-col items-center gap-3">
              <Input
                autoFocus
                placeholder="Room ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleJoinCustom()
                }}
                className="border-[#42eacb] bg-[#1a1d2b] text-white placeholder:text-[#888]"
              />
              <p className="text-xs text-[#888]">Create a room first: POST /api/skyoffice/rooms</p>
              <Button variant="secondary" onClick={handleJoinCustom} disabled={joining || !roomId.trim()} className="w-full">
                Join
              </Button>
              <Button variant="ghost" onClick={() => setShowJoinForm(false)} disabled={joining} className="w-full text-[#42eacb]">
                Back
              </Button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-center text-2xl text-[#eee]">Welcome to Agent Teams</h1>
            <div className="my-5 flex flex-col items-center justify-center gap-5">
              <img src="/assets/skyoffice/logo.png" alt="logo" className="h-[120px] rounded-lg" />
              <Button variant="secondary" onClick={handleConnectPublic} disabled={joining} className="w-full">
                Join Public Lobby
              </Button>
              <Button variant="outline" onClick={() => setShowJoinForm(true)} disabled={joining} className="w-full border-[#42eacb] text-[#42eacb] hover:bg-[#42eacb]/10">
                Join Custom Room
              </Button>
            </div>
          </>
        )}
      </div>
      {!lobbyJoined && (
        <div className="flex w-[360px] flex-col items-center gap-2">
          <h3 className="text-[#33ac96]">{joining ? 'Joining...' : 'Connecting to server...'}</h3>
          <Progress value={50} className="w-full" />
        </div>
      )}
    </div>
  )
}
