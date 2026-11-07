'use client';

import { PackagePlus, Store } from 'lucide-react';
import { useState } from 'react';

export type PluginIconSource =
  | { type: 'url'; url: string; fallback?: 'local' | 'store' }
  | { type: 'builtin'; variant: 'local' | 'store' };

export function PluginIcon({ source }: { source: PluginIconSource }) {
  const [failed, setFailed] = useState(false);

  if (source.type === 'url' && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={source.url}
        alt=""
        className="h-4 w-4 object-contain"
        onError={() => setFailed(true)}
      />
    );
  }

  const variant = source.type === 'url' ? (source.fallback ?? 'store') : source.variant;
  return variant === 'store'
    ? <Store className="h-4 w-4 text-muted-foreground" />
    : <PackagePlus className="h-4 w-4 text-muted-foreground" />;
}
