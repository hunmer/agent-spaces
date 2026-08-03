import { useEffect, useMemo, useState } from 'react';
import {
  Button, Checkbox,
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@agent-spaces/ui';
import { NODE_META } from '../../utils/constants';
import { collectGroupNodeIds } from '../../utils/group-helpers';
import {
  GROUP_OUTPUT_FILTER_MODES,
  normalizeGroupOutputBinding,
  wouldCreateGroupOutputBindingCycle,
} from '../../utils/group-execution';

export default function GroupOutputBindingDialog({
  state, groups, nodes, onClose, onSave, onDisconnect,
}) {
  const sourceGroup = groups.find((group) => group.id === state?.sourceGroupId);
  const targetGroup = groups.find((group) => group.id === state?.targetGroupId);
  const currentBinding = normalizeGroupOutputBinding(targetGroup?.batchExecution?.assets?.binding);
  const currentBindingKey = JSON.stringify(currentBinding);
  const sourceNodes = useMemo(() => {
    if (!sourceGroup) return [];
    const ids = new Set(collectGroupNodeIds(groups, sourceGroup.id));
    return nodes.filter((node) => ids.has(node.id));
  }, [groups, nodes, sourceGroup]);
  const typeOptions = useMemo(() => Array.from(
    new Set(sourceNodes.map((node) => node.type)),
  ).map((type) => ({ type, label: NODE_META[type]?.label || type })), [sourceNodes]);

  const [mode, setMode] = useState(GROUP_OUTPUT_FILTER_MODES.all);
  const [nodeIds, setNodeIds] = useState(new Set());
  const [nodeTypes, setNodeTypes] = useState(new Set());

  useEffect(() => {
    const initial = currentBinding?.sourceGroupId === state?.sourceGroupId
      ? currentBinding.filter
      : { mode: GROUP_OUTPUT_FILTER_MODES.all, nodeIds: [], nodeTypes: [] };
    setMode(initial.mode);
    setNodeIds(new Set(initial.nodeIds));
    setNodeTypes(new Set(initial.nodeTypes));
  }, [currentBindingKey, state?.sourceGroupId, state?.targetGroupId]);

  const toggleSet = (setter, value, checked) => setter((current) => {
    const next = new Set(current);
    if (checked) next.add(value);
    else next.delete(value);
    return next;
  });
  const createsCycle = state ? wouldCreateGroupOutputBindingCycle(
    groups,
    state.sourceGroupId,
    state.targetGroupId,
  ) : false;
  const validFilter = mode === GROUP_OUTPUT_FILTER_MODES.all
    || (mode === GROUP_OUTPUT_FILTER_MODES.nodes && nodeIds.size > 0)
    || (mode === GROUP_OUTPUT_FILTER_MODES.types && nodeTypes.size > 0);
  const valid = validFilter && !createsCycle;
  const canDisconnect = currentBinding?.sourceGroupId === state?.sourceGroupId;

  const handleSave = () => {
    if (!valid || !state) return;
    onSave(state.targetGroupId, {
      sourceGroupId: state.sourceGroupId,
      filter: { mode, nodeIds: [...nodeIds], nodeTypes: [...nodeTypes] },
    });
    onClose();
  };

  return (
    <Dialog open={!!state} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent style={{ width: 'min(520px, calc(100vw - 2rem))', maxWidth: 520 }}>
        <DialogHeader>
          <DialogTitle>接收分组当前输出</DialogTitle>
          <DialogDescription>
            {sourceGroup?.name || '来源分组'} → {targetGroup?.name || '目标分组'}。匹配节点的当前输出图片会自动成为“按上传素材执行”的素材实例。
          </DialogDescription>
        </DialogHeader>

        <div className="flex rounded-md border border-border bg-muted/40 p-0.5">
          <FilterModeButton active={mode === GROUP_OUTPUT_FILTER_MODES.all} onClick={() => setMode(GROUP_OUTPUT_FILTER_MODES.all)}>
            全部
          </FilterModeButton>
          <FilterModeButton active={mode === GROUP_OUTPUT_FILTER_MODES.nodes} onClick={() => setMode(GROUP_OUTPUT_FILTER_MODES.nodes)}>
            指定节点
          </FilterModeButton>
          <FilterModeButton active={mode === GROUP_OUTPUT_FILTER_MODES.types} onClick={() => setMode(GROUP_OUTPUT_FILTER_MODES.types)}>
            按类型
          </FilterModeButton>
        </div>

        <div className="max-h-72 overflow-y-auto rounded-md border border-border p-1">
          {mode === GROUP_OUTPUT_FILTER_MODES.all && (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              接收来源分组内全部 {sourceNodes.length} 个节点的当前图片输出。
            </p>
          )}
          {mode === GROUP_OUTPUT_FILTER_MODES.nodes && sourceNodes.map((node) => (
            <label key={node.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 hover:bg-muted">
              <Checkbox
                checked={nodeIds.has(node.id)}
                onCheckedChange={(checked) => toggleSet(setNodeIds, node.id, Boolean(checked))}
              />
              <span className="truncate text-sm">{node.data?.label || NODE_META[node.type]?.label || node.id}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{NODE_META[node.type]?.label || node.type}</span>
            </label>
          ))}
          {mode === GROUP_OUTPUT_FILTER_MODES.types && typeOptions.map((item) => (
            <label key={item.type} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 hover:bg-muted">
              <Checkbox
                checked={nodeTypes.has(item.type)}
                onCheckedChange={(checked) => toggleSet(setNodeTypes, item.type, Boolean(checked))}
              />
              <span className="text-sm">{item.label}</span>
              <code className="ml-auto text-xs text-muted-foreground">{item.type}</code>
            </label>
          ))}
          {mode !== GROUP_OUTPUT_FILTER_MODES.all
            && ((mode === GROUP_OUTPUT_FILTER_MODES.nodes && !sourceNodes.length)
              || (mode === GROUP_OUTPUT_FILTER_MODES.types && !typeOptions.length)) && (
              <p className="px-2 py-3 text-sm text-muted-foreground">来源分组内没有可选节点。</p>
          )}
        </div>

        {createsCycle && <p className="text-xs text-destructive">该连接会形成循环，请调整连接方向。</p>}

        <DialogFooter>
          {canDisconnect && (
            <Button variant="destructive" className="mr-auto" onClick={() => { onDisconnect(state.targetGroupId); onClose(); }}>
              断开连接
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button disabled={!valid} onClick={handleSave}>应用连接</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilterModeButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 flex-1 rounded px-2 text-xs font-medium transition ${
        active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
      }`}
    >{children}</button>
  );
}
