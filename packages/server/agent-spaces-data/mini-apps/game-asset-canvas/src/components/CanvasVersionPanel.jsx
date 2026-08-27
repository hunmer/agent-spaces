import { useCallback, useEffect, useState } from 'react';

const VERSION_FILE = (workspaceId) => `workspaces/${workspaceId}/canvas-versions.json`;
const AS = () => window.AgentSpaces;

function readVersions(workspaceId) {
  const value = AS()?.getConfig?.(VERSION_FILE(workspaceId));
  return Array.isArray(value?.versions) ? value.versions : [];
}

export default function CanvasVersionPanel({ open, workspaceId, nodes, edges, groups, setNodes, setEdges, setGroups, onClose }) {
  const [versions, setVersions] = useState([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  const reload = useCallback(() => setVersions(readVersions(workspaceId)), [workspaceId]);
  useEffect(() => { if (open && workspaceId) { setName(''); reload(); } }, [open, workspaceId, reload]);
  useEffect(() => {
    if (!open || !workspaceId || !AS()?.onConfigChanged) return undefined;
    return AS().onConfigChanged((path) => { if (path === VERSION_FILE(workspaceId)) reload(); });
  }, [open, workspaceId, reload]);

  const save = async () => {
    if (!workspaceId || busy) return;
    setBusy(true);
    const version = {
      id: `cv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim() || `画布版本 ${new Date().toLocaleString('zh-CN')}`,
      createdAt: Date.now(),
      snapshot: { nodes, edges, groups },
    };
    const next = { versions: [version, ...readVersions(workspaceId)].slice(0, 100) };
    await AS()?.writeConfigJson?.(VERSION_FILE(workspaceId), next);
    setName('');
    setVersions(next.versions);
    setBusy(false);
  };

  const restore = async (version) => {
    setNodes(version.snapshot.nodes || []);
    setEdges(version.snapshot.edges || []);
    setGroups(version.snapshot.groups || []);
    setConfirmId(null);
    onClose?.();
  };

  if (!open) return null;
  const { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button, Input } = AS()?.UI || window.AgentSpacesUI || {};
  if (!Dialog) return null;
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose?.(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>画布版本</DialogTitle></DialogHeader>
        <div className="flex gap-2">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="版本名称（可选）" />
          <Button onClick={save} disabled={busy}>备份当前</Button>
        </div>
        <div className="max-h-72 space-y-1 overflow-auto">
          {versions.length === 0 && <div className="py-6 text-center text-sm text-muted-foreground">暂无历史版本</div>}
          {versions.map((version) => (
            <div key={version.id} className="flex items-center gap-2 rounded border px-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{version.name}</div>
                <div className="text-xs text-muted-foreground">{new Date(version.createdAt).toLocaleString()} · {version.snapshot?.nodes?.length || 0} 个节点</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setConfirmId(version.id)}>恢复</Button>
            </div>
          ))}
        </div>
        {confirmId && (
          <Dialog open onOpenChange={(next) => { if (!next) setConfirmId(null); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>恢复画布版本？</DialogTitle></DialogHeader>
              <div className="text-sm text-muted-foreground">恢复会替换当前画布的全部节点、连线和分组。</div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setConfirmId(null)}>取消</Button>
                <Button variant="destructive" onClick={() => restore(versions.find((item) => item.id === confirmId))}>确认恢复</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}
