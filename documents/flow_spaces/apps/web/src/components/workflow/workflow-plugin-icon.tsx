'use client';

import { Package, PackagePlus, Store } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type PluginIconSource =
  | { type: 'url'; url: string }
  | { type: 'builtin'; variant: 'local' | 'store' };

export function PluginIcon({ source, className }: { source: PluginIconSource; className?: string }) {
  const [failed, setFailed] = useState(false);
  const url = source.type === 'url' ? source.url : '';
  const sizeClassName = className ?? 'h-8 w-8';
  const fallbackClassName = 'h-3/4 w-3/4 text-muted-foreground';

  useEffect(() => {
    setFailed(false);
  }, [url]);

  if (source.type === 'url' && !failed) {
    return (
      <img
        src={url}
        alt=""
        className={cn(sizeClassName, 'object-contain')}
        onError={() => setFailed(true)}
      />
    );
  }

  const icon = source.type === 'builtin'
    ? (source.variant === 'store' ? <Store className={fallbackClassName} /> : <PackagePlus className={fallbackClassName} />)
    : <Package className={fallbackClassName} />;

  return <span className={cn('inline-flex items-center justify-center', sizeClassName)}>{icon}</span>;
}
