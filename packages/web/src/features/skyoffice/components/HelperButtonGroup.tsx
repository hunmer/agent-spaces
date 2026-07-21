'use client'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Sun, Moon, Gamepad2 } from 'lucide-react'
import { BackgroundMode } from '@agent-spaces/shared/skyoffice'
import { useUserStore } from '../stores/user-store'
import { useRoomStore } from '../stores/room-store'

export default function HelperButtonGroup() {
  const showJoystick = useUserStore((s) => s.showJoystick)
  const backgroundMode = useUserStore((s) => s.backgroundMode)
  const setShowJoystick = useUserStore((s) => s.setShowJoystick)
  const toggleBackgroundMode = useUserStore((s) => s.toggleBackgroundMode)
  const roomJoined = useRoomStore((s) => s.roomJoined)

  return (
    <div className="absolute top-4 right-4 flex items-center gap-2.5">
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
      </div>

      <div className="flex gap-2.5">
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
