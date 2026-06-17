import { useEffect, useState } from 'react';
import { readUploadSettings, writeUploadSettings } from '../utils/upload';

const {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Label, Loader2, Database,
} = window.AgentSpacesUI;

const PROVIDER_OPTIONS = [
  { id: 'aliyun', label: '阿里云 OSS', description: '与阿里云 ASR 同生态，默认推荐' },
  { id: 'tencent', label: '腾讯云 COS', description: '适合已有 COS 配置的转存' },
];

// 存储方案设置：切换音视频转存用的对象存储。
// 附「扫描未入库的文档」入口：把 kb_status 非 indexed 的文案批量同步到知识库。
export default function UploadSettingsDialog({ open, onOpenChange, unindexedCount = 0, onScanUnindexed }) {
  const [provider, setProvider] = useState('aliyun');
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    setScanResult(null);
    readUploadSettings().then((s) => setProvider(s.provider || 'aliyun'));
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await writeUploadSettings({ provider });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleScan = async () => {
    if (scanning || !onScanUnindexed) return;
    setScanning(true);
    setScanResult(null);
    try {
      setScanResult(await onScanUnindexed());
    } catch (e) {
      setScanResult({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setScanning(false);
    }
  };

  const scanSummary = (() => {
    if (!scanResult) return null;
    if (scanResult.error) return `扫描失败:${scanResult.error}`;
    const parts = [`完成:共 ${scanResult.total} 篇,成功 ${scanResult.success} 篇`];
    if (scanResult.failed) parts.push(`失败 ${scanResult.failed} 篇`);
    if (scanResult.skipped) parts.push(`跳过 ${scanResult.skipped} 篇(内容为空)`);
    return `${parts.join(',')}。`;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>存储设置</DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-2">
          <Label>云存储方案</Label>
          <p className="text-xs text-muted-foreground">
            音视频转写前需先转存到公网 URL，选择你的对象存储（凭据请在平台对应插件配置）。
          </p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            {PROVIDER_OPTIONS.map((opt) => {
              const active = provider === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setProvider(opt.id)}
                  className={`flex flex-col gap-1 p-3 rounded-lg border text-left transition-colors ${
                    active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                  }`}
                >
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="text-xs text-muted-foreground leading-relaxed">{opt.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="py-2 space-y-2 border-t pt-4 mt-2">
          <Label>知识库</Label>
          <p className="text-xs text-muted-foreground">
            把文案内容扫描入库以支持语义检索。当前有{' '}
            <span className="font-medium text-foreground">{unindexedCount}</span> 篇未入库。
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleScan}
            disabled={scanning || saving || !unindexedCount || !onScanUnindexed}
          >
            {scanning ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
            {scanning ? '扫描中…' : '扫描未入库的文档'}
          </Button>
          {scanSummary && (
            <p className={`text-xs ${scanResult?.error ? 'text-destructive' : 'text-muted-foreground'}`}>
              {scanSummary}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>取消</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
