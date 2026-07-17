import type { Client } from 'colyseus'
import commandPkg from '@colyseus/command'
const { Command } = commandPkg
import { IOfficeState } from '../../types/IOfficeState.js'

type Payload = {
  client: Client
  name: string
}

export default class PlayerUpdateNameCommand extends Command<IOfficeState, Payload> {
  execute(data: Payload) {
    const { client, name } = data

    const player = this.room.state.players.get(client.sessionId)

    if (!player) return
    player.name = name
  }
}
