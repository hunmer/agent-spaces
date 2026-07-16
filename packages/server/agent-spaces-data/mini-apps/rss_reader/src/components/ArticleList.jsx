const { ScrollArea, Badge, Star, ExternalLink, FileText, Inbox } = window.AgentSpacesUI;
import { timeAgo } from '../utils/format.js';
import { htmlToText } from '../utils/feed.js';

export function ArticleList({
  articles, selectedArticleId,
  filter, onToggleFilter,
  onSelect, onToggleFavorite,
}) {
  return (
    <div className="flex flex-col h-full w-full min-h-0">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">
          文章 ({articles.length})
        </span>
        <button
          type="button"
          className={
            'text-xs flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted '
            + (filter === 'favorite' ? 'text-primary' : 'text-muted-foreground')
          }
          onClick={onToggleFilter}
        >
          <Star className={'h-3.5 w-3.5 ' + (filter === 'favorite' ? 'fill-current' : '')} />
          只看收藏
        </button>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col">
          {articles.length === 0 && (
            <div className="text-xs text-muted-foreground px-3 py-10 text-center flex flex-col items-center gap-1">
              <Inbox className="h-5 w-5 opacity-50" />
              <span>暂无文章</span>
              <span>点击订阅源右侧刷新按钮，或顶部「拉取全部」</span>
            </div>
          )}
          {articles.map((a) => (
            <ArticleCard
              key={a.id}
              article={a}
              active={a.id === selectedArticleId}
              onSelect={() => onSelect(a.id)}
              onToggleFavorite={() => onToggleFavorite(a.id)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function ArticleCard({ article, active, onSelect, onToggleFavorite }) {
  const preview = (article.contentText || htmlToText(article.contentHtml) || '').slice(0, 120);
  return (
    <div
      className={
        'group px-3 py-2.5 border-b border-border cursor-pointer transition-colors '
        + (active ? 'bg-primary/10' : 'hover:bg-muted/50')
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
            <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{preview}</div>
          )}
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
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
