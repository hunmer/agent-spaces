'use client';

import { PanelsTopLeft } from 'lucide-react';
import { type DisplayNodeViewProps, EmptyDisplay, readString } from './utils';

export function MiniAppDisplayView({ data }: DisplayNodeViewProps) {
  const miniAppId = readString(data.miniAppId);
  const route = readString(data.route) || '/';

  if (!miniAppId) {
    return <EmptyDisplay icon={<PanelsTopLeft className="h-5 w-5" />} text="No miniapp selected" />;
  }

  return (
    <div className="nodrag nopan flex h-full w-full flex-col rounded-lg border border-border/60 bg-background">
      <div className="border-b border-border/60 px-3 py-2">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Mini App</div>
        <div className="mt-1 truncate text-sm font-medium text-foreground">{miniAppId}</div>
      </div>
      <div className="flex flex-1 flex-col justify-between px-3 py-2 text-xs text-muted-foreground">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-[0.18em]">Route</div>
          <div className="truncate rounded bg-muted/60 px-2 py-1 font-mono text-[11px] text-foreground">{route}</div>
        </div>
        <div className="mt-3 text-[11px]">Runs in an interactive dialog and waits for submit before continuing.</div>
      </div>
    </div>
  );
}
