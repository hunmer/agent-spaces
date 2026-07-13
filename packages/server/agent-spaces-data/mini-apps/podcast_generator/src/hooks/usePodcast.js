const { useState, useCallback, useEffect, useMemo } = React;
const { getUserSetting, saveUserSettings, callPluginTool, openAgentEditor, copyText } = window.AgentSpaces;
import {
  BUILTIN_PLUGIN, EPUB_PLUGIN, MAX_CONTENT_CHARS, SETTING_KEYS,
  AGENT_INIT_NAME, AGENT_INIT_PROMPT,
} from '../utils/constants.js';
import { deriveChapters, htmlToText } from '../utils/epub.js';
import { parseScript, truncate } from '../utils/script.js';

const get = (k, def) => getUserSetting(k, def);

export function usePodcast() {
  // —— 从 localStorage 恢复初始状态（同步，首屏即可见）——
  const [filePath, setFilePath] = useState(() => get(SETTING_KEYS.filePath, ''));
  const [bookMeta, setBookMeta] = useState(() => get(SETTING_KEYS.bookMeta, null));
  const [chapters, setChapters] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(() => get(SETTING_KEYS.selectedIndex, -1));
  const [podcast, setPodcast] = useState(() => get(SETTING_KEYS.podcast, []));

  const [chapterText, setChapterText] = useState('');
  const [loadingChapter, setLoadingChapter] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [agentConfigId, setAgentConfigId] = useState(() => get(SETTING_KEYS.agentConfigId, ''));
  const [agentMeta, setAgentMeta] = useState(() => get(SETTING_KEYS.agentMeta, null));

  const [ready, setReady] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // —— 解析 epub：元信息 + 目录 + spine（接收 path，不依赖 state）——
  const parseBook = useCallback(async (path) => {
    const info = await callPluginTool(EPUB_PLUGIN, 'epub_info', { filePath: path });
    if (!info?.success) throw new Error(info?.message || 'EPUB 解析失败');
    const { metadata, toc, spine } = info.data || {};
    const meta = {
      title: metadata?.title || '未知书名',
      author: Array.isArray(metadata?.creator)
        ? metadata.creator.join('、')
        : (metadata?.creator || '未知作者'),
    };
    setBookMeta(meta);
    setChapters(deriveChapters(spine, toc));
    saveUserSettings({
      [SETTING_KEYS.filePath]: path,
      [SETTING_KEYS.bookMeta]: meta,
    });
    setToast(`已加载 ${info.data?.spineCount ?? 0} 个章节`);
    return meta;
  }, []);

  // —— 加载章节正文（无去重，恢复流程也复用）——
  const loadChapter = useCallback(async (index) => {
    setLoadingChapter(true);
    setError('');
    setChapterText('');
    try {
      const res = await callPluginTool(EPUB_PLUGIN, 'epub_chapters', {
        filePath, start: index, count: 1,
      });
      if (!res?.success) throw new Error(res?.message || '章节加载失败');
      const html = res.data?.chapters?.[0]?.html || '';
      setChapterText(htmlToText(html));
    } catch (e) {
      setError('章节加载失败：' + (e?.message || e));
    } finally {
      setLoadingChapter(false);
    }
  }, [filePath]);

  // —— 选章节（去重 + 持久化）——
  const selectChapter = useCallback(async (index) => {
    if (index === selectedIndex || loadingChapter) return;
    setSelectedIndex(index);
    saveUserSettings({ [SETTING_KEYS.selectedIndex]: index });
    await loadChapter(index);
  }, [selectedIndex, loadingChapter, loadChapter]);

  // —— 上传 epub ——
  const handleUpload = useCallback(async (file) => {
    if (!file) return;
    setError(''); setToast(''); setParsing(true);
    setBookMeta(null); setChapters([]); setSelectedIndex(-1);
    setChapterText(''); setPodcast([]);
    saveUserSettings({ [SETTING_KEYS.selectedIndex]: -1, [SETTING_KEYS.podcast]: [] });
    try {
      const uploaded = await window.AgentSpaces.uploadFile(file);
      const path = uploaded?.path || uploaded?.uploadedPath;
      if (!path) throw new Error('上传未返回文件路径');
      setFilePath(path);
      await parseBook(path);
    } catch (e) {
      setError('上传失败：' + (e?.message || e));
    } finally {
      setParsing(false);
    }
  }, [parseBook]);

  // —— 打开 Agent 配置弹窗，保存返回的 preset ——
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

  // —— AI 生成播客脚本 ——
  const generatePodcast = useCallback(async () => {
    if (!chapterText.trim()) { setError('请先选择章节'); return; }
    if (!agentConfigId) { setError('请先点击「配置 AI 模型」'); return; }
    setError(''); setToast(''); setGenerating(true); setPodcast([]);
    try {
      const title = chapters[selectedIndex]?.label || '本章';
      const systemPrompt = '你是一位资深播客制作人。你的唯一任务是输出双人播客对话脚本。不要使用任何工具，不要执行命令，不要输出解释或标题，只输出对话正文。';
      const prompt = [
        '把下面的章节内容改编成一段双人播客对话。',
        '',
        '硬性要求：',
        '1. 两个角色：主持人（好奇、引导提问）与嘉宾（专业、讲解原文要点）。',
        '2. 每一行严格遵循格式 "角色：内容"，角色只能是"主持人"或"嘉宾"，中间用中文冒号"："。',
        '3. 不要输出标题、分隔符、解释或任何非对话内容。',
        '4. 口语自然、有互动感，但必须紧扣原文事实，不得编造。',
        '5. 生成 15~25 轮（每轮 = 主持人 + 嘉宾各一句）。',
        '',
        `章节标题：${title}`,
        '',
        '章节内容：',
        truncate(chapterText, MAX_CONTENT_CHARS),
      ].join('\n');

      const taskId = `podcast-${selectedIndex}-${Date.now()}`;
      const ret = await callPluginTool(
        BUILTIN_PLUGIN,
        'agent_run',
        { prompt, agentConfigId, systemPrompt, permissionMode: 'bypassPermissions' },
        { taskId, meta: { mode: 'podcast', chapter: title } },
      );

      const lines = parseScript(ret?.result);
      if (!lines.length) throw new Error('AI 未返回有效对话，原始结果：' + String(ret?.result || '').slice(0, 200));
      setPodcast(lines);
      saveUserSettings({ [SETTING_KEYS.podcast]: lines });
    } catch (e) {
      setError('生成失败：' + (e?.message || e));
    } finally {
      setGenerating(false);
    }
  }, [chapterText, agentConfigId, chapters, selectedIndex]);

  const copyScript = useCallback(() => {
    if (!podcast.length) return;
    const text = podcast.map((it) => `${it.role}：${it.content}`).join('\n');
    Promise.resolve(copyText?.(text)).then(
      () => setToast('已复制到剪贴板'),
      () => setError('复制失败'),
    );
  }, [podcast]);

  // —— 启动：恢复上次的 epub/章节 ——
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const path = get(SETTING_KEYS.filePath, '');
      if (!path) { if (!cancelled) setReady(true); return; }
      try {
        await parseBook(path);
        if (cancelled) return;
        const idx = get(SETTING_KEYS.selectedIndex, -1);
        if (idx >= 0) await loadChapter(idx);
      } catch (e) {
        if (!cancelled) setError('恢复上次电子书失败，请重新上传：' + (e?.message || e));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const currentLabel = useMemo(
    () => (selectedIndex >= 0 ? chapters[selectedIndex]?.label : ''),
    [chapters, selectedIndex],
  );

  return {
    ready, parsing, error, toast,
    bookMeta, chapters, selectedIndex, chapterText, loadingChapter, currentLabel,
    podcast, generating, agentConfigId, agentMeta,
    handleUpload, selectChapter, generatePodcast, configureAgent, copyScript,
  };
}
