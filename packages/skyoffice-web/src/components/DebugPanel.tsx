import React, { useState, useMemo } from 'react'
import styled from 'styled-components'
import Fab from '@mui/material/Fab'
import Tooltip from '@mui/material/Tooltip'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CloseIcon from '@mui/icons-material/Close'
import BugReportIcon from '@mui/icons-material/BugReport'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import PersonIcon from '@mui/icons-material/Person'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'

import { useAppSelector } from '../hooks'
import { AgentActivity } from '../../../types/IAgent'
import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'

/**
 * DebugPanel —— 右下角调试工具。
 *
 * 功能：
 *   - 显示房间 ID（可复制）
 *   - 列出所有成员：外部 Agent + 人类玩家
 *   - 每个 Agent 下方有 4 个按钮（idle / working / meeting / relaxing）
 *     点击即切换，通过 Colyseus room.send (DELEGATE_AGENT_ACTIVITY) 发送
 *
 * 用按钮组代替下拉菜单，避免 popover 定位问题，且调试时切换更直观。
 */
const ACTIVITIES: AgentActivity[] = ['idle', 'working', 'meeting', 'relaxing']

const ACTIVITY_COLOR: Record<AgentActivity, string> = {
  idle: '#9e9e9e',
  working: '#4caf50',
  meeting: '#2196f3',
  relaxing: '#ff9800',
}

/** 预设测试消息（一键发送，让 agent 说话） */
const PRESET_MESSAGES = [
  'Hello!',
  'I am working on it.',
  'Need help here!',
  'Done.',
  'Let us meet.',
]

const Panel = styled.div`
  position: fixed;
  bottom: 70px;
  right: 16px;
  width: 420px;
  max-width: calc(100vw - 32px);
  max-height: 70vh;
  background: #222639;
  border-radius: 12px;
  box-shadow: 0px 8px 24px #0000008f;
  color: #eee;
  display: flex;
  flex-direction: column;
  z-index: 9999;
  font-size: 13px;
`

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #00000033;

  h3 {
    margin: 0;
    font-size: 15px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
`

const RoomInfo = styled.div`
  padding: 10px 16px;
  border-bottom: 1px solid #00000033;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;

  .label {
    color: #9e9e9e;
  }
  .value {
    font-family: 'Consolas', 'Monaco', monospace;
    color: #ffd479;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`

const ListWrap = styled.div`
  overflow-y: auto;
  flex: 1;
  padding: 8px 0;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: #00000055;
    border-radius: 3px;
  }
`

const SectionTitle = styled.div`
  padding: 8px 16px 4px;
  font-size: 11px;
  color: #9e9e9e;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`

const Row = styled.div`
  padding: 8px 16px;
  border-bottom: 1px solid #0000001a;

  &:hover {
    background: #ffffff08;
  }
`

const RowTop = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .coords {
    color: #9e9e9e;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 11px;
    flex-shrink: 0;
  }
`

const Avatar = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #00000044;
  flex-shrink: 0;
`

const ButtonGroup = styled.div`
  display: flex;
  gap: 4px;
  margin-top: 6px;
  flex-wrap: wrap;
`

const ActButton = styled.button<{ active: boolean; color: string }>`
  padding: 3px 8px;
  font-size: 11px;
  border-radius: 4px;
  border: 1px solid ${(p) => p.color}66;
  background: ${(p) => (p.active ? p.color + '44' : 'transparent')};
  color: ${(p) => (p.active ? p.color : '#bbb')};
  cursor: pointer;
  font-weight: ${(p) => (p.active ? 'bold' : 'normal')};
  transition: all 0.15s;

  &:hover {
    background: ${(p) => p.color}33;
    color: ${(p) => p.color};
  }
`

/** 预设消息按钮（比 activity 按钮更小、更淡） */
const TalkButton = styled.button`
  padding: 2px 6px;
  font-size: 10px;
  border-radius: 3px;
  border: 1px solid #ffd47944;
  background: transparent;
  color: #ffd479aa;
  cursor: pointer;
  transition: all 0.15s;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover {
    background: #ffd47922;
    color: #ffd479;
    border-color: #ffd479;
  }
`

const TalkLabel = styled.span`
  font-size: 10px;
  color: #666;
  margin-top: 4px;
  margin-bottom: 2px;
`

const Empty = styled.div`
  padding: 24px 16px;
  text-align: center;
  color: #9e9e9e;
  font-size: 12px;
`

const FabWrap = styled.div`
  position: fixed;
  bottom: 16px;
  /* 避开右下角的 HelperButtonGroup（它占 ~250px 宽），放在它左侧 */
  right: 280px;
  z-index: 9998;

  @media (max-width: 650px) {
    right: 16px;
    bottom: 80px;
  }
`

export default function DebugPanel() {
  const [open, setOpen] = useState(false)
  const agents = useAppSelector((state) => state.agentDebug?.agents || {})
  const humans = useAppSelector((state) => state.agentDebug?.humans || {})
  const roomId = useAppSelector((state) => state.room.roomId)

  const game = phaserGame.scene.keys.game as Game

  const agentList = useMemo(() => Object.values(agents), [agents])
  const humanList = useMemo(() => Object.values(humans), [humans])

  const handleActivityChange = (agentId: string, activity: AgentActivity) => {
    game.network.delegateAgentActivity(agentId, activity)
  }

  const handleTalk = (agentId: string, text: string) => {
    game.network.delegateAgentTalk(agentId, text)
  }

  const copyRoomId = () => {
    if (roomId) {
      navigator.clipboard?.writeText(roomId).catch(() => {})
    }
  }

  return (
    <>
      {open && (
        <Panel>
          <PanelHeader>
            <h3>
              <BugReportIcon fontSize="small" /> Debug Panel
            </h3>
            <IconButton size="small" onClick={() => setOpen(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </PanelHeader>

          <RoomInfo>
            <span className="label">Room:</span>
            <span className="value" title={roomId}>
              {roomId || '(public)'}
            </span>
            {roomId && (
              <Tooltip title="Copy roomId">
                <IconButton size="small" onClick={copyRoomId}>
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </RoomInfo>

          <ListWrap>
            <SectionTitle>Agents ({agentList.length}) · external</SectionTitle>
            {agentList.length === 0 ? (
              <Empty>No agents yet. Spawn one via HTTP API or WS.</Empty>
            ) : (
              agentList.map((a) => (
                <Row key={a.id}>
                  <RowTop>
                    <Avatar>
                      <SmartToyIcon fontSize="small" />
                    </Avatar>
                    <div className="name" title={a.id}>
                      {a.name || '(unnamed)'}
                    </div>
                    {typeof a.x === 'number' && typeof a.y === 'number' && (
                      <span className="coords">
                        ({Math.round(a.x)},{Math.round(a.y)})
                      </span>
                    )}
                  </RowTop>
                  <ButtonGroup>
                    {ACTIVITIES.map((act) => (
                      <ActButton
                        key={act}
                        active={a.activity === act}
                        color={ACTIVITY_COLOR[act]}
                        onClick={() => handleActivityChange(a.id, act)}
                      >
                        {act}
                      </ActButton>
                    ))}
                  </ButtonGroup>
                  <TalkLabel>Test messages:</TalkLabel>
                  <ButtonGroup>
                    {PRESET_MESSAGES.map((msg) => (
                      <Tooltip key={msg} title={`Send "${msg}"`}>
                        <TalkButton onClick={() => handleTalk(a.id, msg)}>
                          {msg}
                        </TalkButton>
                      </Tooltip>
                    ))}
                  </ButtonGroup>
                </Row>
              ))
            )}

            <SectionTitle>Humans ({humanList.length}) · viewers</SectionTitle>
            {humanList.length === 0 ? (
              <Empty>No human viewers.</Empty>
            ) : (
              humanList.map((h) => (
                <Row key={h.id}>
                  <RowTop>
                    <Avatar>
                      <PersonIcon fontSize="small" />
                    </Avatar>
                    <div className="name" title={h.id}>
                      {h.name || '(unnamed)'}
                    </div>
                  </RowTop>
                </Row>
              ))
            )}
          </ListWrap>

          <Box
            style={{
              padding: '8px 16px',
              fontSize: 11,
              color: '#9e9e9e',
              borderTop: '1px solid #00000033',
            }}
          >
            Click a button to switch activity (no token needed).
          </Box>
        </Panel>
      )}

      <FabWrap>
        <Tooltip title={open ? 'Hide debug panel' : 'Show debug panel'}>
          <Fab
            size="small"
            color={open ? 'default' : 'secondary'}
            onClick={() => setOpen(!open)}
            style={open ? { background: '#444' } : {}}
          >
            <BugReportIcon />
          </Fab>
        </Tooltip>
      </FabWrap>
    </>
  )
}
