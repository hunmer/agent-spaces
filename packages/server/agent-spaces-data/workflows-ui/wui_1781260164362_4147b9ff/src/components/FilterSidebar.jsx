const { Input, Button } = window.AgentSpacesUI;
const { Search, X, Filter } = window.AgentSpacesUI;

const TYPES = [
  { value: '', label: '全部' },
  { value: 'audio', label: '音频' },
  { value: 'video', label: '视频' },
  { value: 'text', label: '文本' },
];
const SORTS = [
  { value: '', label: '默认' },
  { value: 'asc', label: '短→长' },
  { value: 'desc', label: '长→短' },
];

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
        active ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent border-border hover:border-primary/50'
      }`}
    >
      {children}
    </button>
  );
}

export default function FilterSidebar({ filter, onChange, tags, onClear }) {
  const hasFilter = filter.keyword || filter.type || filter.tag || filter.durationSort;
  const set = (patch) => onChange({ ...filter, ...patch });

  return (
    <aside className="w-full lg:w-64 shrink-0">
      <div className="rounded-lg border bg-card p-3 lg:sticky lg:top-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Filter className="size-4" />筛选
          </div>
          {hasFilter && (
            <Button size="sm" variant="ghost" className="h-7" onClick={onClear}>
              <X className="size-3.5" />清除
            </Button>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">关键词</label>
            <div className="relative mt-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={filter.keyword}
                onChange={(e) => set({ keyword: e.target.value })}
                placeholder="搜索标题/内容…"
                className="h-8 pl-7"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">类型</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {TYPES.map((t) => (
                <Chip key={t.value} active={filter.type === t.value} onClick={() => set({ type: t.value })}>
                  {t.label}
                </Chip>
              ))}
            </div>
          </div>

          {tags.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground">标签</label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Chip active={!filter.tag} onClick={() => set({ tag: '' })}>全部</Chip>
                {tags.map((t) => (
                  <Chip key={t} active={filter.tag === t} onClick={() => set({ tag: t })}>{t}</Chip>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground">时长排序</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {SORTS.map((s) => (
                <Chip key={s.value} active={filter.durationSort === s.value} onClick={() => set({ durationSort: s.value })}>
                  {s.label}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
