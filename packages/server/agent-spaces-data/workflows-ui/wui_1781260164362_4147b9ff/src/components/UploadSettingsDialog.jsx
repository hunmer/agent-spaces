import { useEffect, useState } from 'react';
import { readUploadSettings, writeUploadSettings } from '../utils/upload';

const {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Label,
} = window.AgentSpacesUI;

const PROVIDER_OPTIONS = [
  { id: 'aliyun', label: '阿里云 OSS', description: '与阿里云 ASR 同生态，默认推荐' },
  { id: 'tencent', label: '腾讯云 COS', description: '适合已有 COS 配置的转存' },
];

// 存储方案设置：切换音视频转存用的对象存储。
export default function UploadSettingsDialog({ open, onOpenChange }) {
  const [provider, setProvider] = useState('aliyun');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
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

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>取消</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
