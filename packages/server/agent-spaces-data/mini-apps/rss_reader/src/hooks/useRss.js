const { useState, useCallback, useEffect, useMemo } = React;
const {
  getUserSetting, saveUserSettings, callPluginTool, openAgentEditor, copyText,
} = window.AgentSpaces;
import {
  BUILTIN_PLUGIN, FEED_PLUGIN, FEED_ITEM_LIMIT, MAX_SUMMARY_CHARS,
  SETTING_KEYS, AGENT_INIT_NAME, AGENT_INIT_PROMPT, uid,
} from '../utils/constants.js';
import {
  normalizeItem, mergeArticles, articleKey, htmlToText,
} from '../utils/feed.js';

const get = (k, def) => getUserSetting(k, def);

export function useRss() {
  // 订阅源 + 文章 + Agent 配置（localStorage 持久化）
  const [feeds, setFeeds] = useState(() => get(SETTING_KEYS.feeds, []));
  const [articles, setArticles] = useState(() => get(SETTING_KEYS.articles, []));
  const [agentConfigId, setAgentConfigId] = useState(() => get(SETTING_KEYS.agentConfigId, ''));
  const [agentMeta, setAgentMeta] = useState(() => get(SETTING_KEYS.agentMeta, null));

  // 视图状态（不持久化）
  const [selectedFeedId, setSelectedFeedId] = useState('all'); // 'all' | feed.id
  const [selectedArticleId, setSelectedArticleId] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'favorite'
  const [fetchingFeedIds, setFetchingFeedIds] = useState(new Set()); // 单源拉取中
  const [fetchingAll, setFetchingAll] = useState(false);
  const [summarizingId, setSummarizingId] = useState(null); // 正在总结的文章 id
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // —— 新增订阅源（不立即拉取，等用户点拉取）——
  const addFeed = useCallback(async (rawUrl) => {
    const url = String(rawUrl || '').trim();
    if (!url) { setError('请输入订阅源 URL'); return false; }
    if (feeds.some((f) => f.url === url)) { setError('该订阅源已存在'); return false; }
    setError('');
    // 先拉一次拿到标题/格式，失败也加入列表（用户可重试）
    const feed = {
      id: uid('feed'),
      title: url,
      url,
      format: '',
      link: '',
      description: '',
      lastFetchAt: '',
      itemCount: 0,
      error: '',
    };
    const next = [...feeds, feed];
    setFeeds(next);
    saveUserSettings({ [SETTING_KEYS.feeds]: next });
    // 立即拉取一次填充标题
    await fetchOne(feed.id, next);
    return true;
  }, [feeds]);

  // —— 删除订阅源（同时删除其文章）——
  const removeFeed = useCallback((feedId) => {
    const nextFeeds = feeds.filter((f) => f.id !== feedId);
    const nextArticles = articles.filter((a) => a.feedId !== feedId);
    setFeeds(nextFeeds);
    setArticles(nextArticles);
    saveUserSettings({
      [SETTING_KEYS.feeds]: nextFeeds,
      [SETTING_KEYS.articles]: nextArticles,
    });
    if (selectedFeedId === feedId) setSelectedFeedId('all');
    if (selectedArticleId && !nextArticles.some((a) => a.id === selectedArticleId)) {
      setSelectedArticleId(null);
    }
    setToast('已删除订阅源');
  }, [feeds, articles, selectedFeedId, selectedArticleId]);

  // —— 调用 feed_fetch 解析单源；接收 feeds 形参避免闭包陈旧 ——
  const fetchOne = useCallback(async (feedId, feedsArg) => {
    const list = feedsArg || feeds;
    const feed = list.find((f) => f.id === feedId);
    if (!feed) return;
    setFetchingFeedIds((prev) => new Set(prev).add(feedId));
    setError('');
    try {
      const resp = await callPluginTool(FEED_PLUGIN, 'feed_fetch', {
        url: feed.url,
        limit: FEED_ITEM_LIMIT,
      });
      const data = resp && typeof resp === 'object' && 'result' in resp ? resp.result : resp;
      // callPluginTool 走 plugin execute 包装，data 通常为 { success, data: {...} }
      const payload = data?.data ?? data;
      if (data?.success === false || !payload) {
        throw new Error(data?.message || '解析失败');
      }
      const rawItems = Array.isArray(payload.feed?.items) ? payload.feed.items : [];
      const fresh = rawItems
        .map((it) => normalizeItem(it, payload.title || feed.title))
        .filter(Boolean)
        .map((it) => ({
          id: uid('art'),
          ...it,
          feedId: feed.id,
          feedTitle: payload.title || feed.title,
          favorite: false,
          readAt: '',
          summary: '',
          summaryAt: '',
        }));

      // 合并进总文章池
      setArticles((prevArticles) => {
        const merged = mergeArticles(prevArticles, fresh, feed.id);
        saveUserSettings({ [SETTING_KEYS.articles]: merged });
        return merged;
      });
      // 更新源元信息
      setFeeds((prevFeeds) => {
        const next = prevFeeds.map((f) =>
          f.id === feed.id
            ? {
                ...f,
                title: payload.title || f.title,
                format: payload.format || f.format,
                link: payload.link || f.link,
                description: payload.description || f.description,
                itemCount: payload.itemCount ?? fresh.length,
                lastFetchAt: new Date().toISOString(),
                error: '',
              }
            : f,
        );
        saveUserSettings({ [SETTING_KEYS.feeds]: next });
        return next;
      });
      setToast(`已更新「${payload.title || feed.title}」，共 ${fresh.length} 篇`);
    } catch (e) {
      const msg = e?.message || String(e);
      setFeeds((prevFeeds) => {
        const next = prevFeeds.map((f) =>
          f.id === feed.id ? { ...f, error: msg, lastFetchAt: new Date().toISOString() } : f,
        );
        saveUserSettings({ [SETTING_KEYS.feeds]: next });
        return next;
      });
      setError(`拉取「${feed.title}」失败：${msg}`);
    } finally {
      setFetchingFeedIds((prev) => {
        const n = new Set(prev);
        n.delete(feedId);
        return n;
      });
    }
  }, [feeds]);

  // —— 拉取全部订阅源（顺序执行，避免并发把服务打满）——
  const fetchAll = useCallback(async () => {
    if (!feeds.length) { setError('请先添加订阅源'); return; }
    setFetchingAll(true);
    setError('');
    try {
      for (const f of feeds) {
        // eslint-disable-next-line no-await-in-loop
        await fetchOne(f.id, feeds);
      }
      setToast(`已拉取全部 ${feeds.length} 个订阅源`);
    } finally {
      setFetchingAll(false);
    }
  }, [feeds, fetchOne]);

  // —— 收藏 / 取消收藏 ——
  const toggleFavorite = useCallback((articleId) => {
    setArticles((prev) => {
      const next = prev.map((a) =>
        a.id === articleId ? { ...a, favorite: !a.favorite } : a,
      );
      saveUserSettings({ [SETTING_KEYS.articles]: next });
      return next;
    });
  }, []);

  // —— 标记已读（选中时调用）——
  const markRead = useCallback((articleId) => {
    setArticles((prev) => {
      let changed = false;
      const next = prev.map((a) => {
        if (a.id === articleId && !a.readAt) {
          changed = true;
          return { ...a, readAt: new Date().toISOString() };
        }
        return a;
      });
      if (changed) saveUserSettings({ [SETTING_KEYS.articles]: next });
      return changed ? next : prev;
    });
  }, []);

  const selectArticle = useCallback((articleId) => {
    setSelectedArticleId(articleId);
    if (articleId) markRead(articleId);
  }, [markRead]);

  // —— 配置 Agent（弹窗返回 preset）——
  const configureAgent = useCallback(async () => {
    try {
      const saved = await openAgentEditor({
        initialName: AGENT_INIT_NAME,
        initialPrompt: AGENT_INIT_PROMPT,
        agentId: agentConfigId || undefined,
      });
      if (!saved) return;
      const meta = { name: saved.name || AGENT_INIT_NAME, modelProvider: saved.modelProvider };
      setAgentMeta(meta);
      setAgentConfigId(saved.id);
      saveUserSettings({
        [SETTING_KEYS.agentConfigId]: saved.id,
        [SETTING_KEYS.agentMeta]: meta,
      });
      setError('');
    } catch (e) {
      setError('打开模型配置失败：' + (e?.message || e));
    }
  }, [agentConfigId]);

  // —— AI 总结文章 ——
  const summarizeArticle = useCallback(async (articleId) => {
    const article = articles.find((a) => a.id === articleId);
    if (!article) return;
    if (!agentConfigId) { setError('请先点击「配置 AI 模型」'); return; }
    setSummarizingId(articleId);
    setError('');
    try {
      const body = (article.contentText || htmlToText(article.contentHtml) || '').trim();
      if (!body) throw new Error('该文章没有可总结的正文');
      const prompt = [
        '请用中文总结下面这篇文章。',
        '',
        '输出格式：',
        '1. 一句话核心观点',
        '2. 3~5 条要点（每条一行，以「- 」开头）',
        '3. 一句阅读建议',
        '',
        `标题：${article.title}`,
        `来源：${article.feedTitle || ''}`,
        '',
        '正文：',
        body.slice(0, MAX_SUMMARY_CHARS),
      ].join('\n');

      const taskId = `rss-summary-${articleId}-${Date.now()}`;
      const ret = await callPluginTool(
        BUILTIN_PLUGIN,
        'agent_run',
        { prompt, agentConfigId, permissionMode: 'bypassPermissions' },
        { taskId, meta: { mode: 'summary', title: article.title } },
      );
      const text = (ret && (ret.result ?? ret)) || '';
      if (!String(text).trim()) throw new Error('AI 未返回有效总结');
      const summary = String(text).trim();
      const summaryAt = new Date().toISOString();
      setArticles((prev) => {
        const next = prev.map((a) =>
          a.id === articleId ? { ...a, summary, summaryAt } : a,
        );
        saveUserSettings({ [SETTING_KEYS.articles]: next });
        return next;
      });
      setToast('总结完成');
    } catch (e) {
      setError('总结失败：' + (e?.message || e));
    } finally {
      setSummarizingId(null);
    }
  }, [articles, agentConfigId]);

  const copySummary = useCallback((articleId) => {
    const a = articles.find((x) => x.id === articleId);
    if (!a?.summary) return;
    Promise.resolve(copyText?.(a.summary)).then(
      () => setToast('已复制总结'),
      () => setError('复制失败'),
    );
  }, [articles]);

  // —— 派生：当前过滤后的文章列表 ——
  const filteredArticles = useMemo(() => {
    let list = articles;
    if (selectedFeedId !== 'all') list = list.filter((a) => a.feedId === selectedFeedId);
    if (filter === 'favorite') list = list.filter((a) => a.favorite);
    // 按发布时间倒序
    return [...list].sort((a, b) => (b.pubDate || '').localeCompare(a.pubDate || ''));
  }, [articles, selectedFeedId, filter]);

  const currentArticle = useMemo(
    () => articles.find((a) => a.id === selectedArticleId) || null,
    [articles, selectedArticleId],
  );

  const counts = useMemo(() => {
    const byFeed = new Map();
    let fav = 0;
    for (const a of articles) {
      byFeed.set(a.feedId, (byFeed.get(a.feedId) || 0) + 1);
      if (a.favorite) fav += 1;
    }
    return { byFeed, favorite: fav, total: articles.length };
  }, [articles]);

  // toast 自动消失
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  return {
    // state
    feeds, articles, agentConfigId, agentMeta,
    selectedFeedId, selectedArticleId, filter,
    fetchingFeedIds, fetchingAll, summarizingId,
    error, toast, counts,
    // derived
    filteredArticles, currentArticle,
    // actions
    setSelectedFeedId, setFilter,
    addFeed, removeFeed, fetchOne, fetchAll,
    selectArticle, toggleFavorite, markRead,
    configureAgent, summarizeArticle, copySummary,
  };
}
