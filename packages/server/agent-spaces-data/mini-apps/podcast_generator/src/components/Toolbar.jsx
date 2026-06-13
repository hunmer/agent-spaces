const {
  Button, Alert, AlertDescription, Badge,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} = window.AgentSpacesUI;
import { styles } from '../utils/styles.js';

export function Toolbar({
  bookMeta, parsing, presets, agentConfigId, onPresetChange,
  onFile, error, toast,
}) {
  const handlePick = (e) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
    e.target.value = '';
  };
  return (
    <div style={styles.toolbar}>
      <span style={styles.title}>🎙️ 电子书转播客</span>

      <label style={styles.fileLabel}>
        <Button
          size="sm"
          variant="outline"
          disabled={parsing}
          onClick={() => document.getElementById('podcast-epub-input').click()}
        >
          {parsing ? '⏳ 解析中…' : (bookMeta ? '📂 换一本书' : '📂 上传 EPUB')}
        </Button>
        <input
          id="podcast-epub-input"
          type="file"
          accept=".epub,application/epub+zip"
          style={{ display: 'none' }}
          onChange={handlePick}
        />
      </label>

      <div style={styles.divider} />

      <span style={{ fontSize: '12px' }}>AI 模型</span>
      <Select value={agentConfigId} onValueChange={onPresetChange}>
        <SelectTrigger style={{ width: '180px', height: '32px' }}>
          <SelectValue placeholder="选择模型预设" />
        </SelectTrigger>
        <SelectContent>
          {presets.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name} <span style={{ opacity: 0.5, fontSize: '11px' }}>· {p.modelProvider}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {toast && <Badge variant="secondary">{toast}</Badge>}
      {error && (
        <Alert variant="destructive" style={{ flex: 1, minWidth: '200px' }}>
          <AlertDescription>❌ {error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
