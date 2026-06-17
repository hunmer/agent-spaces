// 文案、枚举、预设。集中存放，替代 next-intl。
export const NODE_TYPE = { FOLDER: 'folder', DOCUMENT: 'document' };
export const EDITOR_MODE = { NOTION: 'notion', MARKDOWN: 'markdown' };
export const THEME = { SANS: 'sans', SERIF: 'serif', MONO: 'mono' };

export const EMOJIS = [
  '📄','📁','📝','📌','🏷️','💡','✅','❤️','🔥','⭐','🎯','📚','🗂️','🔧','🎨','🚀'
];

export const PRESET_COVERS = [
  'linear-gradient(to right, #10b981, #06b6d4)',
  'linear-gradient(to right, #ec4899, #8b5cf6)',
  'linear-gradient(to right, #f43f5e, #f97316)',
  'linear-gradient(to right, #1e293b, #0f172a)',
  'linear-gradient(to right, #3b82f6, #06b6d4)',
  'linear-gradient(to right, #f59e0b, #e11d48)',
  'linear-gradient(to right, #475569, #1e293b)',
];

export const KB_ID = 'notion-database-fixed-knowledge-base';

// 文案（zh）
export const T = {
  newDoc: '新建文档',
  newFolder: '新建文件夹',
  rename: '重命名',
  delete: '删除',
  move: '移动',
  trash: '移入回收站',
  restore: '恢复',
  search: '搜索',
  empty: '暂无内容',
  versions: '版本历史',
  vector: '向量索引',
  aiChat: 'AI 对话',
  toTrash: '回收站',
};

// 简易 htmlToMarkdown（@/lib/converter 在沙箱不可用，提供兜底；notion 模式保存为 html，此处仅在需要转 md 预览时使用）
export function htmlToMarkdown(html = '') {
  return String(html)
    .replace(/<h1[^>]*>/gi, '\n# ').replace(/<\/h1>/gi, '\n')
    .replace(/<h2[^>]*>/gi, '\n## ').replace(/<\/h2>/gi, '\n')
    .replace(/<h3[^>]*>/gi, '\n### ').replace(/<\/h3>/gi, '\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
