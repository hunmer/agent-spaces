const { Button, Alert, AlertDescription, Badge } = window.AgentSpacesUI;
import { styles } from '../utils/styles.js';

export function Toolbar({
  bookMeta, parsing, agentMeta, onConfigureAgent,
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

      <Button size="sm" variant="outline" onClick={onConfigureAgent}>
        {agentMeta
          ? `🤖 ${agentMeta.name}${agentMeta.modelProvider ? ` · ${agentMeta.modelProvider}` : ''}`
          : '⚙️ 配置 AI 模型'}
      </Button>

      {toast && <Badge variant="secondary">{toast}</Badge>}
      {error && (
        <Alert variant="destructive" style={{ flex: 1, minWidth: '200px' }}>
          <AlertDescription>❌ {error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
