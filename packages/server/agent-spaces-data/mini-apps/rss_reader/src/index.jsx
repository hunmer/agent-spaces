const { useState, useMemo, useCallback } = React;
const {
  ResizablePanelGroup, ResizablePanel, ResizableHandle,
} = window.AgentSpacesUI;
import { useRss } from './hooks/useRss.js';
import { Toolbar } from './components/Toolbar.jsx';
import { FeedList } from './components/FeedList.jsx';
import { ArticleList } from './components/ArticleList.jsx';
import { ArticleView } from './components/ArticleView.jsx';
import { SummaryPanel } from './components/SummaryPanel.jsx';
import { LAYOUT_KEY, DEFAULT_LAYOUT, PANEL_IDS } from './utils/constants.js';

// 布局持久化：getUserSetting/saveUserSettings（per-project localStorage）
const loadLayout = () => {
  const raw = window.AgentSpaces.getUserSetting(LAYOUT_KEY, null);
  if (raw && typeof raw === 'object') {
    // 合并默认值，避免新增面板时缺字段
    return { ...DEFAULT_LAYOUT, ...raw };
  }
  return DEFAULT_LAYOUT;
};

function App() {
  const s = useRss();

  const defaultLayout = useMemo(() => loadLayout(), []);
  const onLayoutChange = useCallback((layout) => {
    window.AgentSpaces.saveUserSettings({ [LAYOUT_KEY]: layout });
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0 bg-background text-foreground">
      <Toolbar
        counts={s.counts}
        fetchingAll={s.fetchingAll}
        agentMeta={s.agentMeta}
        onAdd={s.addFeed}
        onFetchAll={s.fetchAll}
        onConfigureAgent={s.configureAgent}
        filter={s.filter}
        onFilterChange={(f) => s.setFilter(f === s.filter ? 'all' : f)}
        error={s.error}
        toast={s.toast}
      />
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup
          direction="horizontal"
          className="h-full w-full"
          defaultLayout={defaultLayout}
          onLayoutChange={onLayoutChange}
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
              onSelect={s.setSelectedFeedId}
              onRemove={s.removeFeed}
              onFetchOne={s.fetchOne}
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
            />
          </ResizablePanel>
          <ResizableHandle withHandle />

          {/* 右：详情 */}
          <ResizablePanel
            id={PANEL_IDS.detail}
            defaultSize={`${DEFAULT_LAYOUT.detail}%`}
            minSize="20%"
            className="min-w-0 overflow-hidden"
          >
            <ArticleView
              article={s.currentArticle}
              summarizing={s.summarizingId === s.selectedArticleId}
              agentConfigId={s.agentConfigId}
              onSummarize={s.summarizeArticle}
              onToggleFavorite={s.toggleFavorite}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />

          {/* 最右：AI 总结 */}
          <ResizablePanel
            id={PANEL_IDS.summary}
            defaultSize={`${DEFAULT_LAYOUT.summary}%`}
            minSize="15%"
            maxSize="45%"
          >
            <SummaryPanel
              article={s.currentArticle}
              summarizing={s.summarizingId === s.selectedArticleId}
              agentConfigId={s.agentConfigId}
              onSummarize={s.summarizeArticle}
              onCopySummary={s.copySummary}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

export default App;
