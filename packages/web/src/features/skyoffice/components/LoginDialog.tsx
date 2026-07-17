'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  type CarouselApi,
} from '@/components/ui/carousel'
import { ArrowRight } from 'lucide-react'
import { useUserStore } from '../stores/user-store'
import { useRoomStore } from '../stores/room-store'
import { getPhaserGame } from '../phaser-ref'
import type Game from '../scenes/Game'
import { getAvatarString, getColorByString } from '../util'

const avatars = [
  { name: 'adam', img: '/assets/skyoffice/login/Adam_login.png' },
  { name: 'ash', img: '/assets/skyoffice/login/Ash_login.png' },
  { name: 'lucy', img: '/assets/skyoffice/login/Lucy_login.png' },
  { name: 'nancy', img: '/assets/skyoffice/login/Nancy_login.png' },
]

export default function LoginDialog() {
  const [name, setName] = useState('')
  const [avatarIndex, setAvatarIndex] = useState(0)
  const [nameFieldEmpty, setNameFieldEmpty] = useState(false)
  const [api, setApi] = useState<CarouselApi>()

  const roomJoined = useRoomStore((s) => s.roomJoined)
  const roomName = useRoomStore((s) => s.roomName)
  const roomDescription = useRoomStore((s) => s.roomDescription)
  const setLoggedIn = useUserStore((s) => s.setLoggedIn)

  // embla select 事件 → 更新当前 avatarIndex
  useEffect(() => {
    if (!api) return
    const onSelect = () => setAvatarIndex(api.selectedScrollSnap())
    api.on('select', onSelect)
    onSelect()
    return () => {
      api.off('select', onSelect)
    }
  }, [api])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (name === '') {
      setNameFieldEmpty(true)
    } else if (roomJoined) {
      const game = getPhaserGame()?.scene.keys.game as Game | undefined
      game?.registerKeys()
      game?.myPlayer.setPlayerName(name)
      game?.myPlayer.setPlayerTexture(avatars[avatarIndex].name)
      setLoggedIn(true)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[#222639] p-9 px-[60px] shadow-[0_0_5px_#0000006f]"
    >
      <p className="m-1 text-center text-xl text-[#c2c2c2]">Joining</p>
      <div className="flex max-h-[120px] max-w-[500px] items-center justify-center gap-2.5 overflow-y-auto [overflow-wrap:anywhere]">
        <Avatar style={{ backgroundColor: getColorByString(roomName) }}>
          <AvatarFallback>{getAvatarString(roomName)}</AvatarFallback>
        </Avatar>
        <h3 className="text-2xl text-[#eee]">{roomName}</h3>
      </div>
      <div className="flex max-h-[150px] max-w-[500px] justify-center overflow-y-auto text-base text-[#c2c2c2] [overflow-wrap:anywhere]">
        <ArrowRight className="mr-1 mt-1 size-4 shrink-0" /> {roomDescription}
      </div>
      <div className="my-9 flex">
        <div className="mr-12">
          <h3 className="w-40 text-center text-base text-[#eee]">Select an avatar</h3>
          <Carousel
            opts={{ loop: true }}
            setApi={setApi}
            className="mt-2 h-[220px] w-40 overflow-hidden rounded-lg"
          >
            <CarouselContent>
              {avatars.map((avatar) => (
                <CarouselItem key={avatar.name} className="flex h-[220px] items-center justify-center bg-[#dbdbe0]">
                  <img src={avatar.img} alt={avatar.name} className="block h-[136px] w-[95px] object-contain" />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
          </Carousel>
        </div>
        <div className="w-[300px]">
          <Label htmlFor="skyoffice-login-name" className="text-[#eee]">Name</Label>
          <Input
            id="skyoffice-login-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={nameFieldEmpty}
            className="mt-1 border-[#42eacb] bg-[#1a1d2b] text-white"
          />
          {nameFieldEmpty && <p className="mt-1 text-xs text-destructive">Name is required</p>}
        </div>
      </div>
      <div className="flex items-center justify-center">
        <Button type="submit" variant="secondary" size="lg">
          Join
        </Button>
      </div>
    </form>
  )
}
