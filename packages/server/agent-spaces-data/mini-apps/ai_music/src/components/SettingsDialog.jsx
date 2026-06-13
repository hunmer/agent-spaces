import { useState, useEffect, useRef } from 'react';

const {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Button, Switch, Label,
  Download, Trash2,
} = window.AgentSpacesUI;

/**
 * 设置弹窗：
 *  - 启动时恢复播放（Switch，受控）
 *  - 导出数据（导出本地歌曲列表为 JSON）
 *  - 清空歌曲列表（两步确认，避免误触）
 */
export default function SettingsDialog({
  open,
  onClose,
  restoreOnStart,
  onRestoreChange,
  onExport,
  onClear,
}) {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const resetTimer = useRef(null);

  // 每次打开重置「清空」确认态
  useEffect(() => {
    if (open) setConfirmingClear(false);
  }, [open]);

  // 卸载时清理复位定时器
  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const handleClearClick = () => {
    if (!confirmingClear) {
      // 第一步：进入确认态，3 秒内未二次点击则自动复位
      setConfirmingClear(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setConfirmingClear(false), 3000);
      return;
    }
    // 第二步：执行清空
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setConfirmingClear(false);
    onClear?.();
    onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-popover text-popover-foreground border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">设置</DialogTitle>
          <DialogDescription>管理本地数据与播放偏好</DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-5">
          {/* 启动时恢复播放 */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-background/40 p-4">
            <div className="pr-4">
              <Label className="text-sm font-medium cursor-pointer">启动时恢复播放</Label>
              <p className="text-xs text-muted-foreground mt-1">下次打开时自动续播上次的歌曲</p>
            </div>
            <Switch
              checked={restoreOnStart}
              onCheckedChange={onRestoreChange}
            />
          </div>

          {/* 数据操作 */}
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">数据</p>
            <Button
              onClick={onExport}
              className="w-full justify-start h-11 border border-border bg-background/40 text-foreground hover:bg-accent font-normal"
            >
              <Download className="w-4 h-4 mr-2" />
              导出数据
            </Button>
            <Button
              onClick={handleClearClick}
              className={`w-full justify-start h-11 font-normal transition-colors ${
                confirmingClear
                  ? 'border border-red-500 text-red-400 bg-red-500/10 hover:bg-red-500/20'
                  : 'border border-border bg-background/40 text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {confirmingClear ? '再次点击以确认清空' : '清空歌曲列表'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
