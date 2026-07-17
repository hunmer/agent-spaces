import { enableMapSet } from 'immer'
import { configureStore } from '@reduxjs/toolkit'
import userReducer from './UserStore'
import chatReducer from './ChatStore'
import roomReducer from './RoomStore'
import agentDebugReducer from './AgentStore'

enableMapSet()

const store = configureStore({
  reducer: {
    user: userReducer,
    chat: chatReducer,
    room: roomReducer,
    agentDebug: agentDebugReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
})

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export default store
