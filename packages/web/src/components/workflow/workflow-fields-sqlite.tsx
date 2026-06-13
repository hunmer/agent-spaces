'use client';

import { useState, useEffect } from 'react';
import { Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sdk } from '@/lib/sdk';
import { useTranslations } from 'next-intl';
import { SqliteDatabaseListDialog } from './sqlite-database-list-dialog';

export function SqliteDatabasePicker({ value, onChange }: {
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [dbName, setDbName] = useState('');

  useEffect(() => {
    let active = true;
    if (!value) { setDbName(''); return; }
    sdk.sqlite.listDatabases().then((list) => {
      if (!active) return;
      setDbName(list.find((d) => d.id === value)?.name ?? value);
    }).catch(() => { if (active) setDbName(value); });
    return () => { active = false; };
  }, [value]);

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex h-7 flex-1 items-center rounded-md border bg-muted/40 px-2 text-xs">
        <Database className="mr-1.5 size-3.5 text-muted-foreground" />
        <span className="truncate">{dbName || t('sqlite.pickerEmpty')}</span>
      </div>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOpen(true)}>
        {t('sqlite.selectDatabase')}
      </Button>
      <SqliteDatabaseListDialog
        open={open}
        onOpenChange={setOpen}
        mode="pick"
        onPicked={(id) => { onChange(id); setOpen(false); }}
      />
    </div>
  );
}
