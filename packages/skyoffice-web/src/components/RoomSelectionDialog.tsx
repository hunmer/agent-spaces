import React, { useState } from 'react'
import logo from '../images/logo.png'
import styled from 'styled-components'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import LinearProgress from '@mui/material/LinearProgress'
import FormHelperText from '@mui/material/FormHelperText'

import { useAppSelector } from '../hooks'

import phaserGame from '../PhaserGame'
import Bootstrap from '../scenes/Bootstrap'

/**
 * RoomSelectionDialog —— 简化版入口。
 *
 * 流程：
 *   1. "Join Public Lobby"：进入公共大厅（agent teams 演示默认场景）
 *   2. "Join Custom Room"：输入由 HTTP API 创建房间得到的 roomId，加入观察
 *
 * 已移除（相对原版）：
 *   - 自定义房间创建表单（CreateRoomForm）
 *   - 实时房间列表（CustomRoomTable）
 *   - LobbyRoom 列表订阅
 *
 * 房间由 Agent 通过 HTTP API 创建，前端只负责"加入观察"。
 */
const Backdrop = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  gap: 60px;
  align-items: center;
`

const Wrapper = styled.div`
  background: #222639;
  border-radius: 16px;
  padding: 36px 60px;
  box-shadow: 0px 0px 5px #0000006f;
`

const CustomRoomWrapper = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 20px;
  align-items: center;
  justify-content: center;
`

const Title = styled.h1`
  font-size: 24px;
  color: #eee;
  text-align: center;
`

const SubTitle = styled.h2`
  font-size: 18px;
  color: #c2c2c2;
  text-align: center;
  margin: 0;
`

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin: 20px 0;
  align-items: center;
  justify-content: center;

  img {
    border-radius: 8px;
    height: 120px;
  }
`

const JoinForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  width: 360px;
`

const ProgressBarWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;

  h3 {
    color: #33ac96;
  }
`

const ProgressBar = styled(LinearProgress)`
  width: 360px;
`

export default function RoomSelectionDialog() {
  const [showJoinForm, setShowJoinForm] = useState(false)
  const [roomId, setRoomId] = useState('')
  const [joining, setJoining] = useState(false)
  const [showSnackbar, setShowSnackbar] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const lobbyJoined = useAppSelector((state) => state.room.lobbyJoined)

  const handleConnectPublic = () => {
    const bootstrap = phaserGame.scene.keys.bootstrap as Bootstrap
    setJoining(true)
    bootstrap.network
      .joinOrCreatePublic()
      .then(() => bootstrap.launchGame())
      .catch((error) => {
        console.error(error)
        setErrorMsg(String(error?.message || error))
        setShowSnackbar(true)
        setJoining(false)
      })
  }

  const handleJoinCustom = () => {
    if (!roomId.trim()) return
    const bootstrap = phaserGame.scene.keys.bootstrap as Bootstrap
    setJoining(true)
    bootstrap.network
      .joinCustomById(roomId.trim())
      .then(() => bootstrap.launchGame())
      .catch((error) => {
        console.error(error)
        // 兼容 Error / string / fetch 异常等多种形态
        const msg =
          (error && (error.message as string)) ||
          (typeof error === 'string' ? error : '') ||
          'Failed to join room'
        setErrorMsg(msg)
        setShowSnackbar(true)
        setJoining(false)
      })
  }

  return (
    <>
      <Snackbar
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        open={showSnackbar}
        autoHideDuration={3000}
        onClose={() => setShowSnackbar(false)}
      >
        <Alert severity="error" variant="outlined" style={{ background: '#fdeded', color: '#7d4747' }}>
          {errorMsg || 'Failed to connect, please try again!'}
        </Alert>
      </Snackbar>
      <Backdrop>
        <Wrapper>
          {showJoinForm ? (
            <CustomRoomWrapper>
              <Title>Join Custom Room</Title>
              <SubTitle>Enter the roomId returned by the HTTP API</SubTitle>
              <JoinForm>
                <TextField
                  autoFocus
                  fullWidth
                  label="Room ID"
                  variant="outlined"
                  color="secondary"
                  value={roomId}
                  onInput={(e) => setRoomId((e.target as HTMLInputElement).value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleJoinCustom()
                  }}
                />
                <FormHelperText style={{ color: '#888' }}>
                  Create a room first: POST /api/rooms
                </FormHelperText>
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={handleJoinCustom}
                  disabled={joining || !roomId.trim()}
                >
                  Join
                </Button>
                <Button
                  variant="text"
                  color="secondary"
                  onClick={() => setShowJoinForm(false)}
                  disabled={joining}
                >
                  Back
                </Button>
              </JoinForm>
            </CustomRoomWrapper>
          ) : (
            <>
              <Title>Welcome to Agent Teams</Title>
              <Content>
                <img src={logo} alt="logo" />
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={handleConnectPublic}
                  disabled={joining}
                >
                  Join Public Lobby
                </Button>
                <Button
                  variant="outlined"
                  color="secondary"
                  onClick={() => setShowJoinForm(true)}
                  disabled={joining}
                >
                  Join Custom Room
                </Button>
              </Content>
            </>
          )}
        </Wrapper>
        {!lobbyJoined && (
          <ProgressBarWrapper>
            <h3>{joining ? 'Joining...' : 'Connecting to server...'}</h3>
            <ProgressBar color="secondary" />
          </ProgressBarWrapper>
        )}
      </Backdrop>
    </>
  )
}
