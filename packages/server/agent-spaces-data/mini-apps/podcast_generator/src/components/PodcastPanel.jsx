const { Button, Badge } = window.AgentSpacesUI;
import { styles, roleBubbleStyle } from '../utils/styles.js';

function RoleIcon({ role }) {
  const icon = role === '主持人' ? '🎙️' : role === '嘉宾' ? '🧑‍🏫' : '💬';
  return <span>{icon}</span>;
}

export function PodcastPanel({ podcast, generating, onCopy }) {
  const sendToTTS = () => {
    if (!podcast.length) return;
    const text = podcast.map((it) => `${it.role}：${it.content}`).join('\n');
    const url = new URL('/mini-apps-preview/tts', window.location.origin);
    url.searchParams.set('mode', 'multi');
    url.searchParams.set('provider', 'minimax');
    url.searchParams.set('text', text);
    window.open(url.toString(), '_blank');
  };

  return (
    <div style={{ ...styles.col, ...styles.colRight }}>
      <div style={{ ...styles.header, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>🎧 播客脚本 {podcast.length ? `(${podcast.length} 句)` : ''}</span>
        {podcast.length > 0 && (
          <Button size="sm" variant="ghost" style={{ height: '26px', fontSize: '12px' }} onClick={onCopy}>
            复制
          </Button>
        )}
      </div>
      <div style={styles.scroll}>
        {generating ? (
          <div style={styles.empty}>
            <div style={{ fontSize: '28px' }}>🎙️</div>
            <Badge variant="secondary">正在生成播客对话…</Badge>
          </div>
        ) : podcast.length ? (
          podcast.map((it, i) => (
            <div key={i} style={{ ...styles.bubble, ...roleBubbleStyle(it.role) }}>
              <div style={styles.bubbleRole}><RoleIcon role={it.role} /> {it.role}</div>
              <div style={styles.bubbleText}>{it.content}</div>
            </div>
          ))
        ) : (
          <div style={styles.empty}>
            <div style={{ fontSize: '32px' }}>🎧</div>
            <div>选中章节并点击「生成本章播客」<br />AI 对话脚本显示在这里</div>
          </div>
        )}
      </div>
      <div style={styles.footer}>
        <Button
          style={{ width: '100%' }}
          disabled={!podcast.length || generating}
          onClick={sendToTTS}
        >
          发送到配音
        </Button>
      </div>
    </div>
  );
}
