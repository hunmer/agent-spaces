const {
  Button, Badge, Loader2, ScrollArea,
  Sparkles, Copy, FileText,
} = window.AgentSpacesUI;
import { timeAgo } from '../utils/format.js';

// 独立的 AI 总结面板（最右侧第四栏）
export function SummaryPanel({
  article, summarizing, agentConfigId,
  onSummarize, onCopySummary,
}) {
  const hasArticle = !!article;
  const hasSummary = hasArticle && !!article.summary;

  return (
    <div className="flex flex-col h-full w-full min-h-0">
      <div className="px-3 py-2 border-b border-border flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold">AI 总结</span>
        {hasSummary && article.summaryAt && (
          <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(article.summaryAt)}</span>
        )}
      </div>

      {/* 操作区 */}
      <div className="px-3 py-2 border-b border-border flex items-center gap-1.5 flex-wrap">
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() => onSummarize(article?.id)}
          disabled={!hasArticle || summarizing || !article?.contentText}
          title={!agentConfigId ? '请先配置 AI 模型' : (!hasArticle ? '请先选择文章' : '生成 AI 总结')}
        >
          {summarizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {hasSummary ? '重新总结' : '生成总结'}
        </Button>
        {hasSummary && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onCopySummary(article.id)}>
            <Copy className="h-3.5 w-3.5" /> 复制
          </Button>
        )}
        {!agentConfigId && (
          <span className="text-[11px] text-muted-foreground w-full">未配置 AI 模型（顶部「配置 AI」）</span>
        )}
      </div>

      {/* 内容区 */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3">
          {!hasArticle ? (
            <Empty text="从左侧选择文章后，点击「生成总结」" />
          ) : !hasSummary ? (
            <Empty text={summarizing ? '正在生成总结…' : '尚无总结，点击上方「生成总结」'} />
          ) : (
            <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
              {article.title && (
                <div className="text-xs font-semibold mb-2 text-foreground line-clamp-2">
                  {article.title}
                </div>
              )}
              {article.feedTitle && (
                <Badge variant="secondary" className="text-[10px] mb-2">{article.feedTitle}</Badge>
              )}
              <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                {article.summary}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="flex flex-col items-center gap-2 text-muted-foreground text-xs py-10 text-center">
      <FileText className="h-5 w-5 opacity-50" />
      <span>{text}</span>
    </div>
  );
}
