import React from 'react'
import styled from 'styled-components'

import { useAppSelector } from './hooks'

import RoomSelectionDialog from './components/RoomSelectionDialog'
import LoginDialog from './components/LoginDialog'
import AgentFeed from './components/AgentFeed'
import DebugPanel from './components/DebugPanel'
import ChairZoneMenu from './components/ChairZoneMenu'
import HelperButtonGroup from './components/HelperButtonGroup'
import MobileVirtualJoystick from './components/MobileVirtualJoystick'

const Backdrop = styled.div`
  position: absolute;
  height: 100%;
  width: 100%;
  pointer-events: none;

  > * {
    pointer-events: auto;
  }
`

function App() {
  const loggedIn = useAppSelector((state) => state.user.loggedIn)
  const roomJoined = useAppSelector((state) => state.room.roomJoined)

  let ui: JSX.Element
  if (loggedIn) {
    // 正常状态：事件流面板 + 虚拟摇杆（移动端）
    ui = (
      <>
        <AgentFeed />
        <MobileVirtualJoystick />
      </>
    )
  } else if (roomJoined) {
    ui = <LoginDialog />
  } else {
    ui = <RoomSelectionDialog />
  }

  return (
    <Backdrop>
      {ui}
      <HelperButtonGroup />
      {/* 调试面板：仅在已进入房间时显示（右下角浮层 + 触发按钮） */}
      {loggedIn && <DebugPanel />}
      {/* 椅子 zone 标记菜单：点击椅子时弹出（仅已进入房间时） */}
      {loggedIn && <ChairZoneMenu />}
    </Backdrop>
  )
}

export default App
