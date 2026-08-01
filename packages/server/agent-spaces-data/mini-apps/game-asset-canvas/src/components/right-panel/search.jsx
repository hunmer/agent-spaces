// 右侧面板共享：拼音匹配 + 通用搜索栏。
// 三个 tab（新增节点/节点管理/生成记录）共用本文件。
import { Search } from '@agent-spaces/ui';
import { pinyinParse } from '@agent-spaces/ui';

// 拼音搜索：对每个 label 预计算「全拼」和「首字母串」（type 2=中文取首字母，非中文原样保留以兼容英文/数字）。
// 去除空白后再拼，避免「GIF 拆帧」的空格把首字母串断成 'gif cz' 导致 'gifcz' 匹配不上。
// 例：「GIF 拆帧」→ full='gifchaizhen'，initials='gifcz'；「文字生成图片」→ full='wenzishengchengtupian'，initials='wzsctp'。
const _pinyinCache = new Map();
export function getPinyinKeys(label) {
  if (!pinyinParse || typeof pinyinParse !== 'function') return null;
  if (_pinyinCache.has(label)) return _pinyinCache.get(label);
  let full = '';
  let initials = '';
  for (const t of pinyinParse(label)) {
    full += t.target;
    initials += t.type === 2 ? (t.target[0] || '') : t.target;
  }
  const result = { full: full.replace(/\s+/g, '').toLowerCase(), initials: initials.replace(/\s+/g, '').toLowerCase() };
  _pinyinCache.set(label, result);
  return result;
}

// 通用文本匹配：空 query 命中；否则试「原文子串 / 全拼 / 首字母」(大小写不敏感，均去空白)。
// NodeList/HistoryList 等无 label 的场景直接传 text；AddNodeList 的 matchNode 转调本函数。
export function matchText(text, query) {
  const q = (query || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!q) return true;
  if (typeof text !== 'string' || !text) return false;
  if (text.toLowerCase().replace(/\s+/g, '').includes(q)) return true;
  const pk = getPinyinKeys(text);
  if (!pk) return false;
  return pk.full.includes(q) || pk.initials.includes(q);
}

// 节点匹配：matchNode 转调 matchText，保持 AddNodeList 调用不变。
export function matchNode(item, query) {
  return matchText(item.label, query);
}

// 通用搜索栏：搜索图标 + 受控 input + 清除按钮。三个 tab（新增节点/节点管理/生成记录）共用。
export function SearchBar({ value, onChange, placeholder }) {
  const hasValue = (value || '').trim().length > 0;
  return (
    <div className="nodrag nopan nowheel border-b border-border p-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || '搜索'}
          className="h-7 w-full rounded-md border border-border bg-background pl-7 pr-7 text-xs outline-none transition focus:border-primary"
        />
        {hasValue && (
          <button
            type="button"
            onClick={() => onChange('')}
            title="清除搜索"
            className="absolute right-1.5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition hover:text-foreground"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
