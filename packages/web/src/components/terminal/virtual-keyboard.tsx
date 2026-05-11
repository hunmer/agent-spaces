'use client';

import { useState, useCallback } from 'react';
import { Keyboard } from 'lucide-react';

interface VirtualKeyboardProps {
  onKey: (data: string) => void;
}

type Modifier = 'ctrl' | 'alt' | 'shift';

const CTRL_MAP: Record<string, string> = {
  a: '\x01', b: '\x02', c: '\x03', d: '\x04', e: '\x05', f: '\x06', g: '\x07',
  h: '\x08', i: '\x09', j: '\x0a', k: '\x0b', l: '\x0c', m: '\x0d', n: '\x0e',
  o: '\x0f', p: '\x10', q: '\x11', r: '\x12', s: '\x13', t: '\x14', u: '\x15',
  v: '\x16', w: '\x17', x: '\x18', y: '\x19', z: '\x1a', '[': '\x1b', ']': '\x1d',
  '\\': '\x1c',
};

const ROWS = [
  ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", 'Enter'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', '⌫'],
];

export function VirtualKeyboard({ onKey }: VirtualKeyboardProps) {
  const [modifiers, setModifiers] = useState<Set<Modifier>>(new Set());

  const toggleMod = useCallback((mod: Modifier) => {
    setModifiers(prev => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod); else next.add(mod);
      return next;
    });
  }, []);

  const handleKey = useCallback((key: string) => {
    const ctrl = modifiers.has('ctrl');
    const alt = modifiers.has('alt');
    const shift = modifiers.has('shift');

    let data: string;

    if (key === 'Enter') {
      data = '\r';
    } else if (key === '⌫') {
      data = '\x7f';
    } else if (ctrl && CTRL_MAP[key]) {
      data = CTRL_MAP[key];
    } else {
      data = shift ? key.toUpperCase() : key;
    }

    if (alt) data = '\x1b' + data;

    onKey(data);
    setModifiers(new Set());
  }, [modifiers, onKey]);

  const keyClass = 'flex-1 h-10 min-w-0 flex items-center justify-center rounded text-sm font-mono bg-muted hover:bg-accent active:bg-accent/70 select-none cursor-pointer transition-colors';

  return (
    <div className="flex flex-col gap-1 p-2 max-w-[800px] w-[calc(100vw-16px)]">
      {/* Modifier row */}
      <div className="flex gap-0.5 mb-0.5">
        {(['ctrl', 'alt', 'shift'] as Modifier[]).map(mod => (
          <button
            key={mod}
            onClick={() => toggleMod(mod)}
            className={`flex-1 h-9 rounded text-xs font-semibold uppercase tracking-wide select-none cursor-pointer transition-colors ${
              modifiers.has(mod)
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-accent text-muted-foreground'
            }`}
          >
            {mod}
          </button>
        ))}
        {/* Special keys */}
        <button onClick={() => onKey('\t')} className={keyClass}>Tab</button>
        <button onClick={() => onKey('\x1b')} className={keyClass}>Esc</button>
        <button onClick={() => { onKey('\x1b[A'); }} className={keyClass}>↑</button>
        <button onClick={() => { onKey('\x1b[B'); }} className={keyClass}>↓</button>
        <button onClick={() => { onKey('\x1b[D'); }} className={keyClass}>←</button>
        <button onClick={() => { onKey('\x1b[C'); }} className={keyClass}>→</button>
      </div>

      {/* Keyboard rows */}
      {ROWS.map((row, i) => (
        <div key={i} className="flex gap-0.5">
          {row.map((key, j) => {
            const isEnter = key === 'Enter';
            const isWide = key === '⌫';
            return (
              <button
                key={`${i}-${j}`}
                onClick={() => handleKey(key)}
                className={`${keyClass} ${isEnter ? 'flex-[1.5]' : ''} ${isWide ? 'flex-[1.2]' : ''} ${
                  modifiers.has('ctrl') && CTRL_MAP[key] ? 'text-primary font-bold' : ''
                }`}
              >
                {key}
              </button>
            );
          })}
        </div>
      ))}

      {/* Space bar */}
      <div className="flex gap-0.5">
        <button onClick={() => handleKey(' ')} className={`${keyClass} flex-[5]`}>Space</button>
      </div>
    </div>
  );
}
