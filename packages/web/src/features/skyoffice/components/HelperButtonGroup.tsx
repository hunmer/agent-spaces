'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Share, CircleHelp, Sun, Moon, X, Lightbulb, ArrowRight, Gamepad2,
} from 'lucide-react'
import { BackgroundMode } from '@agent-spaces/shared/skyoffice'
import { useUserStore } from '../stores/user-store'
import { useRoomStore } from '../stores/room-store'
import { getAvatarString, getColorByString } from '../util'

function InfoCard({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="relative flex flex-col items-center rounded-2xl bg-[#222639] px-[35px] pb-4 pl-4 pt-4 text-[#eee] shadow-[0_0_5px_#0000006f]">
      <Button variant="ghost" size="icon-sm" className="absolute right-3 top-3 text-[#eee] hover:bg-white/10" onClick={onClose}>
        <X className="size-4" />
      </Button>
      {children}
    </div>
  )
}

export default function HelperButtonGroup() {
  const [showControlGuide, setShowControlGuide] = useState(false)
  const [showRoomInfo, setShowRoomInfo] = useState(false)
  const showJoystick = useUserStore((s) => s.showJoystick)
  const backgroundMode = useUserStore((s) => s.backgroundMode)
  const setShowJoystick = useUserStore((s) => s.setShowJoystick)
  const toggleBackgroundMode = useUserStore((s) => s.toggleBackgroundMode)
  const roomJoined = useRoomStore((s) => s.roomJoined)
  const roomId = useRoomStore((s) => s.roomId)
  const roomName = useRoomStore((s) => s.roomName)
  const roomDescription = useRoomStore((s) => s.roomDescription)

  return (
    
      <div className="fixed bottom-4 right-4 flex items-end gap-2.5">
        <div className="flex flex-col gap-2.5">
          {roomJoined && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="secondary"
                    size="icon"
                    className="rounded-full hover:text-[#1ea2df]"
                    onClick={() => setShowJoystick(!showJoystick)}
                  >
                    <Gamepad2 className="size-4" />
                  </Button>
                }
              />
              <TooltipContent>{showJoystick ? 'Disable virtual joystick' : 'Enable virtual joystick'}</TooltipContent>
            </Tooltip>
          )}

          {showRoomInfo && (
            <InfoCard onClose={() => setShowRoomInfo(false)}>
              <div className="my-2.5 flex max-h-[150px] max-w-[460px] items-center justify-center gap-2.5 overflow-y-auto [overflow-wrap:anywhere]">
                <Avatar style={{ backgroundColor: getColorByString(roomName) }}>
                  <AvatarFallback>{getAvatarString(roomName)}</AvatarFallback>
                </Avatar>
                <h3 className="text-2xl text-[#eee]">{roomName}</h3>
              </div>
              <div className="mx-5 flex max-h-[150px] max-w-[460px] items-center justify-center text-base text-[#c2c2c2] [overflow-wrap:anywhere]">
                <ArrowRight className="mr-1 size-4 shrink-0" /> ID: {roomId}
              </div>
              <div className="mx-5 flex max-h-[150px] max-w-[460px] items-center justify-center text-base text-[#c2c2c2] [overflow-wrap:anywhere]">
                <ArrowRight className="mr-1 size-4 shrink-0" /> Description: {roomDescription}
              </div>
            </InfoCard>
          )}

          {showControlGuide && (
            <InfoCard onClose={() => setShowControlGuide(false)}>
              <h3 className="text-center text-2xl text-[#eee]">Controls</h3>
              <ul className="my-2 list-disc pl-5 text-sm text-[#eee]">
                <li><strong>W, A, S, D or arrow keys</strong> to move</li>
                <li><strong>E</strong> to sit down (when facing a chair)</li>
                <li><strong>R</strong> to use vending machine (when facing one)</li>
                <li><strong>Enter</strong> to toggle Agent Activity feed</li>
                <li><strong>ESC</strong> to close feed</li>
              </ul>
              <p className="ml-3 flex items-center gap-1 text-xs text-[#c2c2c2]">
                <Lightbulb className="size-3" /> Agents are driven externally via HTTP API / WebSocket broadcast
              </p>
            </InfoCard>
          )}
        </div>

        <div className="flex gap-2.5">
          {roomJoined && (
            <>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="secondary"
                      size="icon"
                      className="rounded-full hover:text-[#1ea2df]"
                      onClick={() => { setShowRoomInfo(!showRoomInfo); setShowControlGuide(false) }}
                    >
                      <Share className="size-4" />
                    </Button>
                  }
                />
                <TooltipContent>Room Info</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="secondary"
                      size="icon"
                      className="rounded-full hover:text-[#1ea2df]"
                      onClick={() => { setShowControlGuide(!showControlGuide); setShowRoomInfo(false) }}
                    >
                      <CircleHelp className="size-4" />
                    </Button>
                  }
                />
                <TooltipContent>Control Guide</TooltipContent>
              </Tooltip>
            </>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="secondary"
                  size="icon"
                  className="rounded-full hover:text-[#1ea2df]"
                  onClick={() => toggleBackgroundMode()}
                >
                  {backgroundMode === BackgroundMode.DAY ? <Moon className="size-4" /> : <Sun className="size-4" />}
                </Button>
              }
            />
            <TooltipContent>Switch Background Theme</TooltipContent>
          </Tooltip>
        </div>
      </div>
    
  )
}
