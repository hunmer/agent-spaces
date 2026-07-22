/**
 * 已选提示词展示条：从提示词库选中后，以可折叠/可清除的标签形式展示，
 * 不污染用户输入框；提交时由调用方把 pickedPrompt 与用户输入合并。
 *
 * @param {{ pickedPrompt?: string, onClear:()=>void }} props
 *   - pickedPrompt: 选中的提示词正文（空/undefined 时不渲染）
 *   - onClear:      点击 ✕ 清除选中
 */
export default function PickedPromptBadge({ pickedPrompt, onClear }) {
  const text = (pickedPrompt || '').trim();
  if (!text) return null;
  return (
    <div className="flex items-start gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5">
      <span className="shrink-0 text-xs leading-5 text-primary">📎 已选提示词</span>
      <p className="line-clamp-3 flex-1 font-mono text-[11px] leading-relaxed text-muted-foreground">
        {text}
      </p>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClear?.(); }}
        className="shrink-0 rounded p-0.5 text-xs text-muted-foreground transition hover:text-red-500"
        title="清除选中"
      >
        ✕
      </button>
    </div>
  );
}
