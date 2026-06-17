// 向量索引 / 语义搜索对话框。
// 沙箱化：剥离 store / sdk / next-intl / @/lib/cn / lucide / @agent-spaces/shared 类型，
// 数据走 utils/vector.js（indexNode/queryNodes/deleteIndexed）+ utils/db.js（listNodes/updateNode），
// 完成索引后由调用方 invokeService('node_changed') 广播。
import { useState } from 'react';
import { indexNode, queryNodes, deleteIndexed } from '../utils/vector.js';
import * as dbApi from '../utils/db.js';
import { T } from '../utils/constants.js';

const { Dialog, DialogContent, DialogHeader, DialogTitle, Button, Input, Progress } = window.AgentSpacesUI;

const cn = (...a) => a.filter(Boolean).join(' ');

export function DatabaseVectorDialog({ open, onClose, onSelect }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [indexing, setIndexing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  const doIndex = async () => {
    setIndexing(true);
    setError('');
    setProgress(0);
    try {
      const docs = (await dbApi.listNodes()).filter((n) => !n.isTrash);
      let done = 0;
      for (const n of docs) {
        if (n.kbFileId) {
          // 重建：先删旧索引
          await deleteIndexed(n.kbFileId);
        }
        const r = await indexNode(n);
        if (r && r.fileId) await dbApi.updateNode(n.id, { kbFileId: r.fileId });
        done++;
        setProgress(Math.round((done / docs.length) * 100));
      }
      // 广播以便 sidebar/树刷新 kbFileId 状态
      await window.AgentSpaces.invokeService('node_changed', { kind: 'update' });
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setIndexing(false);
    }
  };

  const doSearch = async () => {
    setSearching(true);
    setError('');
    try {
      const { matches } = await queryNodes(q);
      setResults(matches.filter((m) => m.nodeId));
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setSearching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{T.vector}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Button onClick={doIndex} disabled={indexing} size="sm">
            {indexing ? `索引中 ${progress}%` : '开始索引'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={indexing}
            onClick={async () => {
              // 清空所有 kbFileId 关联（不删后端索引文件，仅解除绑定）
              const docs = await dbApi.listNodes();
              for (const n of docs) {
                if (n.kbFileId) {
                  await deleteIndexed(n.kbFileId).catch(() => {});
                  await dbApi.updateNode(n.id, { kbFileId: '' });
                }
              }
              await window.AgentSpaces.invokeService('node_changed', { kind: 'update' });
            }}
          >
            清空索引
          </Button>
        </div>

        {indexing ? <Progress value={progress} /> : null}

        <div className="flex gap-2 mt-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') doSearch();
            }}
            placeholder={T.search}
            disabled={searching}
          />
          <Button onClick={doSearch} disabled={searching || !q.trim()} size="sm">
            {searching ? '搜索中…' : '查'}
          </Button>
        </div>

        {error ? <div className="text-xs text-destructive">{error}</div> : null}

        <div className="max-h-[300px] overflow-auto space-y-1 mt-1">
          {results.length === 0 && !searching ? (
            <div className="py-6 text-center text-xs text-muted-foreground italic">无结果</div>
          ) : null}
          {results.map((m, i) => (
            <div
              key={i}
              className={cn('py-1.5 cursor-pointer hover:bg-accent rounded px-2')}
              onClick={() => {
                onSelect && onSelect(m.nodeId);
                onClose();
              }}
            >
              <div className="font-medium text-sm">{m.title || '未命名'}</div>
              <div className="text-[11px] opacity-60">score: {Number(m.score).toFixed(3)}</div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default DatabaseVectorDialog;
