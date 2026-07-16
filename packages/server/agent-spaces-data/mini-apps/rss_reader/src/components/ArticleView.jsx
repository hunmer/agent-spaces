const {
  Button, Badge, Loader2, ScrollArea,
  Star, ExternalLink, Sparkles, Copy, FileText, AlertCircle,
} = window.AgentSpacesUI;
import { formatDate, timeAgo } from '../utils/format.js';
import { htmlToText } from '../utils/feed.js';

export function ArticleView({
  article, summarizing, agentConfigId,
  onSummarize, onToggleFavorite, onCopySummary,
}) {
  if (!article) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm p-6 text-center">
        <FileText className="h-6 w-6 opacity-50" />
        <span>从左侧选择一篇文章查看内容</span>
      </div>
    );
  }

  const body = (article.contentHtml || '').trim();
  const text = (article.contentText || htmlToText(article.contentHtml) || '').trim();
  const hasBody = !!body;
  const hasText = !!text;

  return (
    <div className="flex flex-col h-full w-full min-h-0">
      {/* 顶部元信息 + 操作 */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start gap-2">
          <h1 className="text-base font-bold leading-snug flex-1 min-w-0 break-words">
            {article.title}
          </h1>
          <button
            type="button"
            className="flex-shrink-0 text-muted-foreground hover:text-primary p-1"
            title={article.favorite ? '取消收藏' : '收藏'}
            onClick={() => onToggleFavorite(article.id)}
          >
            <Star className={'h-4 w-4 ' + (article.favorite ? 'fill-primary text-primary' : '')} />
          </button>
        </div>
        <div className="flex items-center flex-wrap gap-1.5 mt-1.5 text-[11px] text-muted-foreground">
          {article.feedTitle && (
            <Badge variant="secondary" className="text-[10px]">{article.feedTitle}</Badge>
          )}
          {article.author && <span>{article.author}</span>}
          {article.pubDate && (
            <span title={formatDate(article.pubDate)}>{timeAgo(article.pubDate)}</span>
          )}
          {article.link && (
            <a
              href={article.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 hover:text-primary ml-auto"
              onClick={(e) => e.stopPropagation()}
            >
              原文 <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-2.5">
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => onSummarize(article.id)}
            disabled={summarizing || !hasText}
            title={!agentConfigId ? '请先配置 AI 模型' : (!hasText ? '该文章无正文' : 'AI 总结')}
          >
            {summarizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            AI 总结
          </Button>
          {article.summary && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onCopySummary(article.id)}
            >
              <Copy className="h-3.5 w-3.5" /> 复制总结
            </Button>
          )}
          {!agentConfigId && (
            <span className="text-[11px] text-muted-foreground">未配置 AI 模型（右上角「配置 AI」）</span>
          )}
        </div>
      </div>

      {/* 正文 */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4">
          {hasBody ? (
            <ArticleHtml html={body} fallback={text} />
          ) : hasText ? (
            <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
              {text}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm py-10">
              <AlertCircle className="h-5 w-5 opacity-50" />
              <span>该文章正文为空，请打开原文查看</span>
              {article.link && (
                <a
                  href={article.link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  打开原文 <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// 渲染 feed 自带 HTML：直接 dangerouslySetInnerHTML，样式继承宿主
function ArticleHtml({ html, fallback }) {
  if (!html) {
    return (
      <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
        {fallback}
      </div>
    );
  }
  return (
    <div
      className="prose-article text-sm leading-relaxed text-foreground [&_a]:text-primary [&_a:hover]:underline [&_img]:max-w-full [&_img]:h-auto [&_pre]:overflow-x-auto [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
