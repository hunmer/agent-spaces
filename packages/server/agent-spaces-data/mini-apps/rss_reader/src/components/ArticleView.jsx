const { useState, useEffect, useRef, useCallback } = React;
const {
  Button, Badge, Loader2, ScrollArea,
  Star, ExternalLink, Sparkles, Copy, FileText, AlertCircle,
  openMediaGallery,
} = window.AgentSpacesUI;
import { formatDate, timeAgo } from '../utils/format.js';
import { htmlToText } from '../utils/feed.js';

export function ArticleView({
  article, summarizing, agentConfigId,
  onSummarize, onToggleFavorite, onCopySummary,
  fontSize,
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
            title={!agentConfigId ? '请先在「设置」配置 AI 模型' : (!hasText ? '该文章无正文' : (article.summary ? '重新总结' : 'AI 总结'))}
          >
            {summarizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {article.summary ? '重新总结' : 'AI 总结'}
          </Button>
          {article.summary && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onCopySummary(article.id)}
            >
              <Copy className="h-3.5 w-3.5" /> 复制
            </Button>
          )}
          {!agentConfigId && (
            <span className="text-[11px] text-muted-foreground">未配置 AI 模型（右上角「设置」）</span>
          )}
        </div>
      </div>

      {/* 正文（含内联 AI 总结卡片） */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4">
          {/* AI 总结内容卡片（正文上方，随正文一起滚动，不挤压正文） */}
          {(article.summary || summarizing) && (
            <div className="mb-4 rounded-md border border-primary/40 bg-primary/5 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold">AI 总结</span>
                {article.summaryAt && !summarizing && (
                  <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(article.summaryAt)}</span>
                )}
              </div>
              {summarizing ? (
                <div className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  正在生成总结…
                </div>
              ) : (
                <div
                  className="text-sm leading-relaxed whitespace-pre-wrap text-foreground"
                  style={{ fontSize: `${fontSize}px` }}
                >
                  {article.summary}
                </div>
              )}
            </div>
          )}

          {hasBody ? (
            <ArticleHtml html={body} fallback={text} fontSize={fontSize} />
          ) : hasText ? (
            <div
              className="leading-relaxed whitespace-pre-wrap text-foreground"
              style={{ fontSize: `${fontSize}px` }}
            >
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

// 渲染 feed 自带 HTML：样式继承宿主，图片点击可放大查看
function ArticleHtml({ html, fallback, fontSize = 15 }) {
  const ref = useRef(null);

  // 点击图片 → 收集正文所有图片 → 打开 media-gallery 大图查看
  const onImageClick = useCallback((e) => {
    const target = e.target;
    if (!target || target.tagName !== 'IMG') return;
    const root = ref.current;
    if (!root) return;
    const imgs = Array.from(root.querySelectorAll('img'));
    if (!imgs.length) return;
    const items = imgs
      .map((im) => ({ src: im.currentSrc || im.src, alt: im.alt || '' }))
      .filter((it) => it.src);
    if (!items.length) return;
    const clickedSrc = target.currentSrc || target.src;
    const startIndex = Math.max(0, items.findIndex((it) => it.src === clickedSrc));
    e.preventDefault();
    openMediaGallery(items, startIndex);
  }, []);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.addEventListener('click', onImageClick);
    return () => root.removeEventListener('click', onImageClick);
  }, [onImageClick, html]);

  if (!html) {
    return (
      <div
        className="leading-relaxed whitespace-pre-wrap text-foreground"
        style={{ fontSize: `${fontSize}px` }}
      >
        {fallback}
      </div>
    );
  }
  return (
    <div
      ref={ref}
      className="prose-article leading-relaxed text-foreground [&_a]:text-primary [&_a:hover]:underline [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded [&_img]:cursor-zoom-in [&_pre]:overflow-x-auto [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground"
      style={{ fontSize: `${fontSize}px` }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
