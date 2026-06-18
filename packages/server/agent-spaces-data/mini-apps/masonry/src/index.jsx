import { useCallback, useMemo, useRef, useState } from 'react';

/**
 * Masonry 瀑布流组件 Demo
 * 集中演示 7 项能力：
 *  1) 自定义容器 + 自定义 item 内容（renderItem）
 *  2) 列数可调 + item 跨列(colSpan)/跨行(rowSpan)
 *  3) item 自定义宽高比 aspect（1:1 / 16:9 / 9:16 ...）
 *  4) 容器间距 gap 可调
 *  5) 滚动加载更多(hasMore/onLoadMore) + item 懒加载(lazy，进入视窗才渲染)
 *  6) 出/入场动画（enterAnimation/exitAnimation，可开关）
 *  7) 按 item 自定义属性排序(sortBy，排序变化平滑过渡)
 */
const { Masonry, Button, Slider, Switch, Badge } = window.AgentSpacesUI;
const { Heart, Trash2, RotateCcw, ArrowDownWideNarrow, Sparkles } = window.AgentSpacesUI;

const ASPECTS = ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2'];
const AUTHORS = ['Aria', 'Kai', 'Mira', 'Leo', 'Nova', 'Zed', 'Iris', 'Finn'];
const SORT_MODES = [
  { key: 'none', label: '默认' },
  { key: 'likes', label: '点赞↓' },
  { key: 'new', label: '最新' },
  { key: 'title', label: '标题 A-Z' },
];

let counter = 0;
function makeItem() {
  counter += 1;
  const id = `m${counter}`;
  return {
    id,
    title: `作品 #${counter}`,
    author: AUTHORS[counter % AUTHORS.length],
    likes: ((counter * 37) % 480) + 5, // 自定义属性，用于排序
    createdAt: counter, // 自定义属性，用于排序
    aspect: ASPECTS[counter % ASPECTS.length],
    colSpan: counter % 7 === 0 ? 2 : 1, // 每第 7 个跨两列
    lazy: true, // 进入视窗才渲染（演示懒加载）
    resizable: counter % 2 === 0, // 一半卡片可点击随机切换大小
    hue: (counter * 47) % 360,
  };
}

const initialItems = (n) => Array.from({ length: n }, makeItem);

function App() {
  const [items, setItems] = useState(() => initialItems(12));
  const [columns, setColumns] = useState(3);
  const [gap, setGap] = useState(16);
  const [sortMode, setSortMode] = useState('none');
  const [animate, setAnimate] = useState(true);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  const hasMore = items.length < 60;

  // 7. 排序：基于 item 自定义属性
  const sortBy = useMemo(() => {
    if (sortMode === 'likes') return { by: (i) => i.likes, order: 'desc' };
    if (sortMode === 'new') return { by: (i) => i.createdAt, order: 'desc' };
    if (sortMode === 'title') return { by: (i) => i.title, order: 'asc' };
    return undefined;
  }, [sortMode]);

  // 2/3/5. item 布局元信息：跨列 + 宽高比 + 懒加载
  const getMeta = useCallback((item) => ({
    colSpan: item.colSpan,
    aspect: item.aspect,
    lazy: item.lazy,
  }), []);
  const getKey = useCallback((item) => item.id, []);

  // 5. 滚动加载更多
  const loadMore = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      setItems((prev) => [...prev, ...initialItems(8).map((it, i) => ({ ...it, id: `${it.id}-${prev.length + i}` }))]);
      setLoading(false);
    }, 700);
  }, []);

  const removeFirst = () => setItems((prev) => prev.slice(1)); // 演示出场动画
  const reset = () => { counter = 0; setItems(initialItems(12)); };

  // 点击切换大小：随机换 aspect + 偶尔跨2列 + 换色，触发 layout 过渡动画
  const toggleSize = (id) => {
    setItems((prev) => prev.map((it) => {
      if (it.id !== id) return it;
      const others = ASPECTS.filter((a) => a !== it.aspect);
      return {
        ...it,
        aspect: others[Math.floor(Math.random() * others.length)],
        colSpan: Math.random() < 0.3 ? 2 : 1,
        hue: (it.hue + 60) % 360,
      };
    }));
  };

  // 1. 自定义 item 内容（零外网依赖的渐变卡片）
  const renderItem = (item) => (
    <div
      onClick={item.resizable ? () => toggleSize(item.id) : undefined}
      className="group relative flex h-full w-full flex-col justify-between overflow-hidden rounded-xl border border-white/20 p-3 text-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
      style={{
        background: `linear-gradient(140deg, hsl(${item.hue} 70% 62%), hsl(${(item.hue + 45) % 360} 68% 45%))`,
        cursor: item.resizable ? 'pointer' : 'default',
      }}
    >
      <div className="flex flex-wrap gap-1">
        {item.colSpan === 2 && <Badge variant="secondary" className="bg-white/85">跨2列</Badge>}
        <Badge variant="secondary" className="bg-white/70">{item.aspect}</Badge>
        {item.lazy && <Badge variant="secondary" className="bg-black/30 text-white">lazy</Badge>}
        {item.resizable && <Badge variant="secondary" className="bg-white/95 text-black">↕ 换大小</Badge>}
      </div>

      <div className="flex flex-1 items-center justify-center py-2">
        <Sparkles className="size-10 opacity-80 drop-shadow" />
      </div>

      <div>
        <div className="text-base font-bold drop-shadow">{item.title}</div>
        <div className="mt-1 flex items-center justify-between text-xs opacity-95">
          <span>@{item.author}</span>
          <span className="flex items-center gap-1">
            <Heart className="size-3 fill-white/80" />
            {item.likes}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col bg-muted/30 p-4" style={{ height: '100vh' }}>
      {/* 控制面板（固定，不滚动） */}
      <div className="mb-4 shrink-0 rounded-xl border bg-background p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <span className="w-16 text-sm font-medium">列数 {columns}</span>
            <Slider
              value={columns}
              min={1}
              max={6}
              step={1}
              onValueChange={(v) => setColumns(Array.isArray(v) ? v[0] : v)}
              className="w-28"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16 text-sm font-medium">间距 {gap}</span>
            <Slider
              value={gap}
              min={0}
              max={32}
              step={4}
              onValueChange={(v) => setGap(Array.isArray(v) ? v[0] : v)}
              className="w-28"
            />
          </div>
          <div className="flex items-center gap-2">
            <ArrowDownWideNarrow className="size-4 text-muted-foreground" />
            <div className="flex gap-1">
              {SORT_MODES.map((m) => (
                <Button
                  key={m.key}
                  size="sm"
                  variant={sortMode === m.key ? 'default' : 'outline'}
                  onClick={() => setSortMode(m.key)}
                >
                  {m.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">动画</span>
            <Switch checked={animate} onCheckedChange={setAnimate} />
          </div>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={removeFirst}>
              <Trash2 className="mr-1 size-4" />删除首个
            </Button>
            <Button size="sm" variant="outline" onClick={reset}>
              <RotateCcw className="mr-1 size-4" />重置
            </Button>
          </div>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          共 {items.length} 项 · 滚动到底部自动加载 · 点击「↕ 换大小」卡片随机切换尺寸 · 排序/列数变化平滑过渡 · 删除触发出场动画
        </div>
      </div>

      {/* 瀑布流：滚动容器用内联 style（overflow / 任意值 class 在 mini-app 不一定被编译，见 mini-app-faq.md） */}
      <div ref={scrollRef} className="flex-1" style={{ overflowY: 'auto', minHeight: 0 }}>
        <Masonry
          data={items}
          renderItem={renderItem}
          getKey={getKey}
          getMeta={getMeta}
          columns={columns}
          gap={gap}
          sortBy={sortBy}
          enterAnimation={animate}
          exitAnimation={animate}
          hasMore={hasMore}
          loading={loading}
          onLoadMore={loadMore}
          scrollContainerRef={scrollRef}
          loadMoreThreshold={300}
          lazyRootMargin="200px"
        />
      </div>
    </div>
  );
}

export default App;
