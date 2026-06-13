import { styles } from '../utils/styles.js';

export function ChapterList({ bookMeta, chapters, selectedIndex, onSelect }) {
  return (
    <div style={{ ...styles.col, ...styles.colLeft }}>
      <div style={styles.header}>
        {bookMeta ? (
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700 }}>{bookMeta.title}</div>
            <div style={{ fontSize: '11px', opacity: 0.6, marginTop: '2px' }}>{bookMeta.author}</div>
          </div>
        ) : '📖 章节目录'}
      </div>
      <div style={styles.scroll}>
        {chapters.length === 0 ? (
          <div style={{ ...styles.empty, height: 'auto', padding: '24px 12px' }}>
            <div style={{ fontSize: '28px' }}>📚</div>
            <div>上传 EPUB 后<br />这里显示章节列表</div>
          </div>
        ) : (
          chapters.map((ch) => (
            <div
              key={ch.index}
              style={{
                ...styles.chapterItem,
                ...(selectedIndex === ch.index ? styles.chapterItemSelected : {}),
              }}
              onClick={() => onSelect(ch.index)}
            >
              <span style={{ opacity: 0.4, marginRight: '6px' }}>{ch.index + 1}.</span>
              {ch.label}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
