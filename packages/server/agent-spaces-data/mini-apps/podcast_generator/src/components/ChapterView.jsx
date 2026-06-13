const { Button, Badge } = window.AgentSpacesUI;
import { styles } from '../utils/styles.js';

export function ChapterView({ label, text, loading, generating, onGenerate }) {
  const canGenerate = !!text.trim() && !generating;
  return (
    <div style={{ ...styles.col, ...styles.colMid }}>
      <div style={styles.header}>{label || '章节内容'}</div>
      <div style={styles.scroll}>
        {loading ? (
          <div style={styles.empty}><Badge variant="secondary">加载章节中…</Badge></div>
        ) : text ? (
          <div style={styles.contentText}>{text}</div>
        ) : (
          <div style={styles.empty}>
            <div style={{ fontSize: '32px' }}>📄</div>
            <div>选择左侧章节查看正文</div>
          </div>
        )}
      </div>
      <div style={styles.footer}>
        <Button onClick={onGenerate} disabled={!canGenerate}>
          {generating ? '⏳ AI 生成中…' : '🎙️ 生成本章播客'}
        </Button>
        <span style={{ fontSize: '11px', opacity: 0.6 }}>
          {text ? `${text.length} 字` : ''}
        </span>
      </div>
    </div>
  );
}
