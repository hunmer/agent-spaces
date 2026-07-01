'use client';

import { useMemo } from 'react';
import { PanelsTopLeft } from 'lucide-react';
import { type DisplayNodeViewProps, EmptyDisplay, parseJsonRecord, readString } from './utils';

function buildMiniAppPreviewUrl(
  miniAppId: string,
  route: string,
  params: Record<string, unknown>,
): string {
  const search = new URLSearchParams({
    id: miniAppId,
    embedded: '1',
  });
  if (route) search.set('route', route);
  if (Object.keys(params).length > 0) {
    search.set('payload', JSON.stringify(params));
  }
  return `/mini-apps-preview?${search.toString()}`;
}

export function MiniAppDisplayView({ data }: DisplayNodeViewProps) {
  const miniAppId = readString(data.miniAppId);
  const route = readString(data.route) || '/';
  const embedDisplay = data.embedDisplay === true;
  const params = parseJsonRecord(data.params);
  const previewUrl = useMemo(
    () => (miniAppId ? buildMiniAppPreviewUrl(miniAppId, route, params) : ''),
    [miniAppId, route, params],
  );

  if (!miniAppId) {
    return <EmptyDisplay icon={<PanelsTopLeft className="h-5 w-5" />} text="No miniapp selected" />;
  }

  if (embedDisplay) {
    return (
      <div className="nodrag nopan h-full w-full overflow-hidden rounded-lg border border-border/60 bg-background">
        <iframe
          key={previewUrl}
          title={miniAppId}
          src={previewUrl}
          className="h-full w-full border-0 bg-background"
        />
      </div>
    );
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
        <div className="mt-3 text-[11px]">Enable inline display to embed the miniapp here. Execution dialog remains unchanged.</div>
      </div>
    </div>
  );
}
