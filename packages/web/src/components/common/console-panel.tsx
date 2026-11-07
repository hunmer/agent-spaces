'use client';

import { useEffect, useState } from 'react';
import { useCommandPalette } from '@/stores/command-palette';
import { Terminal } from 'lucide-react';
import { FloatingBall } from './floating-ball';

function readShowConsoleBall(): boolean {
  if (typeof window === 'undefined') return false;
  const saved = localStorage.getItem('showConsoleBall');
  return saved === null ? false : saved !== 'false';
}

export function ConsolePanel() {
  const toggle = useCommandPalette((s) => s.toggle);
  const open = useCommandPalette((s) => s.open);
  const [show, setShow] = useState(readShowConsoleBall);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setShow(typeof detail === 'boolean' ? detail : readShowConsoleBall());
    };
    window.addEventListener('console-ball-visibility', handler);
    return () => window.removeEventListener('console-ball-visibility', handler);
  }, []);

  if (!show) return null;

  return (
    <FloatingBall
      lsKey="console-panel:pos"
      onClick={toggle}
      visible={!open}
    >
      <Terminal size={18} />
    </FloatingBall>
  );
}
