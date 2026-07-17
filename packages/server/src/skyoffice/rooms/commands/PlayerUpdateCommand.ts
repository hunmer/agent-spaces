import type { Client } from 'colyseus'
import commandPkg from '@colyseus/command'
const { Command } = commandPkg
import { IOfficeState } from '../../types/IOfficeState.js'

type Payload = {
  client: Client
  x: number
  y: number
  anim: string
}

export default class PlayerUpdateCommand extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    const { client, x, y, anim } = data

    const player = this.room.state.players.get(client.sessionId)

    if (!player) return
    player.x = x
    player.y = y
    player.anim = anim
  }
}
