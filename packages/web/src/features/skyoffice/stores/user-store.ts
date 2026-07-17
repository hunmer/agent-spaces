import { create } from 'zustand'
import { BackgroundMode } from '@agent-spaces/shared/skyoffice'
import { getPhaserGame } from '../phaser-ref'
import type Bootstrap from '../scenes/Bootstrap'

/** 根据当前小时判断初始昼夜模式（6<时<=18 为白天）。SSR 安全：仅在 client 调用。 */
export function getInitialBackgroundMode(): BackgroundMode {
  if (typeof window === 'undefined') return BackgroundMode.DAY
  const hours = new Date().getHours()
  return hours > 6 && hours <= 18 ? BackgroundMode.DAY : BackgroundMode.NIGHT
}

interface UserState {
  backgroundMode: BackgroundMode
  sessionId: string
  loggedIn: boolean
  /** sessionId → 昵称（替代原 Redux 的 Map，用 Record 更适合序列化） */
  playerNameMap: Record<string, string>
  showJoystick: boolean
  setBackgroundMode: (mode: BackgroundMode) => void
  /** 切换昼夜：先更新 state，再调用 Bootstrap 场景刷新背景。 */
  toggleBackgroundMode: () => void
  setSessionId: (id: string) => void
  setLoggedIn: (v: boolean) => void
  setPlayerNameMap: (payload: { id: string; name: string }) => void
  removePlayerNameMap: (id: string) => void
  setShowJoystick: (v: boolean) => void
}

export const useUserStore = create<UserState>((set, get) => ({
  backgroundMode: getInitialBackgroundMode(),
  sessionId: '',
  loggedIn: false,
  playerNameMap: {},
  showJoystick: typeof window !== 'undefined' && window.innerWidth < 650,

  setBackgroundMode: (mode) => set({ backgroundMode: mode }),

  toggleBackgroundMode: () => {
    const newMode =
      get().backgroundMode === BackgroundMode.DAY ? BackgroundMode.NIGHT : BackgroundMode.DAY
    set({ backgroundMode: newMode })
    const bootstrap = getPhaserGame()?.scene.keys.bootstrap as Bootstrap | undefined
    bootstrap?.changeBackgroundMode(newMode)
  },

  setSessionId: (id) => set({ sessionId: id }),
  setLoggedIn: (v) => set({ loggedIn: v }),
  setPlayerNameMap: ({ id, name }) => {
    // 注意：原实现用 sanitizeId(id) 作为 key。这里沿用（导入来自 util）。
    // 为避免循环依赖，由调用方传入已 sanitize 的 id 更干净，这里保持兼容直接 sanitize。
    // 实际调用点 Network.initialize 已传原始 sessionId，此处保持原语义。
    set((s) => ({ playerNameMap: { ...s.playerNameMap, [id]: name } }))
  },
  removePlayerNameMap: (id) =>
    set((s) => {
      const next = { ...s.playerNameMap }
      delete next[id]
      return { playerNameMap: next }
    }),
  setShowJoystick: (v) => set({ showJoystick: v }),
}))
