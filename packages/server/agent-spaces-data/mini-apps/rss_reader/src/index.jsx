const { useState, useEffect, useCallback } = React;
const {
  ResizablePanelGroup, ResizablePanel, ResizableHandle, Loader2,
} = window.AgentSpacesUI;
import { useRss } from './hooks/useRss.js';
import { Toolbar } from './components/Toolbar.jsx';
import { FeedList } from './components/FeedList.jsx';
import { ArticleList } from './components/ArticleList.jsx';
import { ArticleView } from './components/ArticleView.jsx';
import { AddFeedDialog } from './components/AddFeedDialog.jsx';
import { SettingsDialog } from './components/SettingsDialog.jsx';
import { DEFAULT_LAYOUT, PANEL_IDS, LAYOUT_FILE } from './utils/constants.js';

// 布局持久化：用 configs/layout.json（server-side，非 localStorage）
function usePanelLayout() {
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await window.AgentSpaces.readConfigJson(LAYOUT_FILE);
        if (!cancelled && saved && typeof saved === 'object') {
          setLayout({ ...DEFAULT_LAYOUT, ...saved });
        }
      } catch {
        // 首次无文件，用默认
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onLayoutChange = useCallback((next) => {
    setLayout(next);
    // 写盘（fire-and-forget，串行由浏览器保证即可）
    window.AgentSpaces.writeConfigJson(LAYOUT_FILE, next).catch(() => {});
  }, []);

  return { layout, onLayoutChange, ready };
}

function App() {
  const s = useRss();
  const panel = usePanelLayout();
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!s.ready) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">加载本地数据…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-background text-foreground">
      <Toolbar
        counts={s.counts}
        onOpenSettings={() => setSettingsOpen(true)}
        filter={s.filter}
        onFilterChange={(f) => s.setFilter(f === s.filter ? 'all' : f)}
        error={s.error}
        toast={s.toast}
      />
      <AddFeedDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSubmit={(url, opts) => s.addFeed(url, opts)}
        categories={s.categories}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        agentMeta={s.agentMeta}
        onConfigureAgent={s.configureAgent}
        prefs={s.prefs}
        onUpdatePrefs={s.updatePrefs}
      />
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup
          direction="horizontal"
          className="h-full w-full"
          defaultLayout={panel.ready ? panel.layout : DEFAULT_LAYOUT}
          onLayoutChange={panel.onLayoutChange}
        >
          {/* 左：订阅源 */}
          <ResizablePanel
            id={PANEL_IDS.feeds}
            defaultSize={`${DEFAULT_LAYOUT.feeds}%`}
            minSize="12%"
            maxSize="30%"
          >
            <FeedList
              feeds={s.feeds}
              selectedFeedId={s.selectedFeedId}
              counts={s.counts}
              fetchingFeedIds={s.fetchingFeedIds}
              fetchingAll={s.fetchingAll}
              onSelect={s.setSelectedFeedId}
              onFetchOne={s.fetchOne}
              onFetchAll={s.fetchAll}
              onAddClick={() => setAddOpen(true)}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />

          {/* 中：文章列表 */}
          <ResizablePanel
            id={PANEL_IDS.list}
            defaultSize={`${DEFAULT_LAYOUT.list}%`}
            minSize="15%"
            maxSize="40%"
          >
            <ArticleList
              articles={s.filteredArticles}
              selectedArticleId={s.selectedArticleId}
              filter={s.filter}
              onToggleFilter={() => s.setFilter(s.filter === 'favorite' ? 'all' : 'favorite')}
              onSelect={s.selectArticle}
              onToggleFavorite={s.toggleFavorite}
              prefs={s.prefs}
              onUpdatePrefs={s.updatePrefs}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />

          {/* 右：详情（含内联 AI 总结） */}
          <ResizablePanel
            id={PANEL_IDS.detail}
            defaultSize={`${DEFAULT_LAYOUT.detail}%`}
            minSize="30%"
            className="min-w-0 overflow-hidden"
          >
            <ArticleView
              article={s.currentArticle}
              summarizing={s.summarizingId === s.selectedArticleId}
              agentConfigId={s.agentConfigId}
              onSummarize={s.summarizeArticle}
              onToggleFavorite={s.toggleFavorite}
              onCopySummary={s.copySummary}
              fontSize={s.prefs?.fontSize}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

export default App;
