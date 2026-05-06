'use client';

import { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { IssueComment } from '@agent-spaces/shared';
import { findAgentById } from '@/stores/agent';

interface CommentNavigatorProps {
  comments: IssueComment[];
  onNavigate: (index: number) => void;
}

export function CommentNavigator({ comments, onNavigate }: CommentNavigatorProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const [popoverY, setPopoverY] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const tc = useTranslations('common');

  const scrollTo = useCallback((index: number) => {
    setActiveIndex(index);
    onNavigate(index);
  }, [onNavigate]);

  const handleBarHover = useCallback((index: number, barEl: HTMLButtonElement | null) => {
    if (!barEl || !containerRef.current) return;
    setActiveIndex(index);
    const containerRect = containerRef.current.getBoundingClientRect();
    const barRect = barEl.getBoundingClientRect();
    setPopoverY(barRect.top - containerRect.top + barRect.height / 2);
  }, []);

  if (comments.length === 0) return null;

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

      <div className="flex-1 w-full max-h-[50vh] overflow-y-auto scrollbar-none">
        <div className="flex flex-col gap-[3px] px-1 py-0.5">
          {comments.map((c, i) => (
            <div key={c.id} className="flex justify-center">
              <button
                className={`h-[4px] rounded-full transition-all duration-150 ${
                  activeIndex === i
                    ? 'bg-primary w-6'
                    : c.senderId === 'user'
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
        } ${activeIndex === null || activeIndex >= comments.length - 1 ? 'invisible' : ''}`}
        onClick={() => { if (activeIndex !== null && activeIndex < comments.length - 1) scrollTo(activeIndex + 1); }}
      >
        <ChevronDown className="size-3.5" />
      </button>

      {hovered && activeIndex !== null && (
        <div
          className="absolute right-full mr-3 w-56 rounded-lg border bg-popover p-2.5 shadow-lg z-50 animate-in fade-in-0 zoom-in-95 duration-75"
          style={{ top: popoverY, transform: 'translateY(-50%)' }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span className="font-medium text-xs">{comments[activeIndex].senderId === 'user' ? tc('you') : (findAgentById(comments[activeIndex].senderId)?.name ?? comments[activeIndex].senderId)}</span>
            <span className="text-[10px] text-muted-foreground">
              {new Date(comments[activeIndex].createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
            {comments[activeIndex].content.slice(0, 150)}{comments[activeIndex].content.length > 150 ? '...' : ''}
          </p>
        </div>
      )}
    </div>
  );
}
