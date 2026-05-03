'use client';

import { useState, useCallback } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { Message } from '@agent-spaces/shared';

interface MessageNavigatorProps {
  messages: Message[];
}

function getPlainText(html: string, maxLen: number): string {
  const plain = /<[a-z][\s\S]*>/i.test(html) ? html.replace(/<[^>]*>/g, '') : html;
  return plain.length > maxLen ? plain.slice(0, maxLen) + '...' : plain;
}

export function MessageNavigator({ messages }: MessageNavigatorProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hovered, setHovered] = useState(false);

  const scrollTo = useCallback((index: number) => {
    setActiveIndex(index);
    const el = document.getElementById(`msg-${messages[index].id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [messages]);

  if (messages.length === 0) return null;

  return (
    <div
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
            <div key={msg.id} className="relative flex justify-center">
              <button
                className={`h-[4px] rounded-full transition-all duration-150 ${
                  activeIndex === i
                    ? 'bg-primary w-6'
                    : msg.senderId === 'user'
                      ? 'bg-primary/30 hover:bg-primary/50 w-5'
                      : 'bg-muted-foreground/25 hover:bg-muted-foreground/40 w-5'
                }`}
                onClick={() => scrollTo(i)}
                onMouseEnter={() => setActiveIndex(i)}
              />
              {hovered && activeIndex === i && (
                <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 w-56 rounded-lg border bg-popover p-2.5 shadow-lg z-50 animate-in fade-in-0 zoom-in-95 duration-75">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="font-medium text-xs">{msg.senderId === 'user' ? 'You' : msg.senderId}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                    {getPlainText(msg.content, 150)}
                  </p>
                </div>
              )}
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
    </div>
  );
}
