'use client';

import { usePathname } from 'next/navigation';
import { useCommandPalette } from '@/stores/command-palette';
import { Terminal } from 'lucide-react';
import { FloatingBall } from './floating-ball';
import { isMiniAppPreviewPath } from '@/lib/routes';

export function ConsolePanel() {
  const pathname = usePathname();
  const toggle = useCommandPalette((s) => s.toggle);
  const open = useCommandPalette((s) => s.open);

  if (isMiniAppPreviewPath(pathname)) return null;

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
