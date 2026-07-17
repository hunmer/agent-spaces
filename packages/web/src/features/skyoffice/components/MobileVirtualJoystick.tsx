import { useEffect, useState } from 'react'
import JoystickItem, { type JoystickMovement } from './Joystick'
import { getPhaserGame } from '../phaser-ref'
import type Game from '../scenes/Game'
import { useUserStore } from '../stores/user-store'
import { useChatStore } from '../stores/chat-store'

export const minimumScreenWidthSize = 650 //px

/** 监听窗口宽度，返回是否为小屏（用于移动端摇杆显隐判断）。 */
function useIsSmallScreen(smallScreenSize: number): boolean {
  const [width, setWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1024))
  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  return width <= smallScreenSize
}

export default function MobileVirtualJoystick() {
  const showJoystick = useUserStore((s) => s.showJoystick)
  const showChat = useChatStore((s) => s.showChat)
  const hasSmallScreen = useIsSmallScreen(minimumScreenWidthSize)

  const handleMovement = (movement: JoystickMovement) => {
    const game = getPhaserGame()?.scene.keys.game as Game | undefined
    game?.myPlayer?.handleJoystickMovement(movement)
  }

  return (
    <div className="fixed bottom-[100px] right-8 max-h-1/2 max-w-full">
      <div className="relative flex h-full flex-col p-4">
        {!(showChat && hasSmallScreen) && showJoystick && (
          <div className="mt-auto self-end">
            <JoystickItem onDirectionChange={handleMovement} />
          </div>
        )}
      </div>
    </div>
  )
}
