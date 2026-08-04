import {
  Checkbox, CopyPlus, Crosshair, Trash2,
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@agent-spaces/ui';

import SettingsDialog from '../SettingsDialog';
import NodeFormDialog from '../NodeFormDialog';
import NodeExecuteDialog from '../NodeExecuteDialog';
import PromptPickerDialog from '../PromptPickerDialog';
import AssetLibraryPickerDialog from '../AssetLibraryPickerDialog';
import ExportImagesDialog from '../ExportImagesDialog';
import GroupConfirmDialog from '../GroupConfirmDialog';
import DeleteGroupDialog from '../DeleteGroupDialog';
import ConnectionTargetDialog from '../ConnectionTargetDialog';
import PastePropertiesDialog from '../PastePropertiesDialog';
import BatchRunConfirmDialog from '../BatchRunConfirmDialog';
import SavePresetDialog from '../SavePresetDialog';
import { NODE_META } from '../../utils/constants';

function NodeContextMenu({ state, onClose, onAction }) {
  if (!state) return null;
  return (
    <>
      <div
        className="fixed inset-0 z-[40]"
        onPointerDown={onClose}
        onContextMenu={(event) => { event.preventDefault(); onClose(); }}
      />
      <div
        className="nodrag nopan nowheel fixed z-[41] min-w-40 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        style={{ left: state.clientX, top: state.clientY }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onAction('clone', state.nodeId)}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition hover:bg-accent"
        >
          <CopyPlus className="h-3.5 w-3.5" />
          克隆节点
        </button>
        <button
          type="button"
          onClick={() => onAction('locateHistory', state.nodeId)}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition hover:bg-accent"
        >
          <Crosshair className="h-3.5 w-3.5" />
          定位到历史记录
        </button>
        <button
          type="button"
          onClick={() => onAction('delete', state.nodeId)}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-red-500 transition hover:bg-accent"
        >
          <Trash2 className="h-3.5 w-3.5" />
          删除节点
        </button>
      </div>
    </>
  );
}

export default function CanvasOverlayDialogs({
  nodeContextMenu,
  onCloseNodeContextMenu,
  onNodeContextAction,
  settingsDialog,
  batchRunDialog,
  deleteNodeDialog,
  promptManagerDialog,
  assetPickerDialog,
  nodeFormDialog,
  nodeExecuteDialog,
  exportImagesDialog,
  groupConfirmDialog,
  deleteGroupDialog,
  connectionTargetDialog,
  selectionPropertyPaste,
  groupPropertyPaste,
  savePresetDialog,
}) {
  const groupState = groupConfirmDialog.state;
  const pendingConnection = connectionTargetDialog.state;
  return (
    <>
      <NodeContextMenu
        state={nodeContextMenu}
        onClose={onCloseNodeContextMenu}
        onAction={onNodeContextAction}
      />

      <SettingsDialog {...settingsDialog} />
      <BatchRunConfirmDialog {...batchRunDialog} />

      <AlertDialog
        open={!!deleteNodeDialog.state}
        onOpenChange={(next) => { if (!next) deleteNodeDialog.onClose(); }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>删除节点？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteNodeDialog.state?.nodeLabel} 有 {deleteNodeDialog.state?.relatedCount} 条关联的生成记录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="nodrag nopan nowheel flex cursor-pointer items-center gap-2 py-1 text-sm">
            <Checkbox
              checked={!!deleteNodeDialog.state?.alsoDeleteHistory}
              onCheckedChange={deleteNodeDialog.onToggleHistory}
            />
            <span>同时删除关联的生成记录</span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deleteNodeDialog.onConfirm(!!deleteNodeDialog.state?.alsoDeleteHistory)}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PromptPickerDialog {...promptManagerDialog} pickerMode={false} />
      <AssetLibraryPickerDialog {...assetPickerDialog} mode="group" multi />
      <NodeFormDialog {...nodeFormDialog} />
      <NodeExecuteDialog {...nodeExecuteDialog} />
      <ExportImagesDialog {...exportImagesDialog} />
      <GroupConfirmDialog
        open={!!groupState}
        count={groupState?.urls?.length}
        defaultGroupName={groupState?.sourceNode
          ? `${NODE_META[groupState.sourceNode.type]?.label || '导出'} ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
          : ''}
        onClose={groupConfirmDialog.onClose}
        onConfirm={(groupName) => {
          if (groupState?.sourceNode) {
            groupConfirmDialog.onComplete(groupState.sourceNode, groupState.urls, { groupName: groupName ?? '' });
          }
        }}
        onCancel={() => {
          if (groupState?.sourceNode) groupConfirmDialog.onComplete(groupState.sourceNode, groupState.urls);
        }}
      />
      <DeleteGroupDialog {...deleteGroupDialog} />
      <ConnectionTargetDialog
        open={!!pendingConnection}
        targets={pendingConnection?.targets || []}
        targetsByInputType={pendingConnection?.targetsByInputType}
        assets={pendingConnection?.assets || []}
        inputType={pendingConnection?.inputType}
        onClose={connectionTargetDialog.onClose}
        onSelect={(inputTarget, sourceAsset, inputType, inputVariable) => {
          if (pendingConnection?.conn) {
            connectionTargetDialog.onConnect(
              pendingConnection.conn,
              inputTarget,
              inputType || pendingConnection.inputType,
              sourceAsset,
              inputVariable,
            );
          }
          connectionTargetDialog.onClose();
        }}
      />
      <PastePropertiesDialog {...selectionPropertyPaste} />
      <PastePropertiesDialog {...groupPropertyPaste} />
      <SavePresetDialog {...savePresetDialog} />
    </>
  );
}
