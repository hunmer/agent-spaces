import {
  Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
  FileText, Images, ScanLine,
} from '@agent-spaces/ui';

const TARGET_ICONS = {
  images: Images,
  mask: ScanLine,
};

export default function ConnectionTargetDialog({ open, targets = [], inputType = 'image', onSelect, onClose }) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose?.(); }}>
      <DialogContent className="p-5" style={{ width: '420px', maxWidth: '92vw' }}>
        <DialogHeader>
          <DialogTitle className="text-sm">选择连接目标</DialogTitle>
          <DialogDescription className="text-[12px] text-muted-foreground">
            {inputType === 'text'
              ? '目标节点有多个文本输入框，请选择本次连线要引用的位置。'
              : '目标节点有多个图片上传区域，请选择本次连线要写入的位置。'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-1">
          {targets.map((target) => {
            const Icon = TARGET_ICONS[target.id] || (inputType === 'text' ? FileText : Images);
            return (
              <Button
                key={target.id}
                type="button"
                variant="outline"
                className="h-auto justify-start gap-3 px-3 py-3 text-left"
                onClick={() => onSelect?.(target.id)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex min-w-0 flex-col items-start gap-0.5">
                  <span className="text-sm font-medium">{target.label}</span>
                  <span className="text-[11px] font-normal text-muted-foreground">{target.description}</span>
                </span>
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
