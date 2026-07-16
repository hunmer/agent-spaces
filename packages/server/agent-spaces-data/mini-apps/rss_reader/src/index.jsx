import { useRss } from './hooks/useRss.js';
import { Toolbar } from './components/Toolbar.jsx';
import { FeedList } from './components/FeedList.jsx';
import { ArticleList } from './components/ArticleList.jsx';
import { ArticleView } from './components/ArticleView.jsx';
import { SummaryPanel } from './components/SummaryPanel.jsx';

function App() {
  const s = useRss();

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
      <div className="flex flex-1 min-h-0">
        {/* 左：订阅源 */}
        <div className="w-56 flex-shrink-0 border-r border-border min-h-0 hidden sm:flex sm:flex-col">
          <FeedList
            feeds={s.feeds}
            selectedFeedId={s.selectedFeedId}
            counts={s.counts}
            fetchingFeedIds={s.fetchingFeedIds}
            onSelect={s.setSelectedFeedId}
            onRemove={s.removeFeed}
            onFetchOne={s.fetchOne}
          />
        </div>
        {/* 中：文章列表 */}
        <div className="w-72 flex-shrink-0 border-r border-border min-h-0 hidden md:flex md:flex-col">
          <ArticleList
            articles={s.filteredArticles}
            selectedArticleId={s.selectedArticleId}
            filter={s.filter}
            onToggleFilter={() => s.setFilter(s.filter === 'favorite' ? 'all' : 'favorite')}
            onSelect={s.selectArticle}
            onToggleFavorite={s.toggleFavorite}
          />
        </div>
        {/* 右：详情 */}
        <div className="flex-1 min-w-0 min-h-0">
          <ArticleView
            article={s.currentArticle}
            summarizing={s.summarizingId === s.selectedArticleId}
            agentConfigId={s.agentConfigId}
            onSummarize={s.summarizeArticle}
            onToggleFavorite={s.toggleFavorite}
          />
        </div>
        {/* 最右：AI 总结 */}
        <div className="w-80 flex-shrink-0 border-l border-border min-h-0 hidden lg:flex lg:flex-col">
          <SummaryPanel
            article={s.currentArticle}
            summarizing={s.summarizingId === s.selectedArticleId}
            agentConfigId={s.agentConfigId}
            onSummarize={s.summarizeArticle}
            onCopySummary={s.copySummary}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
