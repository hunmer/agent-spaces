const { useState, useCallback, useEffect, useMemo, useRef } = React;
const {
  callPluginTool, openAgentEditor, copyText,
  readConfigJson, writeConfigJson,
} = window.AgentSpaces;
import {
  BUILTIN_PLUGIN, FEED_PLUGIN, FEED_ITEM_LIMIT, MAX_SUMMARY_CHARS,
  CONFIG_FILES, AGENT_INIT_NAME, AGENT_INIT_PROMPT, uid, feedArticlesFile,
} from '../utils/constants.js';
import {
  normalizeItem, articleKey, htmlToText,
} from '../utils/feed.js';

// 单源内合并：保留老文章的用户态（favorite/readAt/summary），新文章追加。
// 跨源已物理隔离（各源独立文件），此处只在单源内去重。
function mergeFeedItems(oldItems, fresh) {
  const map = new Map();
  for (const a of oldItems) map.set(articleKey(a), a);
  const seen = new Set();
  const out = [];
  for (const f of fresh) {
    const key = articleKey(f);
    const prev = map.get(key);
    out.push(prev ? { ...prev, ...f } : { ...f });
    seen.add(key);
  }
  for (const a of oldItems) {
    const key = articleKey(a);
    if (!seen.has(key)) { out.push(a); seen.add(key); }
  }
  return out;
}

export function useRss() {
  const [feeds, setFeeds] = useState([]);
  const [articlesByFeed, setArticlesByFeed] = useState({}); // { [feedId]: Article[] }
  const [agentConfigId, setAgentConfigId] = useState('');
  const [agentMeta, setAgentMeta] = useState(null);
  const [ready, setReady] = useState(false);

  const [selectedFeedId, setSelectedFeedId] = useState('all');
  const [selectedArticleId, setSelectedArticleId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [fetchingFeedIds, setFetchingFeedIds] = useState(new Set());
  const [fetchingAll, setFetchingAll] = useState(false);
  const [summarizingId, setSummarizingId] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // —— 文件级写入器（每文件串行，互不影响）——
  const writeQueues = useRef({}); // { [file]: Promise }
  const writeConfig = useCallback((file, value) => {
    if (!writeQueues.current[file]) writeQueues.current[file] = Promise.resolve();
    writeQueues.current[file] = writeQueues.current[file].then(async () => {
      try {
        await writeConfigJson(file, value);
      } catch (e) {
        setError('保存失败：' + (e?.message || e));
      }
    });
    return writeQueues.current[file];
  }, []);

  // 读单个源的文章文件
  const readFeedArticles = useCallback(async (feedId) => {
    try {
      return (await readConfigJson(feedArticlesFile(feedId))) || [];
    } catch {
      return [];
    }
  }, []);

  // 写单个源的文章文件
  const writeFeedArticles = useCallback((feedId, items) => {
    return writeConfig(feedArticlesFile(feedId), items);
  }, [writeConfig]);

  // —— 启动：并行读 feeds.json + agent.json + 所有源文章文件 ——
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [savedFeeds, savedAgent] = await Promise.all([
          readConfigJson(CONFIG_FILES.feeds).catch(() => null),
          readConfigJson(CONFIG_FILES.agent).catch(() => null),
        ]);
        if (cancelled) return;
        const feedList = Array.isArray(savedFeeds) ? savedFeeds : [];
        const agent = (savedAgent && typeof savedAgent === 'object') ? savedAgent : {};
        // 并行读各源文章
        const entries = await Promise.all(
          feedList.map(async (f) => [f.id, await readFeedArticles(f.id)]),
        );
        if (cancelled) return;
        const byFeed = {};
        for (const [id, items] of entries) byFeed[id] = items;
        setFeeds(feedList);
        setArticlesByFeed(byFeed);
        setAgentConfigId(agent.agentConfigId || '');
        setAgentMeta(agent.agentMeta || null);
      } catch (e) {
        setError('读取本地数据失败：' + (e?.message || e));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [readFeedArticles]);

  // —— 拉取单源：只读写该源的 feed_<id>.json，绝不碰其他源 ——
  const fetchOne = useCallback(async (feedId) => {
    const feed = feeds.find((f) => f.id === feedId);
    if (!feed) return;
    setFetchingFeedIds((prev) => new Set(prev).add(feedId));
    setError('');
    try {
      const resp = await callPluginTool(FEED_PLUGIN, 'feed_fetch', {
        url: feed.url,
        limit: FEED_ITEM_LIMIT,
      });
      const data = resp && typeof resp === 'object' && 'result' in resp ? resp.result : resp;
      const payload = data?.data ?? data;
      if (data?.success === false || !payload) {
        throw new Error(data?.message || '解析失败');
      }
      const rawItems = Array.isArray(payload.feed?.items) ? payload.feed.items : [];
      const feedTitle = payload.title || feed.title;
      const fresh = rawItems
        .map((it) => normalizeItem(it, feedTitle))
        .filter(Boolean)
        .map((it) => ({
          id: uid('art'),
          ...it,
          feedId,
          feedTitle,
          favorite: false,
          readAt: '',
          summary: '',
          summaryAt: '',
        }));

      // 只读该源已有文章 → 合并 → 只写该源文件（物理隔离，杜绝覆盖其他源）
      const oldItems = await readFeedArticles(feedId);
      const merged = mergeFeedItems(oldItems, fresh);

      // 更新源元信息
      const nextFeeds = feeds.map((f) =>
        f.id === feedId
          ? {
              ...f,
              title: feedTitle,
              format: payload.format || f.format,
              link: payload.link || f.link,
              description: payload.description || f.description,
              itemCount: payload.itemCount ?? fresh.length,
              lastFetchAt: new Date().toISOString(),
              error: '',
            }
          : f,
      );

      setFeeds(nextFeeds);
      setArticlesByFeed((prev) => ({ ...prev, [feedId]: merged }));
      // feeds.json 与 feed_<id>.json 是两个不同文件，各自串行写，互不干扰
      writeConfig(CONFIG_FILES.feeds, nextFeeds);
      writeFeedArticles(feedId, merged);
      setToast(`已更新「${feedTitle}」，${fresh.length} 篇`);
    } catch (e) {
      const msg = e?.message || String(e);
      const nextFeeds = feeds.map((f) =>
        f.id === feedId ? { ...f, error: msg, lastFetchAt: new Date().toISOString() } : f,
      );
      setFeeds(nextFeeds);
      writeConfig(CONFIG_FILES.feeds, nextFeeds);
      setError(`拉取「${feed.title}」失败：${msg}`);
    } finally {
      setFetchingFeedIds((prev) => {
        const n = new Set(prev);
        n.delete(feedId);
        return n;
      });
    }
  }, [feeds, readFeedArticles, writeConfig, writeFeedArticles]);

  // —— 新增订阅源 ——
  const addFeed = useCallback(async (rawUrl) => {
    const url = String(rawUrl || '').trim();
    if (!url) { setError('请输入订阅源 URL'); return false; }
    if (feeds.some((f) => f.url === url)) { setError('该订阅源已存在'); return false; }
    setError('');
    const feed = { id: uid('feed'), title: url, url, format: '', link: '', description: '', lastFetchAt: '', itemCount: 0, error: '' };
    const nextFeeds = [...feeds, feed];
    setFeeds(nextFeeds);
    setArticlesByFeed((prev) => ({ ...prev, [feed.id]: [] }));
    await writeConfig(CONFIG_FILES.feeds, nextFeeds);
    await fetchOne(feed.id);
    return true;
  }, [feeds, writeConfig, fetchOne]);

  // —— 删除订阅源（连同其文章文件）——
  const removeFeed = useCallback((feedId) => {
    const nextFeeds = feeds.filter((f) => f.id !== feedId);
    setFeeds(nextFeeds);
    setArticlesByFeed((prev) => {
      const next = { ...prev };
      delete next[feedId];
      return next;
    });
    writeConfig(CONFIG_FILES.feeds, nextFeeds);
    writeFeedArticles(feedId, []); // 清空该源文章文件
    if (selectedFeedId === feedId) setSelectedFeedId('all');
    if (selectedArticleId) {
      const belonged = (articlesByFeed[feedId] || []).some((a) => a.id === selectedArticleId);
      if (belonged) setSelectedArticleId(null);
    }
    setToast('已删除订阅源');
  }, [feeds, articlesByFeed, selectedFeedId, selectedArticleId, writeConfig, writeFeedArticles]);

  // —— 拉取全部 ——
  const fetchAll = useCallback(async () => {
    if (!feeds.length) { setError('请先添加订阅源'); return; }
    setFetchingAll(true);
    setError('');
    try {
      const list = feeds.slice();
      for (const f of list) {
        // eslint-disable-next-line no-await-in-loop
        await fetchOne(f.id);
      }
      setToast(`已拉取全部 ${list.length} 个订阅源`);
    } finally {
      setFetchingAll(false);
    }
  }, [feeds, fetchOne]);

  // 在所有源文章中查找（用于总结/复制）
  const findArticle = useCallback((articleId) => {
    for (const items of Object.values(articlesByFeed)) {
      const a = items.find((x) => x.id === articleId);
      if (a) return a;
    }
    return null;
  }, [articlesByFeed]);

  // 更新单篇文章（收藏/已读/总结），只写该源文件
  const updateArticle = useCallback((articleId, patch) => {
    for (const feedId of Object.keys(articlesByFeed)) {
      const items = articlesByFeed[feedId];
      const idx = items.findIndex((a) => a.id === articleId);
      if (idx >= 0) {
        const next = items.slice();
        next[idx] = { ...next[idx], ...patch };
        setArticlesByFeed((prev) => ({ ...prev, [feedId]: next }));
        writeFeedArticles(feedId, next);
        return true;
      }
    }
    return false;
  }, [articlesByFeed, writeFeedArticles]);

  const toggleFavorite = useCallback((articleId) => {
    const a = findArticle(articleId);
    if (!a) return;
    updateArticle(articleId, { favorite: !a.favorite });
  }, [findArticle, updateArticle]);

  const markRead = useCallback((articleId) => {
    const a = findArticle(articleId);
    if (!a || a.readAt) return;
    updateArticle(articleId, { readAt: new Date().toISOString() });
  }, [findArticle, updateArticle]);

  const selectArticle = useCallback((articleId) => {
    setSelectedArticleId(articleId);
    if (articleId) markRead(articleId);
  }, [markRead]);

  const configureAgent = useCallback(async () => {
    try {
      const saved = await openAgentEditor({
        initialName: AGENT_INIT_NAME,
        initialPrompt: AGENT_INIT_PROMPT,
        agentId: agentConfigId || undefined,
      });
      if (!saved) return;
      const meta = { name: saved.name || AGENT_INIT_NAME, modelProvider: saved.modelProvider };
      setAgentConfigId(saved.id);
      setAgentMeta(meta);
      await writeConfig(CONFIG_FILES.agent, { agentConfigId: saved.id, agentMeta: meta });
      setError('');
    } catch (e) {
      setError('打开模型配置失败：' + (e?.message || e));
    }
  }, [agentConfigId, writeConfig]);

  const summarizeArticle = useCallback(async (articleId) => {
    const article = findArticle(articleId);
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
      updateArticle(articleId, { summary, summaryAt: new Date().toISOString() });
      setToast('总结完成');
    } catch (e) {
      setError('总结失败：' + (e?.message || e));
    } finally {
      setSummarizingId(null);
    }
  }, [findArticle, agentConfigId, updateArticle]);

  const copySummary = useCallback((articleId) => {
    const a = findArticle(articleId);
    if (!a?.summary) return;
    Promise.resolve(copyText?.(a.summary)).then(
      () => setToast('已复制总结'),
      () => setError('复制失败'),
    );
  }, [findArticle]);

  // —— 派生：把所有源文章拍平，供列表展示 ——
  const allArticles = useMemo(() => {
    const list = [];
    for (const items of Object.values(articlesByFeed)) {
      for (const a of items) list.push(a);
    }
    return list;
  }, [articlesByFeed]);

  const filteredArticles = useMemo(() => {
    let list = allArticles;
    if (selectedFeedId !== 'all') list = list.filter((a) => a.feedId === selectedFeedId);
    if (filter === 'favorite') list = list.filter((a) => a.favorite);
    return [...list].sort((a, b) => (b.pubDate || '').localeCompare(a.pubDate || ''));
  }, [allArticles, selectedFeedId, filter]);

  const currentArticle = useMemo(
    () => allArticles.find((a) => a.id === selectedArticleId) || null,
    [allArticles, selectedArticleId],
  );

  const counts = useMemo(() => {
    const byFeed = new Map();
    let fav = 0;
    for (const a of allArticles) {
      byFeed.set(a.feedId, (byFeed.get(a.feedId) || 0) + 1);
      if (a.favorite) fav += 1;
    }
    return { byFeed, favorite: fav, total: allArticles.length };
  }, [allArticles]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  return {
    ready,
    feeds, agentConfigId, agentMeta,
    selectedFeedId, selectedArticleId, filter,
    fetchingFeedIds, fetchingAll, summarizingId,
    error, toast, counts,
    filteredArticles, currentArticle,
    setSelectedFeedId, setFilter,
    addFeed, removeFeed, fetchOne, fetchAll,
    selectArticle, toggleFavorite, markRead,
    configureAgent, summarizeArticle, copySummary,
  };
}
