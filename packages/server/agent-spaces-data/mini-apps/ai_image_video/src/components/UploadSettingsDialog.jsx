import { useEffect, useState } from 'react';
import useUI from '../hooks/useUI';
import { readUploadSettings } from '../utils/upload';

const PROVIDER_OPTIONS = [
  { id: 'tencent', label: '腾讯云 COS', description: '默认选项，适合已有 COS 配置的本地转存' },
  { id: 'aliyun', label: '阿里云 OSS', description: '适合阿里云工作流统一走 OSS' },
];

export default function UploadSettingsDialog({ open, onOpenChange }) {
  const UI = useUI();
  const [provider, setProvider] = useState('tencent');
  const [autoUpload, setAutoUpload] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    readUploadSettings().then((settings) => {
      setProvider(settings.provider || 'tencent');
      setAutoUpload(settings.autoUpload !== false);
    });
  }, [open]);

  if (!UI) return null;

  const {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
    Button, Label, Switch,
  } = UI;

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.AgentSpacesUI.writeConfigJson('upload-settings.json', { provider, autoUpload });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={styles.content}>
        <DialogHeader>
          <DialogTitle>上传设置</DialogTitle>
        </DialogHeader>

        <div style={styles.section}>
          <Label style={styles.label}>云存储</Label>
          <div style={styles.providerGrid}>
            {PROVIDER_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setProvider(option.id)}
                style={{
                  ...styles.providerButton,
                  ...(provider === option.id ? styles.providerButtonActive : null),
                }}
              >
                <span style={styles.providerName}>{option.label}</span>
                <span style={styles.providerDesc}>{option.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={styles.switchRow}>
          <div>
            <Label style={styles.label}>提交时自动上传本地文件</Label>
            <p style={styles.hint}>开启后会先转存到公网 URL，再调用需要 URL 输入的生成工具。</p>
          </div>
          <Switch checked={autoUpload} onCheckedChange={setAutoUpload} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const styles = {
  content: {
    maxWidth: '460px',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 600,
  },
  providerGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  },
  providerButton: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    backgroundColor: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
  },
  providerButtonActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  providerName: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#111827',
  },
  providerDesc: {
    fontSize: '11px',
    lineHeight: 1.5,
    color: '#6b7280',
  },
  switchRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    padding: '12px 0',
  },
  hint: {
    margin: '6px 0 0 0',
    fontSize: '12px',
    color: '#6b7280',
    lineHeight: 1.5,
  },
};

