'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { sdk } from '@/lib/sdk';
import type { ExternalImportKind, ExternalImportMode, ExternalImportSource } from '@agent-spaces/sdk';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Link2, Copy, RefreshCw, Search, FileText, Folder, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type AgentOption = { id: string; name: string };

interface ExternalImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kinds?: ExternalImportKind[];
  defaultKind?: ExternalImportKind;
  targetAgentId?: string;
  agents?: AgentOption[];
  onImported?: () => void;
}

const KIND_LABELS: Record<ExternalImportKind, string> = {
  skills: 'Skills',
  commands: 'Commands',
  mcps: 'MCP',
  'output-styles': 'Output Styles',
  agents: 'Agents',
};

const DEFAULT_KINDS: ExternalImportKind[] = ['skills', 'commands', 'mcps', 'output-styles', 'agents'];

export function ExternalImportDialog({
  open,
  onOpenChange,
  kinds = DEFAULT_KINDS,
  defaultKind,
  targetAgentId,
  agents = [],
  onImported,
}: ExternalImportDialogProps) {
  const enabledKindsKey = (kinds.length ? kinds : ['skills']).join('\0');
  const enabledKinds = useMemo<ExternalImportKind[]>(
    () => enabledKindsKey.split('\0') as ExternalImportKind[],
    [enabledKindsKey],
  );
  const firstAgentId = agents[0]?.id || '';
  const [activeKind, setActiveKind] = useState<ExternalImportKind>(defaultKind || enabledKinds[0]);
  const [items, setItems] = useState<ExternalImportSource[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<ExternalImportMode>('copy');
  const [query, setQuery] = useState('');
  const [agentId, setAgentId] = useState(targetAgentId || agents[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [resultText, setResultText] = useState('');

  const scan = useCallback(async (selectionKind: ExternalImportKind) => {
    setLoading(true);
    setError('');
    try {
      const data = await sdk.externalImport.scan(enabledKinds);
      setItems(data);
      setSelectedIds(new Set(data.filter((item) => item.kind === selectionKind).map((item) => item.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : '扫描失败');
    } finally {
      setLoading(false);
    }
  }, [enabledKinds]);

  useEffect(() => {
    if (!open) return;
    const nextKind = defaultKind || enabledKinds[0];
    setActiveKind(nextKind);
    setAgentId(targetAgentId || firstAgentId);
    setResultText('');
    void scan(nextKind);
  }, [open, defaultKind, enabledKinds, targetAgentId, firstAgentId, scan]);

  const visibleItems = items.filter((item) => {
    if (item.kind !== activeKind) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [item.name, item.description, item.provider, item.relativePath, item.source]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  });

  const selectedVisibleCount = visibleItems.filter((item) => selectedIds.has(item.id)).length;
  const selectedCount = items.filter((item) => item.kind === activeKind && selectedIds.has(item.id)).length;
  const requiresAgent = activeKind === 'commands';
  const canImport = selectedCount > 0 && (!requiresAgent || !!agentId);

  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = visibleItems.length > 0 && visibleItems.every((item) => next.has(item.id));
      for (const item of visibleItems) {
        if (allSelected) next.delete(item.id);
        else next.add(item.id);
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    if (!canImport) return;
    setImporting(true);
    setError('');
    setResultText('');
    try {
      const payload = items
        .filter((item) => item.kind === activeKind && selectedIds.has(item.id))
        .map((item) => ({
          id: item.id,
          name: item.name,
          group: item.group,
          targetAgentId: requiresAgent ? agentId : undefined,
        }));
      const results = await sdk.externalImport.import(activeKind, mode, payload);
      const ok = results.filter((item) => item.ok).length;
      const failed = results.length - ok;
      setResultText(failed ? `已导入 ${ok} 个，失败 ${failed} 个` : `已导入 ${ok} 个`);
      onImported?.();
      await scan(activeKind);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[80vw] !max-w-[80vw] !h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b">
          <DialogTitle>从外部导入</DialogTitle>
          <DialogDescription>扫描用户目录中的 Codex、Claude、Gemini 配置并导入到当前环境。</DialogDescription>
        </DialogHeader>

        <div className="px-5 py-3 border-b flex items-center gap-3">
          <Tabs value={activeKind} onValueChange={(value) => setActiveKind(value as ExternalImportKind)}>
            <TabsList>
              {enabledKinds.map((kind) => (
                <TabsTrigger key={kind} value={kind}>{KIND_LABELS[kind]}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex-1" />
          <RadioGroup value={mode} onValueChange={(value) => setMode(value as ExternalImportMode)} className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <RadioGroupItem value="copy" />
              <Copy className="size-3.5" />
              复制
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <RadioGroupItem value="symlink" />
              <Link2 className="size-3.5" />
              软链
            </label>
          </RadioGroup>
          <Button variant="outline" size="sm" onClick={() => scan(activeKind)} disabled={loading}>
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
          </Button>
        </div>

        <div className="px-5 py-3 border-b flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、来源或路径" className="pl-8" />
          </div>
          {requiresAgent && (
            <select
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
          )}
          <Button variant="ghost" size="sm" onClick={toggleAll} disabled={visibleItems.length === 0}>
            {selectedVisibleCount === visibleItems.length && visibleItems.length > 0 ? '取消全选' : '全选'}
          </Button>
        </div>

        {(error || resultText || (requiresAgent && !agentId)) && (
          <div className="mx-5 mt-3 rounded-md border px-3 py-2 text-sm flex items-center gap-2">
            <AlertCircle className="size-4 text-muted-foreground" />
            <span className={error ? 'text-destructive' : 'text-muted-foreground'}>
              {error || (requiresAgent && !agentId ? '导入 commands 需要目标 Agent' : resultText)}
            </span>
          </div>
        )}

        <ScrollArea className="flex-1 min-h-0 px-5 py-3">
          {visibleItems.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              {loading ? '扫描中...' : '没有可导入项目'}
            </div>
          ) : (
            <div className="space-y-2 pr-3">
              {visibleItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleOne(item.id)}
                  className="w-full text-left rounded-md border bg-background hover:bg-accent/50 px-3 py-2 flex gap-3"
                >
                  <Checkbox checked={selectedIds.has(item.id)} onCheckedChange={() => toggleOne(item.id)} onClick={(event) => event.stopPropagation()} />
                  {item.isDirectory ? <Folder className="size-4 mt-0.5 text-muted-foreground" /> : <FileText className="size-4 mt-0.5 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{item.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{item.provider}</Badge>
                      {item.group && <Badge variant="outline" className="text-[10px]">{item.group}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">{item.relativePath || item.source}</div>
                    {item.description && <div className="text-xs text-muted-foreground line-clamp-1 mt-1">{item.description}</div>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="px-5 py-3 border-t flex items-center justify-between">
          <div className="text-sm text-muted-foreground">已选择 {selectedCount} 个</div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button onClick={handleImport} disabled={!canImport || importing}>
              {importing ? '导入中...' : '导入'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
