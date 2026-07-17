import { create } from 'zustand'
import type { RoomAvailable } from 'colyseus.js'
import { RoomType } from '@agent-spaces/shared/skyoffice'

interface RoomState {
  lobbyJoined: boolean
  roomJoined: boolean
  roomId: string
  roomName: string
  roomDescription: string
  availableRooms: RoomAvailable[]
  setLobbyJoined: (v: boolean) => void
  setRoomJoined: (v: boolean) => void
  setJoinedRoomData: (data: { id: string; name: string; description: string }) => void
  setAvailableRooms: (rooms: RoomAvailable[]) => void
  addAvailableRooms: (payload: { roomId: string; room: RoomAvailable }) => void
  removeAvailableRooms: (roomId: string) => void
}

/** 仅保留自定义房间（过滤公共大厅）。 */
function isCustomRoom(room: RoomAvailable): boolean {
  return room.name === RoomType.CUSTOM
}

export const useRoomStore = create<RoomState>((set) => ({
  lobbyJoined: false,
  roomJoined: false,
  roomId: '',
  roomName: '',
  roomDescription: '',
  availableRooms: [],

  setLobbyJoined: (v) => set({ lobbyJoined: v }),
  setRoomJoined: (v) => set({ roomJoined: v }),
  setJoinedRoomData: ({ id, name, description }) =>
    set({ roomId: id, roomName: name, roomDescription: description }),
  setAvailableRooms: (rooms) => set({ availableRooms: rooms.filter(isCustomRoom) }),
  addAvailableRooms: ({ roomId, room }) =>
    set((s) => {
      if (!isCustomRoom(room)) return s
      const exists = s.availableRooms.some((r) => r.roomId === roomId)
      const next = exists
        ? s.availableRooms.map((r) => (r.roomId === roomId ? room : r))
        : [...s.availableRooms, room]
      return { availableRooms: next }
    }),
  removeAvailableRooms: (roomId) =>
    set((s) => ({ availableRooms: s.availableRooms.filter((r) => r.roomId !== roomId) })),
}))
