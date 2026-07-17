const { useState, useMemo } = React;
const {
  ScrollArea, Badge, Star, FileText, Inbox, List, LayoutGrid,
  Masonry,
} = window.AgentSpacesUI;
const { proxyImageUrl } = window.AgentSpaces;
import { timeAgo } from '../utils/format.js';
import { htmlToText, extractFirstImage, makeImageFallback } from '../utils/feed.js';

// 密度 → 列表卡片样式
const DENSITY_STYLES = {
  compact: { pad: 'px-3 py-1.5', preview: 60, gap: 'mt-0.5' },
  standard: { pad: 'px-3 py-2.5', preview: 120, gap: 'mt-0.5' },
  comfortable: { pad: 'px-3 py-4', preview: 200, gap: 'mt-1.5' },
};

export function ArticleList({
  articles, selectedArticleId,
  filter, onToggleFilter,
  onSelect, onToggleFavorite,
  prefs, onUpdatePrefs,
}) {
  const viewMode = prefs?.viewMode || 'list';
  const density = prefs?.density || 'standard';
  const ds = DENSITY_STYLES[density] || DENSITY_STYLES.standard;

  return (
    <div className="flex flex-col h-full w-full min-h-0">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">
          文章 ({articles.length})
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={
              'text-xs flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted '
              + (filter === 'favorite' ? 'text-primary' : 'text-muted-foreground')
            }
            onClick={onToggleFilter}
            title="只看收藏"
          >
            <Star className={'h-3.5 w-3.5 ' + (filter === 'favorite' ? 'fill-current' : '')} />
            收藏
          </button>
          {/* 视图切换 */}
          <div className="flex items-center rounded border border-border overflow-hidden">
            <button
              type="button"
              className={
                'p-1 ' + (viewMode === 'list'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted')
              }
              onClick={() => onUpdatePrefs({ viewMode: 'list' })}
              title="列表视图"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={
                'p-1 ' + (viewMode === 'masonry'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted')
              }
              onClick={() => onUpdatePrefs({ viewMode: 'masonry' })}
              title="瀑布流视图"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {articles.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-xs text-muted-foreground px-3 py-10 text-center flex flex-col items-center gap-1">
            <Inbox className="h-5 w-5 opacity-50" />
            <span>暂无文章</span>
            <span>点击订阅源刷新按钮，或左栏「拉取全部」</span>
          </div>
        </div>
      ) : viewMode === 'masonry' ? (
        <MasonryView
          articles={articles}
          selectedArticleId={selectedArticleId}
          onSelect={onSelect}
          onToggleFavorite={onToggleFavorite}
          density={density}
        />
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <div className="flex flex-col">
            {articles.map((a) => (
              <ListCard
                key={a.id}
                article={a}
                active={a.id === selectedArticleId}
                onSelect={() => onSelect(a.id)}
                onToggleFavorite={() => onToggleFavorite(a.id)}
                pad={ds.pad}
                previewLen={ds.preview}
                gap={ds.gap}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// —— 列表卡片 ——
function ListCard({ article, active, onSelect, onToggleFavorite, pad, previewLen, gap }) {
  const preview = (article.contentText || htmlToText(article.contentHtml) || '').slice(0, previewLen);
  return (
    <div
      className={
        'group border-b border-border cursor-pointer transition-colors ' + pad
        + (active ? ' bg-primary/10' : ' hover:bg-muted/50')
      }
      onClick={onSelect}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className={
            'text-sm leading-snug line-clamp-2 '
            + (article.readAt ? 'text-muted-foreground font-normal' : 'text-foreground font-semibold')
          }>
            {article.title}
          </div>
          {preview && (
            <div className={'text-xs text-muted-foreground line-clamp-2 ' + gap}>{preview}</div>
          )}
          <div className={'flex items-center gap-1.5 text-[11px] text-muted-foreground ' + gap}>
            {article.feedTitle && (
              <Badge variant="outline" className="px-1 py-0 text-[10px] font-normal max-w-[120px] truncate">
                {article.feedTitle}
              </Badge>
            )}
            <span>{timeAgo(article.pubDate)}</span>
          </div>
        </div>
        <button
          type="button"
          className="flex-shrink-0 text-muted-foreground hover:text-primary p-0.5"
          title={article.favorite ? '取消收藏' : '收藏'}
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
        >
          <Star className={'h-4 w-4 ' + (article.favorite ? 'fill-primary text-primary' : '')} />
        </button>
      </div>
    </div>
  );
}

// —— 瀑布流视图 ——
function MasonryView({ articles, selectedArticleId, onSelect, onToggleFavorite, density }) {
  const colHeight = density === 'compact' ? 220 : density === 'comfortable' ? 320 : 270;
  const gap = density === 'compact' ? 8 : 12;

  const getMeta = useMemo(() => () => undefined, []);

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="p-2">
        <Masonry
          data={articles}
          getKey={(a) => a.id}
          getMeta={getMeta}
          columns={{ base: 1, sm: 2, md: 2, lg: 2, xl: 3 }}
          gap={gap}
          rowHeight={colHeight}
          renderItem={(a) => (
            <MasonryCard
              article={a}
              active={a.id === selectedArticleId}
              onSelect={() => onSelect(a.id)}
              onToggleFavorite={() => onToggleFavorite(a.id)}
            />
          )}
        />
      </div>
    </ScrollArea>
  );
}

function MasonryCard({ article, active, onSelect, onToggleFavorite }) {
  const img = extractFirstImage(article.contentHtml);
  const preview = (article.contentText || htmlToText(article.contentHtml) || '').slice(0, 140);
  // 图片加载失败回退到后端代理（直连优先，失败再代理）
  const onImgError = useMemo(() => makeImageFallback(proxyImageUrl), []);
  return (
    <div
      className={
        'group h-full w-full overflow-hidden rounded-md border cursor-pointer transition-colors flex flex-col '
        + (active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 bg-card')
      }
      onClick={onSelect}
    >
      {img ? (
        <div className="w-full h-28 overflow-hidden bg-muted flex-shrink-0">
          <img
            src={img}
            alt={article.title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={onImgError}
          />
        </div>
      ) : null}
      <div className="flex-1 min-h-0 p-2.5 flex flex-col">
        <div className={
          'text-sm leading-snug line-clamp-2 '
          + (article.readAt ? 'text-muted-foreground font-normal' : 'text-foreground font-semibold')
        }>
          {article.title}
        </div>
        {preview && (
          <div className="text-xs text-muted-foreground line-clamp-3 mt-1">{preview}</div>
        )}
        <div className="flex items-center gap-1.5 mt-auto pt-2 text-[11px] text-muted-foreground">
          {article.feedTitle && (
            <Badge variant="outline" className="px-1 py-0 text-[10px] font-normal max-w-[100px] truncate">
              {article.feedTitle}
            </Badge>
          )}
          <span className="ml-auto">{timeAgo(article.pubDate)}</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-primary p-0.5"
            title={article.favorite ? '取消收藏' : '收藏'}
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          >
            <Star className={'h-3.5 w-3.5 ' + (article.favorite ? 'fill-primary text-primary' : '')} />
          </button>
        </div>
      </div>
    </div>
  );
}
