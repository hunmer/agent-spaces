'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { sdk } from '@/lib/sdk';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table2, Play, ChevronDown, ChevronRight } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ResultTable } from '@/components/table/result-table';
import type { SqliteTableInfo, SqliteQueryResult, SqliteExecResult } from '@agent-spaces/shared';

export function SqliteDataBrowserDialog({ databaseId, onClose }: {
  databaseId: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [tables, setTables] = useState<SqliteTableInfo[]>([]);
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [result, setResult] = useState<SqliteQueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sql, setSql] = useState('');
  const [sqlOpen, setSqlOpen] = useState(false);
  const [execResult, setExecResult] = useState<SqliteExecResult | null>(null);

  const loadTables = useCallback(async () => {
    try { setTables(await sdk.sqlite.listTables(databaseId)); } catch { setTables([]); }
  }, [databaseId]);

  useEffect(() => { loadTables(); }, [loadTables]);

  const browseTable = async (name: string) => {
    setActiveTable(name);
    setLoading(true); setError(null); setExecResult(null);
    try { setResult(await sdk.sqlite.query(databaseId, `SELECT * FROM "${name}" LIMIT ?`, [100])); }
    catch (e) { setError((e as Error).message); setResult(null); }
    finally { setLoading(false); }
  };

  const runSql = async () => {
    setLoading(true); setError(null); setExecResult(null);
    try {
      const mode = /^\s*(select|with|pragma|explain)\b/i.test(sql) ? 'query' : 'exec';
      if (mode === 'query') setResult(await sdk.sqlite.query(databaseId, sql));
      else { const r = await sdk.sqlite.exec(databaseId, sql); setExecResult(r); setResult(null); await loadTables(); }
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-5xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Table2 className="size-4" />{t('sqlite.browserTitle')}</DialogTitle></DialogHeader>
        <div className="flex min-h-0 gap-3" style={{ height: '70vh' }}>
          <ScrollArea className="w-48 shrink-0 rounded-md border">
            <div className="p-1">
              {tables.map((tb) => (
                <button key={tb.name}
                  onClick={() => browseTable(tb.name)}
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-accent ${activeTable === tb.name ? 'bg-accent font-medium' : ''}`}>
                  <span className="truncate">{tb.name}</span>
                  <span className="ml-1 shrink-0 text-[10px] text-muted-foreground">{tb.rowCount}</span>
                </button>
              ))}
              {tables.length === 0 && <div className="p-3 text-xs text-muted-foreground">{t('sqlite.noTables')}</div>}
            </div>
          </ScrollArea>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="mb-2">
              <button className="flex items-center gap-1 text-xs text-muted-foreground" onClick={() => setSqlOpen((v) => !v)}>
                {sqlOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}{t('sqlite.runSql')}
              </button>
              {sqlOpen && (
                <div className="mt-1 space-y-1">
                  <Textarea className="font-mono text-xs" rows={3} value={sql} onChange={(e) => setSql(e.target.value)} placeholder={t('sqlite.sqlPlaceholder')} />
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={runSql} disabled={!sql.trim()}><Play className="mr-1 size-3" />{t('sqlite.run')}</Button>
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-md border">
              <ResultTable result={result} isLoading={loading} error={error} />
              {execResult && (
                <div className="p-2 text-xs text-muted-foreground">{t('sqlite.execSummary', { changes: execResult.changes, id: execResult.lastInsertRowid ?? '-' })}</div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
