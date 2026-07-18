'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Bug, Bot, User, Copy, X } from 'lucide-react'
import { type AgentActivity } from '@agent-spaces/shared/skyoffice'
import { getPhaserGame } from '../phaser-ref'
import type Game from '../scenes/Game'
import { useAgentDebugStore } from '../stores/agent-debug-store'
import { useRoomStore } from '../stores/room-store'

const ACTIVITIES: AgentActivity[] = ['idle', 'working', 'meeting', 'relaxing']
const ACTIVITY_COLOR: Record<AgentActivity, string> = {
  idle: '#9e9e9e',
  working: '#4caf50',
  meeting: '#2196f3',
  relaxing: '#ff9800',
}
const PRESET_MESSAGES = ['Hello!', 'I am working on it.', 'Need help here!', 'Done.', 'Let us meet.']

function ActButton({ active, color, onClick, children }: { active: boolean; color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="cursor-pointer rounded px-2 py-[3px] text-[11px] transition-all"
      style={{
        border: `1px solid ${color}66`,
        background: active ? `${color}44` : 'transparent',
        color: active ? color : '#bbb',
        fontWeight: active ? 'bold' : 'normal',
      }}
    >
      {children}
    </button>
  )
}

export default function DebugPanel() {
  const [open, setOpen] = useState(false)
  const agents = useAgentDebugStore((s) => s.agents)
  const humans = useAgentDebugStore((s) => s.humans)
  const roomId = useRoomStore((s) => s.roomId)

  const agentList = useMemo(() => Object.values(agents), [agents])
  const humanList = useMemo(() => Object.values(humans), [humans])

  const getGame = () => getPhaserGame()?.scene.keys.game as Game | undefined
  const handleActivityChange = (agentId: string, activity: AgentActivity) => {
    getGame()?.network.delegateAgentActivity(agentId, activity)
  }
  const handleTalk = (agentId: string, text: string) => {
    getGame()?.network.delegateAgentTalk(agentId, text)
  }
  const copyRoomId = () => {
    if (roomId) navigator.clipboard?.writeText(roomId).catch(() => {})
  }

  return (
    <>
      {open && (
        <div className="absolute top-16 right-4 z-[9999] flex max-h-[calc(100vh-80px)] w-[420px] max-w-[calc(100vw-32px)] flex-col rounded-xl bg-[#222639] text-[13px] text-[#eee] shadow-[0_8px_24px_#0000008f]">
          <div className="flex items-center justify-between border-b border-[#00000033] px-4 py-3">
            <h3 className="m-0 flex items-center gap-1.5 text-[15px]"><Bug className="size-4" /> Debug Panel</h3>
            <Button variant="ghost" size="icon-sm" className="text-[#eee] hover:bg-white/10" onClick={() => setOpen(false)}>
              <X className="size-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2 border-b border-[#00000033] px-4 py-2.5 text-xs">
            <span className="text-[#9e9e9e]">Room:</span>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[#ffd479]" title={roomId}>
              {roomId || '(public)'}
            </span>
            {roomId && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button variant="ghost" size="icon-sm" className="text-[#eee] hover:bg-white/10" onClick={copyRoomId}>
                      <Copy className="size-3.5" />
                    </Button>
                  }
                />
                <TooltipContent>Copy roomId</TooltipContent>
              </Tooltip>
            )}
          </div>

          <ScrollArea className="flex-1 py-2">
            <div className="px-4 pb-1 pt-2 text-[11px] uppercase tracking-wide text-[#9e9e9e]">
              Agents ({agentList.length}) · external
            </div>
            {agentList.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-[#9e9e9e]">No agents yet. Spawn one via HTTP API or WS.</div>
            ) : (
              agentList.map((a) => (
                <div key={a.id} className="border-b border-[#0000001a] px-4 py-2 hover:bg-[#ffffff08]">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-[#00000044]">
                      <Bot className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap" title={a.id}>
                      {a.name || '(unnamed)'}
                    </div>
                    {typeof a.x === 'number' && typeof a.y === 'number' && (
                      <span className="shrink-0 font-mono text-[11px] text-[#9e9e9e]">({Math.round(a.x)},{Math.round(a.y)})</span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {ACTIVITIES.map((act) => (
                      <ActButton key={act} active={a.activity === act} color={ACTIVITY_COLOR[act]} onClick={() => handleActivityChange(a.id, act)}>
                        {act}
                      </ActButton>
                    ))}
                  </div>
                  <div className="mt-1 text-[10px] text-[#666]">Test messages:</div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {PRESET_MESSAGES.map((msg) => (
                      <Tooltip key={msg}>
                        <TooltipTrigger
                          render={
                            <button
                              onClick={() => handleTalk(a.id, msg)}
                              className="max-w-full cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap rounded border border-[#ffd47944] bg-transparent px-1.5 py-0.5 text-[10px] text-[#ffd479aa] transition-all hover:border-[#ffd479] hover:bg-[#ffd47922] hover:text-[#ffd479]"
                            >
                              {msg}
                            </button>
                          }
                        />
                        <TooltipContent>{`Send "${msg}"`}</TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              ))
            )}

            <div className="px-4 pb-1 pt-2 text-[11px] uppercase tracking-wide text-[#9e9e9e]">
              Humans ({humanList.length}) · viewers
            </div>
            {humanList.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-[#9e9e9e]">No human viewers.</div>
            ) : (
              humanList.map((h) => (
                <div key={h.id} className="border-b border-[#0000001a] px-4 py-2 hover:bg-[#ffffff08]">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-[#00000044]">
                      <User className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap" title={h.id}>
                      {h.name || '(unnamed)'}
                    </div>
                  </div>
                </div>
              ))
            )}
          </ScrollArea>

          <div className="border-t border-[#00000033] px-4 py-2 text-[11px] text-[#9e9e9e]">
            Click a button to switch activity (no token needed).
          </div>
        </div>
      )}

      <div className="absolute top-4 right-[110px] z-[9998]">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={open ? 'outline' : 'secondary'}
                size="icon"
                className="rounded-full"
                style={open ? { background: '#444' } : {}}
                onClick={() => setOpen(!open)}
              >
                <Bug className="size-4" />
              </Button>
            }
          />
          <TooltipContent>{open ? 'Hide debug panel' : 'Show debug panel'}</TooltipContent>
        </Tooltip>
      </div>
    </>
  )
}
