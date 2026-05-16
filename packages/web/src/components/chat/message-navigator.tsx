'use client';

import { useState, useCallback, useRef } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { Message } from '@agent-spaces/shared';
import { findAgentById } from '@/stores/agent';

interface MessageNavigatorProps {
  messages: Message[];
}

function getPreviewText(msg: Message, maxLen: number): string {
  const textPart = msg.parts?.find(p => p.type === 'text');
  const raw = textPart ? textPart.text : msg.content;
  const plain = /<[a-z][\s\S]*>/i.test(raw) ? raw.replace(/<[^>]*>/g, '') : raw;
  return plain.length > maxLen ? plain.slice(0, maxLen) + '...' : plain;
}

export function MessageNavigator({ messages }: MessageNavigatorProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const [popoverY, setPopoverY] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollTo = useCallback((index: number) => {
    setActiveIndex(index);
    const el = document.getElementById(`msg-${messages[index].id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [messages]);

  const handleBarHover = useCallback((index: number, barEl: HTMLButtonElement | null) => {
    if (!barEl || !containerRef.current) return;
    setActiveIndex(index);
    const containerRect = containerRef.current.getBoundingClientRect();
    const barRect = barEl.getBoundingClientRect();
    setPopoverY(barRect.top - containerRect.top + barRect.height / 2);
  }, []);

  if (messages.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex flex-col items-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setActiveIndex(null); }}
    >
      <button
        className={`flex-shrink-0 mb-0.5 flex items-center justify-center size-5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all ${
          hovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
        } ${activeIndex === null || activeIndex <= 0 ? 'invisible' : ''}`}
        onClick={() => { if (activeIndex !== null && activeIndex > 0) scrollTo(activeIndex - 1); }}
      >
        <ChevronUp className="size-3.5" />
      </button>

      <div className="flex-1 w-full max-h-[70vh] overflow-y-auto scrollbar-none">
        <div className="flex flex-col gap-[3px] px-1 py-0.5">
          {messages.map((msg, i) => (
            <div key={msg.id} className="flex justify-center">
              <button
                className={`h-[4px] rounded-full transition-all duration-150 ${
                  activeIndex === i
                    ? 'bg-primary w-6'
                    : msg.senderId === 'user'
                      ? 'bg-primary/30 hover:bg-primary/50 w-5'
                      : 'bg-muted-foreground/25 hover:bg-muted-foreground/40 w-5'
                }`}
                onClick={() => scrollTo(i)}
                onMouseEnter={(e) => handleBarHover(i, e.currentTarget)}
              />
            </div>
          ))}
        </div>
      </div>

      <button
        className={`flex-shrink-0 mt-0.5 flex items-center justify-center size-5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all ${
          hovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
        } ${activeIndex === null || activeIndex >= messages.length - 1 ? 'invisible' : ''}`}
        onClick={() => { if (activeIndex !== null && activeIndex < messages.length - 1) scrollTo(activeIndex + 1); }}
      >
        <ChevronDown className="size-3.5" />
      </button>

      {hovered && activeIndex !== null && (
        <div
          className="absolute right-full mr-3 w-56 rounded-lg border bg-popover p-2.5 shadow-lg z-50 animate-in fade-in-0 zoom-in-95 duration-75"
          style={{ top: popoverY, transform: 'translateY(-50%)' }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span className="font-medium text-xs">{messages[activeIndex].senderId === 'user' ? 'You' : (findAgentById(messages[activeIndex].senderId)?.name ?? messages[activeIndex].senderId)}</span>
            <span className="text-[10px] text-muted-foreground">
              {new Date(messages[activeIndex].createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
            {getPreviewText(messages[activeIndex], 150)}
          </p>
        </div>
      )}
    </div>
  );
}
