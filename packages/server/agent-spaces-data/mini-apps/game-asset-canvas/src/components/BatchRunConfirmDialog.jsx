import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@agent-spaces/ui';

export default function BatchRunConfirmDialog({ open, outputCount = 0, onCancel, onConfirm }) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) onCancel?.(); }}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>再次运行已有产出的节点？</AlertDialogTitle>
          <AlertDialogDescription>
            本次任务中有 {outputCount} 个节点已有输出。是否仍要批量运行这些节点？
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>取消</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>再次运行</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
