// 库设置对话框（本次单库简化版）。
// 沙箱化：剥离 store / sdk / next-intl / @/lib/cn / @agent-spaces/shared 类型。
// 展示 stats（文档数 / 回收站数 / 版本数等，由调用方传入），库显示名编辑存 config 的 dbName。
// 通过 invokeService('update_prefs', { dbName }) 持久化到 services/config.js。
import { useState, useEffect } from 'react';

const { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button, Input, Label } =
  window.AgentSpacesUI || {};

const cn = (...a) => a.filter(Boolean).join(' ');

export function DatabaseDialog({ open, onClose, stats, dbName: dbNameProp }) {
  const [dbName, setDbName] = useState(dbNameProp || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDbName(dbNameProp || '');
  }, [open, dbNameProp]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.AgentSpaces.invokeService('update_prefs', { dbName: dbName.trim() || 'Notion Database' });
      onClose && onClose();
    } finally {
      setSaving(false);
    }
  };

  const statRows = Array.isArray(stats) ? stats : [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!max-w-[480px]">
        <DialogHeader>
          <DialogTitle>库设置</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            {Label ? <Label htmlFor="db-name" className="text-xs">库显示名</Label> : null}
            <Input
              id="db-name"
              value={dbName}
              onChange={(e) => setDbName(e.target.value)}
              placeholder="Notion Database"
              className="h-9 text-sm"
            />
          </div>

          {statRows.length > 0 ? (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">统计</div>
              <div className="rounded-md border border-border divide-y divide-border">
                {statRows.map((row, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-medium tabular-nums">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onClose && onClose()} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DatabaseDialog;
