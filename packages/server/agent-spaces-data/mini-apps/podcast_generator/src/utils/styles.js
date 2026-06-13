// 布局与组件样式

export const styles = {
  root: {
    display: 'flex', flexDirection: 'column', height: '100%',
    boxSizing: 'border-box', gap: '0',
  },
  toolbar: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '10px 14px', borderBottom: '1px solid var(--border, #334)',
    flexWrap: 'wrap', background: 'var(--card, transparent)',
  },
  title: { fontSize: '16px', fontWeight: 700, marginRight: 'auto' },
  body: { display: 'flex', flex: 1, minHeight: 0 },
  col: {
    display: 'flex', flexDirection: 'column', minHeight: 0,
    borderRight: '1px solid var(--border, #334)',
  },
  colLeft: { width: '280px', flexShrink: 0 },
  colMid: { flex: 1, minWidth: 0 },
  colRight: { width: '400px', flexShrink: 0, borderRight: 'none', borderLeft: '1px solid var(--border, #334)' },
  header: {
    padding: '10px 14px', borderBottom: '1px solid var(--border, #334)',
    fontSize: '13px', fontWeight: 600,
  },
  scroll: { flex: 1, overflowY: 'auto', padding: '10px 14px' },
  chapterItem: {
    padding: '8px 10px', borderRadius: '8px', cursor: 'pointer',
    fontSize: '13px', marginBottom: '4px', lineHeight: 1.4,
    border: '1px solid transparent', transition: 'background 0.15s',
  },
  chapterItemSelected: {
    background: 'var(--primary, #4fc3f7)22', border: '1px solid var(--primary, #4fc3f7)',
  },
  contentText: {
    fontSize: '14px', lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  },
  bubble: {
    display: 'flex', flexDirection: 'column', marginBottom: '12px',
    border: '1px solid var(--border, #334)', borderRadius: '12px', padding: '10px 12px',
  },
  bubbleRole: { fontSize: '12px', fontWeight: 700, marginBottom: '4px', opacity: 0.85 },
  bubbleText: { fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-wrap' },
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    height: '100%', gap: '8px', color: 'var(--muted-foreground, #888)', fontSize: '13px',
    padding: '24px', textAlign: 'center',
  },
  fileLabel: { display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' },
  divider: { width: '1px', height: '20px', background: 'var(--border, #334)' },
  footer: {
    padding: '10px 14px', borderTop: '1px solid var(--border, #334)',
    display: 'flex', gap: '8px', alignItems: 'center',
  },
};

// 主持人 / 嘉宾 气泡配色
export function roleBubbleStyle(role) {
  const isHost = role === '主持人' || role === 'host';
  return isHost
    ? { background: 'var(--primary, #4fc3f7)22', borderColor: 'var(--primary, #4fc3f7)' }
    : { background: 'var(--muted, #1f2a3a)', borderColor: 'var(--border, #334)' };
}
