'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { PanelsTopLeft } from 'lucide-react';
import { type DisplayNodeViewProps, EmptyDisplay, parseJsonRecord, readString } from './utils';

const MINI_APP_RUNTIME_INIT_SOURCE = 'agent-spaces:mini-app-runtime:init';
const MINI_APP_ROUTE_INIT_SOURCE = 'agent-spaces:mini-app-router:init';

function buildMiniAppPreviewUrl(miniAppId: string): string {
  const search = new URLSearchParams({
    id: miniAppId,
    embedded: '1',
  });
  return `/mini-apps-preview?${search.toString()}`;
}

function postMiniAppRuntimeInit(
  iframe: HTMLIFrameElement | null,
  route: string,
  params: Record<string, unknown>,
) {
  const target = iframe?.contentWindow;
  if (!target) return;
  target.postMessage({ source: MINI_APP_RUNTIME_INIT_SOURCE, route, params }, '*');
  target.postMessage({ source: MINI_APP_ROUTE_INIT_SOURCE, route }, '*');
}

export function MiniAppDisplayView({ data, isRunning = false }: DisplayNodeViewProps) {
  const miniAppId = readString(data.miniAppId);
  const route = readString(data.route) || '/';
  const embedDisplay = data.embedDisplay === true;
  const params = parseJsonRecord(data.params);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewUrl = useMemo(() => (miniAppId ? buildMiniAppPreviewUrl(miniAppId) : ''), [miniAppId]);
  const syncRuntimeContext = useCallback(() => {
    postMiniAppRuntimeInit(iframeRef.current, route, params);
  }, [route, params]);

  useEffect(() => {
    if (!embedDisplay || !isRunning) return;
    syncRuntimeContext();
  }, [embedDisplay, isRunning, syncRuntimeContext]);

  if (!miniAppId) {
    return <EmptyDisplay icon={<PanelsTopLeft className="h-5 w-5" />} text="No miniapp selected" />;
  }

  if (!isRunning) {
    return <EmptyDisplay icon={<PanelsTopLeft className="h-5 w-5" />} text="Miniapp will appear here while this node is running." />;
  }

  if (embedDisplay) {
    return (
      <div className="nodrag nopan h-full w-full overflow-hidden rounded-lg border border-border/60 bg-background">
        <iframe
          key={previewUrl}
          ref={iframeRef}
          title={miniAppId}
          src={previewUrl}
          className="h-full w-full border-0 bg-background"
          onLoad={syncRuntimeContext}
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
        <div className="mt-3 text-[11px]">Enable inline display to render the miniapp inside this node while it is running.</div>
      </div>
    </div>
  );
}
