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
      <DialogContent className="overflow-hidden p-5" style={{ width: '420px', maxWidth: '92vw' }}>
        <DialogHeader>
          <DialogTitle className="text-sm">选择连接目标</DialogTitle>
          <DialogDescription className="text-[12px] text-muted-foreground">
            {inputType === 'text'
              ? '目标节点有多个文本输入框，请选择本次连线要引用的位置。'
              : '目标节点有多个图片上传区域，请选择本次连线要写入的位置。'}
          </DialogDescription>
        </DialogHeader>

        {/* min-w-0 + overflow-hidden：作为 DialogContent(grid) 的直接子项，
            必须打破 grid item 默认 min-width:auto，否则被内容 fit-content 撑到 641px，
            导致内部 truncate 链全部失效（实测 span 宽 641px > dialog 420px）。 */}
        <div className="flex min-w-0 flex-col gap-2 overflow-hidden py-1">
          {targets.map((target) => {
            const Icon = TARGET_ICONS[target.id] || (inputType === 'text' ? FileText : Images);
            return (
              <Button
                key={target.id}
                type="button"
                variant="outline"
                // whitespace-normal 覆盖 Button base 的 whitespace-nowrap（否则被内容撑宽）
                className="h-auto w-full min-w-0 justify-start gap-3 whitespace-normal px-3 py-3 text-left"
                onClick={() => onSelect?.(target.id)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="block truncate text-sm font-medium">{target.label}</span>
                  <span className="block truncate text-[11px] font-normal text-muted-foreground">
                    {target.description}
                  </span>
                </div>
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
