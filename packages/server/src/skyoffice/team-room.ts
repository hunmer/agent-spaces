import { randomBytes } from 'node:crypto'
import colyseus from 'colyseus'
import { RoomType, type IRoomData } from './types/Rooms.js'
import { bridge } from './broadcast/Bridge.js'
import { roomRegistry, type RegisteredRoom } from './rooms/RoomRegistry.js'
import { findPresetById, listMemberships, loadTeam } from '../services/team-internal.js'
import { findAgent as findChatAgent } from '../services/chat.js'

const { matchMaker } = colyseus
const pendingRooms = new Map<string, Promise<RegisteredRoom>>()
const textures = ['adam', 'ash', 'lucy', 'nancy']

export function getTeamRoomId(teamId: string): string {
  return `team-${teamId}`
}

export async function createSkyOfficeRoom(input: {
  roomId?: string
  name: string
  description: string
  autoDispose: boolean
}): Promise<RegisteredRoom> {
  const roomId = input.roomId ?? randomBytes(8).toString('hex')
  const existing = roomRegistry.get(roomId)
  if (existing) return existing

  const pending = pendingRooms.get(roomId)
  if (pending) return pending

  const creation = (async () => {
    const roomToken = randomBytes(24).toString('hex')
    const roomData: IRoomData = {
      name: input.name,
      description: input.description,
      roomToken,
      autoDispose: input.autoDispose,
    }
    const listing = await matchMaker.createRoom(RoomType.CUSTOM, { ...roomData, bizRoomId: roomId })
    const entry: RegisteredRoom = {
      roomId,
      roomToken,
      colyseusRoomId: listing.roomId,
      name: input.name,
      description: input.description,
      createdAt: Date.now(),
    }
    roomRegistry.register(entry)
    return entry
  })()

  pendingRooms.set(roomId, creation)
  try {
    return await creation
  } finally {
    pendingRooms.delete(roomId)
  }
}

export async function ensureTeamRoom(teamId: string): Promise<RegisteredRoom> {
  const team = loadTeam(teamId)
  if (!team) throw new Error(`team not found: ${teamId}`)

  const room = await createSkyOfficeRoom({
    roomId: getTeamRoomId(teamId),
    name: team.name,
    description: team.description,
    autoDispose: false,
  })
  const members = listMemberships(teamId).filter((member) => member.status === 'active')
  const memberIds = new Set(members.map((member) => member.agentId))

  for (const agent of bridge.listAgents(room.roomId)) {
    if (!memberIds.has(agent.id)) bridge.despawnAgent(room.roomId, agent.id)
  }
  members.forEach((member, index) => {
    const embeddedName = typeof member.agent?.name === 'string' ? member.agent.name : undefined
    const name = embeddedName ?? findPresetById(member.agentId)?.name ?? findChatAgent(member.agentId)?.name ?? member.agentId
    const texture = textures[index % textures.length]
    bridge.spawnAgent(room.roomId, member.agentId, {
      name,
      texture,
      anim: `${texture}_idle_down`,
      x: 560 + (index % 4) * 48,
      y: 500 + Math.floor(index / 4) * 48,
    })
  })
  return room
}

export async function setTeamAgentActivity(
  teamId: string,
  agentId: string,
  activity: 'working' | 'idle',
): Promise<void> {
  try {
    const room = await ensureTeamRoom(teamId)
    if (activity === 'working') bridge.agentTalk(room.roomId, agentId, '开始处理团队任务', 4000)
    await bridge.agentActivity(room.roomId, agentId, activity)
  } catch (error) {
    console.warn(`[skyoffice] failed to update team agent activity teamId=${teamId} agentId=${agentId}:`, error)
  }
}
