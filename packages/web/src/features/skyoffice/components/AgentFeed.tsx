'use client'

import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { X, Users } from 'lucide-react'
import { getColorByString } from '../util'
import { useChatStore, MessageType, type ChatMessageEntry } from '../stores/chat-store'

const dateFormatter = new Intl.DateTimeFormat('en', { timeStyle: 'short', dateStyle: 'short' })

function EventItem({ entry }: { entry: ChatMessageEntry }) {
  const { chatMessage: m, messageType } = entry
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div className="flex flex-wrap px-0.5 hover:bg-[#3a3a3a]">
            {messageType === MessageType.REGULAR_MESSAGE ? (
              <p
                className="m-[3px] text-[15px] font-bold leading-[1.4] [overflow-wrap:anywhere] [text-shadow:0.3px_0.3px_black]"
                style={{ color: getColorByString(m.author) }}
              >
                {m.author}: <span className="font-normal text-white">{m.content}</span>
              </p>
            ) : messageType === MessageType.AGENT_EVENT ? (
              <p className="m-[3px] text-[15px] font-normal leading-[1.4] text-[#ffd479] [overflow-wrap:anywhere] [text-shadow:0.3px_0.3px_black]">
                🤖 {m.author} {m.content}
              </p>
            ) : (
              <p className="m-[3px] text-[15px] font-normal leading-[1.4] text-gray-400 [overflow-wrap:anywhere] [text-shadow:0.3px_0.3px_black]">
                {m.author} {m.content}
              </p>
            )}
          </div>
        }
      />
      <TooltipContent side="right">{dateFormatter.format(m.createdAt)}</TooltipContent>
    </Tooltip>
  )
}

export default function AgentFeed() {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatMessages = useChatStore((s) => s.chatMessages)
  const showChat = useChatStore((s) => s.showChat)
  const setShowChat = useChatStore((s) => s.setShowChat)
  const setFocused = useChatStore((s) => s.setFocused)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, showChat])

  return (
    <div className="absolute bottom-[60px] left-0 h-[400px] w-[500px] max-h-1/2 max-w-full">
      <div className="relative flex h-full flex-col p-4">
        {showChat ? (
          <>
            <div className="relative h-[35px] rounded-t-[10px] bg-[#000000a7]">
              <h3 className="text-center text-[17px] text-white" style={{ margin: 7 }}>
                Agent Activity
              </h3>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="close feed"
                className="absolute right-0 top-0 text-white hover:bg-white/10"
                onClick={() => setShowChat(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <ScrollArea className="h-full w-full rounded-b-lg border border-[#00000029] bg-[#2c2c2c]">
              {chatMessages.length === 0 ? (
                <p className="p-4 text-sm text-[#888]">
                  Waiting for agent events... Trigger agents via HTTP API or WS to see activity here.
                </p>
              ) : (
                chatMessages.map((entry, index) => <EventItem key={index} entry={entry} />)
              )}
              <div ref={messagesEndRef} />
            </ScrollArea>
          </>
        ) : (
          <div className="absolute top-4 right-[154px]">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="secondary"
                    size="icon"
                    className="rounded-full"
                    aria-label="show feed"
                    onClick={() => {
                      setShowChat(true)
                      setFocused(true)
                    }}
                  >
                    <Users className="size-5" />
                  </Button>
                }
              />
              <TooltipContent>Show Agent Activity</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  )
}
