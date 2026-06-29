// 右侧图库：过滤栏（类型 chip + 风格 Select + 模型 Select + prompt 关键词）+ 网格 + 空状态
import StickerCard from './StickerCard';
import { STICKER_STYLES } from '../utils/styles';

const { Button, Badge, History, Trash2, ImageOff, Search, X, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } = window.AgentSpacesUI;

// 生成类型选项
const KIND_FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'text_to_image', label: '文生图' },
  { value: 'edit_image', label: '图生图' },
  { value: 'split', label: '拆分' },
];

export default function Gallery({ history, running, onPreview, onDelete, onClear, onSplit, splittingIds }) {
  const [kindFilter, setKindFilter] = React.useState('all');
  const [styleFilter, setStyleFilter] = React.useState('all');
  const [modelFilter, setModelFilter] = React.useState('all');
  const [keyword, setKeyword] = React.useState('');

  // 从 history 动态收集出现过的风格和模型（带名称）
  const { styleOptions, modelOptions, counts } = React.useMemo(() => {
    const styles = new Map();   // styleId -> styleName
    const models = new Map();   // model -> model
    const c = { all: history.length, text_to_image: 0, edit_image: 0, split: 0 };
    history.forEach((item) => {
      if (item.styleId && item.styleName) styles.set(item.styleId, item.styleName);
      else if (item.styleId) styles.set(item.styleId, item.styleId);
      else if (item.styleName) styles.set(`__${item.styleName}`, item.styleName);
      if (item.model) models.set(item.model, item.model);
      if (c[item.kind] !== undefined) c[item.kind] += 1;
    });
    return {
      styleOptions: [...styles.entries()].map(([value, label]) => ({ value, label })),
      modelOptions: [...models.entries()].map(([value, label]) => ({ value, label })),
      counts: c,
    };
  }, [history]);

  // 过滤：类型 + 风格 + 模型 + 关键词（仅匹配 prompt）
  const filtered = React.useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return history.filter((item) => {
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
      if (styleFilter !== 'all') {
        const idMatch = item.styleId === styleFilter;
        const nameMatch = styleFilter.startsWith('__') && item.styleName === styleFilter.slice(2);
        if (!idMatch && !nameMatch) return false;
      }
      if (modelFilter !== 'all' && item.model !== modelFilter) return false;
      if (kw && !String(item.prompt || '').toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [history, kindFilter, styleFilter, modelFilter, keyword]);

  return (
    <section className="sg-gallery">
      <div className="sg-gallery-head">
        <div className="sg-gallery-title">
          <History className="sg-icon-sm" />
          <span>我的贴图</span>
          <Badge variant="secondary">{history.length}</Badge>
        </div>
        <Button size="sm" variant="outline" onClick={onClear} disabled={!history.length || running}>
          <Trash2 className="sg-icon-xs" /> 清空
        </Button>
      </div>

      {/* 过滤栏 */}
      {history.length > 0 && (
        <div className="sg-filter-bar">
          <div className="sg-filter-row">
            <div className="sg-filter-kinds">
              {KIND_FILTERS.map((k) => (
                <button
                  type="button"
                  key={k.value}
                  className={`sg-filter-chip${kindFilter === k.value ? ' is-active' : ''}`}
                  onClick={() => setKindFilter(k.value)}
                  disabled={counts[k.value] === 0 && k.value !== 'all'}
                >
                  {k.label}
                  <span className="sg-filter-count">{counts[k.value] || 0}</span>
                </button>
              ))}
            </div>
            <div className="sg-filter-selects">
              <Select value={styleFilter} onValueChange={setStyleFilter}>
                <SelectTrigger className="sg-filter-select"><SelectValue placeholder="风格" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部风格</SelectItem>
                  {styleOptions.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={modelFilter} onValueChange={setModelFilter}>
                <SelectTrigger className="sg-filter-select"><SelectValue placeholder="模型" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部模型</SelectItem>
                  {modelOptions.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="sg-filter-search">
            <Search className="sg-icon-xs sg-filter-search-icon" />
            <input
              type="text"
              className="sg-filter-input"
              placeholder="搜索提示词..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            {keyword && (
              <button type="button" className="sg-filter-clear" onClick={() => setKeyword('')} title="清除">
                <X className="sg-icon-xs" />
              </button>
            )}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="sg-empty">
          <ImageOff className="sg-icon-lg" />
          {history.length === 0 ? (
            <>
              <p className="sg-empty-title">还没有贴图</p>
              <p className="sg-empty-desc">在左侧输入提示词、选择风格，点击「生成贴图」开始创作</p>
            </>
          ) : (
            <>
              <p className="sg-empty-title">没有匹配的贴图</p>
              <p className="sg-empty-desc">尝试切换过滤条件或修改搜索关键词</p>
            </>
          )}
        </div>
      ) : (
        <div className="sg-grid">
          {filtered.map((item) => (
            <StickerCard
              key={item.id}
              item={item}
              onPreview={onPreview}
              onDelete={onDelete}
              onSplit={onSplit}
              splitting={onSplit && splittingIds?.has(item.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
