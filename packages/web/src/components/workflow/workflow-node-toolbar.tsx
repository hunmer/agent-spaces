import React, { useCallback, useState } from 'react';
import { NodeToolbar, Position } from '@xyflow/react';
import { Loader2, Play, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export interface WorkflowNodeToolbarProps {
  /** 整条 toolbar 是否渲染（缩放到图标态或画布锁定时隐藏） */
  visible: boolean;
  isNodeCollapsed: boolean;
  isStartNode: boolean;
  isBoundaryNode: boolean;
  isExecutionBusy: boolean;
  isCurrentNodeDebugging: boolean;
  showPartialTest: boolean;
  isPartialTesting: boolean;
  canDeleteNode: boolean;
  isDeleteDisabled: boolean;
  canContinueFromPreview: boolean;
  anchorMode?: 'center' | 'node-width';
  nodeWidth?: number;
  canvasZoom?: number;
  onExecuteWorkflow: (event: React.MouseEvent) => void;
  onTestNode: (event: React.MouseEvent) => void;
  onPartialTest: (event: React.MouseEvent) => void;
  onDelete: (event: React.MouseEvent) => void;
  /** 从当前节点继续运行（用于 preview 流程） */
  onContinueFromPreview: (presetId: string) => void;
}

/**
 * 节点顶部浮动工具栏（执行/测试/继续运行/删除）+ "从当前节点继续运行"对话框。
 *
 * 把原主组件里的 NodeToolbar 区块与 continue Dialog 抽出，continue 相关本地状态收敛于此，
 * 行为与原内联实现完全一致。
 */
export function WorkflowNodeToolbar(props: WorkflowNodeToolbarProps) {
  const {
    visible,
    isNodeCollapsed,
    isStartNode,
    isBoundaryNode,
    isExecutionBusy,
    isCurrentNodeDebugging,
    showPartialTest,
    isPartialTesting,
    canDeleteNode,
    isDeleteDisabled,
    canContinueFromPreview,
    anchorMode = 'center',
    nodeWidth = 0,
    canvasZoom = 1,
    onExecuteWorkflow,
    onTestNode,
    onPartialTest,
    onDelete,
    onContinueFromPreview,
  } = props;
  const t = useTranslations('workflows');
  const [continueDialogOpen, setContinueDialogOpen] = useState(false);
  const [continuePresetId, setContinuePresetId] = useState('debug');
  const useNodeWidthAnchor = anchorMode === 'node-width' && nodeWidth > 0;
  const toolbarAnchorOffset = useNodeWidthAnchor ? (nodeWidth * canvasZoom) / 2 : 0;

  const handleContinueFromPreview = useCallback(() => {
    const presetId = continuePresetId.trim() || 'debug';
    onContinueFromPreview(presetId);
    setContinueDialogOpen(false);
  }, [continuePresetId, onContinueFromPreview]);

  return (
    <>
      {visible ? (
        <NodeToolbar
          position={Position.Top}
          align={isNodeCollapsed || useNodeWidthAnchor ? 'start' : 'center'}
          offset={8}
          className="nodrag nopan flex items-center gap-1  p-1"
        >
          <div
            className="flex items-center gap-1"
            style={useNodeWidthAnchor ? { marginLeft: toolbarAnchorOffset, transform: 'translateX(-50%)' } : undefined}
          >
          {showPartialTest ? (
            <button
              type="button"
              className="inline-flex h-7 items-center justify-center gap-1 rounded-full border border-border bg-background px-2.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isExecutionBusy}
              title={t('nodeUi.test.partial')}
              aria-label={t('nodeUi.test.partial')}
              onClick={onPartialTest}
            >
              {isPartialTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {t('nodeUi.test.partial')}
            </button>
          ) : null}
          {isStartNode ? (
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isExecutionBusy}
              onClick={onExecuteWorkflow}
              title={t('nodeUi.test.node')}
              aria-label={t('nodeUi.test.node')}
            >
              {isExecutionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            </button>
          ) : null}
          {!isBoundaryNode ? (
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onTestNode}
              title={isCurrentNodeDebugging ? t('nodeUi.test.cancel') : t('nodeUi.test.node')}
              aria-label={isCurrentNodeDebugging ? t('nodeUi.test.cancel') : t('nodeUi.test.node')}
            >
              {isCurrentNodeDebugging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            </button>
          ) : null}
          {canContinueFromPreview ? (
            <button
              type="button"
              className="inline-flex h-7 items-center justify-center gap-1 rounded-full bg-blue-500 px-2.5 text-[10px] font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={(event) => {
                event.stopPropagation();
                if (!isExecutionBusy) setContinueDialogOpen(true);
              }}
              disabled={isExecutionBusy}
              title="从当前节点开始继续运行"
              aria-label="从当前节点开始继续运行"
            >
              <Play className="h-3.5 w-3.5" />
              继续运行
            </button>
          ) : null}
          {canDeleteNode && !isDeleteDisabled ? (
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/80"
              onClick={onDelete}
              title={t('nodeUi.delete')}
              aria-label={t('nodeUi.delete')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          </div>
        </NodeToolbar>
      ) : null}

      <Dialog open={continueDialogOpen} onOpenChange={setContinueDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">从当前节点开始继续运行</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <div className="text-xs font-medium">统一的预设 ID</div>
            <Input
              value={continuePresetId}
              onChange={(event) => setContinuePresetId(event.target.value)}
              className="h-8 text-xs"
              placeholder="debug"
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleContinueFromPreview();
              }}
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center rounded border border-border px-3 text-xs hover:bg-muted"
              onClick={() => setContinueDialogOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center rounded bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              onClick={handleContinueFromPreview}
            >
              运行
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
