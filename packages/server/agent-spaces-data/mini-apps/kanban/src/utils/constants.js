// id 生成：crypto.randomUUID 优先，回退 Date.now+random
export function genId(prefix) {
  const g = globalThis.crypto;
  const uid = g?.randomUUID ? g.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}_${uid}`;
}

export const PRIORITY_OPTIONS = ['low', 'medium', 'high'];
export const LAYOUT_MODES = ['horizontal', 'vertical'];
export const COLUMN_COLORS = ['sky', 'amber', 'emerald', 'rose', 'purple', 'slate'];
