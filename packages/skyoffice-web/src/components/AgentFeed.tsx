import React, { useRef, useState, useEffect } from 'react'
import styled from 'styled-components'
import Fab from '@mui/material/Fab'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import CloseIcon from '@mui/icons-material/Close'
import GroupsIcon from '@mui/icons-material/Groups'

import { getColorByString } from '../util'
import { useAppDispatch, useAppSelector } from '../hooks'
import { MessageType, setFocused, setShowChat, clearMessages } from '../stores/ChatStore'

/**
 * AgentFeed —— 显示 Agent / 玩家的事件流面板。
 *
 * 取代原 Chat.tsx 的位置（左下角），内容来源：
 *   - state.chatMessages（服务端 push）
 *   - 包括 AGENT_EVENT / PLAYER_JOINED / PLAYER_LEFT / REGULAR_MESSAGE
 *
 * 这是只读的观察面板，没有输入框（agent 行为通过 WS API 触发，不通过 UI）。
 */
const Backdrop = styled.div`
  position: fixed;
  bottom: 60px;
  left: 0;
  height: 400px;
  width: 500px;
  max-height: 50%;
  max-width: 100%;
`

const Wrapper = styled.div`
  position: relative;
  height: 100%;
  padding: 16px;
  display: flex;
  flex-direction: column;
`

const FabWrapper = styled.div`
  margin-top: auto;
`

const FeedHeader = styled.div`
  position: relative;
  height: 35px;
  background: #000000a7;
  border-radius: 10px 10px 0px 0px;

  h3 {
    color: #fff;
    margin: 7px;
    font-size: 17px;
    text-align: center;
  }

  .close {
    position: absolute;
    top: 0;
    right: 0;
  }
`

const FeedBox = styled.div`
  height: 100%;
  width: 100%;
  overflow: auto;
  background: #2c2c2c;
  border: 1px solid #00000029;
`

const EventWrapper = styled.div`
  display: flex;
  flex-wrap: wrap;
  padding: 0px 2px;

  p {
    margin: 3px;
    text-shadow: 0.3px 0.3px black;
    font-size: 15px;
    font-weight: bold;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  span {
    color: white;
    font-weight: normal;
  }

  .notification {
    color: grey;
    font-weight: normal;
  }

  .agent-event {
    color: #ffd479;
    font-weight: normal;
  }

  :hover {
    background: #3a3a3a;
  }
`

const dateFormatter = new Intl.DateTimeFormat('en', {
  timeStyle: 'short',
  dateStyle: 'short',
})

const EventItem = ({ chatMessage, messageType }) => {
  const [tooltipOpen, setTooltipOpen] = useState(false)

  return (
    <EventWrapper
      onMouseEnter={() => setTooltipOpen(true)}
      onMouseLeave={() => setTooltipOpen(false)}
    >
      <Tooltip
        open={tooltipOpen}
        title={dateFormatter.format(chatMessage.createdAt)}
        placement="right"
        arrow
      >
        {messageType === MessageType.REGULAR_MESSAGE ? (
          <p style={{ color: getColorByString(chatMessage.author) }}>
            {chatMessage.author}: <span>{chatMessage.content}</span>
          </p>
        ) : messageType === MessageType.AGENT_EVENT ? (
          <p className="agent-event">
            🤖 {chatMessage.author} {chatMessage.content}
          </p>
        ) : (
          <p className="notification">
            {chatMessage.author} {chatMessage.content}
          </p>
        )}
      </Tooltip>
    </EventWrapper>
  )
}

export default function AgentFeed() {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatMessages = useAppSelector((state) => state.chat.chatMessages)
  const showChat = useAppSelector((state) => state.chat.showChat)
  const dispatch = useAppDispatch()

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [chatMessages, showChat])

  return (
    <Backdrop>
      <Wrapper>
        {showChat ? (
          <>
            <FeedHeader>
              <h3>Agent Activity</h3>
              <IconButton
                aria-label="close feed"
                className="close"
                onClick={() => dispatch(setShowChat(false))}
                size="small"
              >
                <CloseIcon />
              </IconButton>
            </FeedHeader>
            <FeedBox>
              {chatMessages.length === 0 ? (
                <p style={{ color: '#888', padding: 16, fontSize: 14 }}>
                  Waiting for agent events... Trigger agents via HTTP API or WS to see activity here.
                </p>
              ) : (
                chatMessages.map(({ messageType, chatMessage }, index) => (
                  <EventItem
                    chatMessage={chatMessage}
                    messageType={messageType}
                    key={index}
                  />
                ))
              )}
              <div ref={messagesEndRef} />
            </FeedBox>
          </>
        ) : (
          <FabWrapper>
            <Tooltip title="Show Agent Activity">
              <Fab
                color="secondary"
                aria-label="showFeed"
                onClick={() => {
                  dispatch(setShowChat(true))
                  dispatch(setFocused(true))
                }}
              >
                <GroupsIcon />
              </Fab>
            </Tooltip>
          </FabWrapper>
        )}
      </Wrapper>
    </Backdrop>
  )
}
