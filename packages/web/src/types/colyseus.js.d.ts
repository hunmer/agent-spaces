/**
 * colyseus.js@0.14 的 package.json exports.typings 指向不存在的 ./dist/colyseus.d.ts，
 * 真实类型在顶层 typings（lib/index.d.ts）。TS 在 moduleResolution:bundler 下走 exports
 * 解析失败。这里内联 skyoffice 实际用到的最小类型集合（Client / Room / RoomAvailable），
 * 签名提取自 colyseus.js/lib/Client.d.ts 与 lib/Room.d.ts。
 */
declare module 'colyseus.js' {
  export interface RoomAvailable<Metadata = any> {
    roomId: string
    clients: number
    maxClients: number
    metadata?: Metadata
  }

  export class Room<State = any> {
    id: string
    sessionId: string
    name: string
    onStateChange: ((cb: (state: State) => void) => any) & {
      once: (cb: (state: State) => void) => void
      remove: (cb: (state: State) => void) => void
      clear: () => void
    }
    onError: ((cb: (code: number, message?: string) => void) => any) & {
      once: (cb: (code: number, message?: string) => void) => void
      remove: (cb: (code: number, message?: string) => void) => void
    }
    onLeave: ((cb: (code: number) => void) => any) & {
      once: (cb: (code: number) => void) => void
      remove: (cb: (code: number) => void) => void
    }
    serializerId: string
    constructor(name: string, rootSchema?: any)
    connect(endpoint: string): void
    leave(consented?: boolean): Promise<number>
    onMessage<T = any>(type: '*', callback: (type: string | number, message: T) => void): any
    onMessage<T = any>(type: string | number, callback: (message: T) => void): any
    send(type: string | number, message?: any): void
    readonly state: State
    removeAllListeners(): void
  }

  export type JoinOptions = Record<string, any>

  export class Client {
    constructor(endpoint?: string)
    joinOrCreate<T>(roomName: string, options?: JoinOptions, rootSchema?: any): Promise<Room<T>>
    create<T>(roomName: string, options?: JoinOptions, rootSchema?: any): Promise<Room<T>>
    join<T>(roomName: string, options?: JoinOptions, rootSchema?: any): Promise<Room<T>>
    joinById<T>(roomId: string, options?: JoinOptions, rootSchema?: any): Promise<Room<T>>
    reconnect<T>(roomId: string, sessionId: string, rootSchema?: any): Promise<Room<T>>
    getAvailableRooms<Metadata = any>(roomName?: string): Promise<RoomAvailable<Metadata>[]>
    consumeSeatReservation<T>(response: any, rootSchema?: any): Promise<Room<T>>
  }

  export enum Protocol {}
  export enum ErrorCode {}
}
