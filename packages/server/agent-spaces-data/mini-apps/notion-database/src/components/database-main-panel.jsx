import { useState, useEffect, useRef, useMemo } from 'react';
import { TableOfContents, extractTocFromHtml, extractTocFromMarkdown } from './table-of-contents.jsx';
import { VersionHistoryDialog } from './version-history-dialog.jsx';
import * as dbApi from '../utils/db.js';
import { EDITOR_MODE, PRESET_COVERS, EMOJIS, T, htmlToMarkdown } from '../utils/constants.js';

const cn = (...a) => a.filter(Boolean).join(' ');
const {
  NotionEditor,
  MarkdownEditor,
  markdownToHtml,
  Button,
  ChevronRight,
  History,
} = (window.AgentSpacesUI || {});

/**
 * props: { node, prefs, onModeChange, onNodeChanged }
 *
 * 方案选择：封面 / 图标 / 标题 的持久化在组件内部完成（直接调 dbApi.updateCover /
 * updateIcon / renameNode 并 invokeService('node_changed') 广播 + 调 onNodeChanged
 * 让父级刷新）。因此不依赖 props 里的 onCoverChange / onIconChange —— index.jsx 无需改动。
 */
export function DatabaseMainPanel({ node, prefs, onModeChange, onNodeChanged }) {
  const [content, setContent] = useState(node?.content || '');
  const [title, setTitle] = useState(node?.title || '');
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [localNode, setLocalNode] = useState(node);
  const saveTimer = useRef(null);

  // 节点切换：同步本地状态
  useEffect(() => {
    setContent(node?.content || '');
    setTitle(node?.title || '');
    setLocalNode(node);
    setCoverPickerOpen(false);
    setIconPickerOpen(false);
  }, [node?.id]);

  const editorMode = prefs?.editorMode || EDITOR_MODE.NOTION;
  const theme = prefs?.theme;
  const isFullWidth = !!prefs?.isFullWidth;

  // 防抖保存正文（updateNode 内部已自动写版本快照）
  const persist = (next) => {
    setContent(next);
    if (!localNode) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await dbApi.updateNode(localNode.id, { content: next });
        window.AgentSpaces?.invokeService?.('node_changed', { kind: 'update', nodeId: localNode.id });
        onNodeChanged && onNodeChanged();
      } catch (e) {
        // 沙箱内静默失败，避免阻塞编辑
        console.error('[notion-database] persist failed', e);
      }
    }, 600);
  };

  // 模式切换：转换内容格式 + 立即持久化
  const switchMode = async (mode) => {
    if (mode === editorMode || !localNode) return;
    const converted = mode === EDITOR_MODE.MARKDOWN ? htmlToMarkdown(content) : (markdownToHtml ? markdownToHtml(content) : content);
    setContent(converted);
    try {
      await dbApi.updateNode(localNode.id, { content: converted });
      window.AgentSpaces?.invokeService?.('node_changed', { kind: 'update', nodeId: localNode.id });
    } catch (e) {
      console.error('[notion-database] switchMode save failed', e);
    }
    onModeChange && onModeChange(mode);
  };

  // 标题重命名：回车提交
  const commitTitle = async () => {
    if (!localNode) return;
    const next = title.trim();
    if (!next || next === localNode.title) {
      setTitle(localNode.title || '');
      return;
    }
    try {
      await dbApi.renameNode(localNode.id, next);
      setLocalNode({ ...localNode, title: next });
      window.AgentSpaces?.invokeService?.('node_changed', { kind: 'update', nodeId: localNode.id });
      onNodeChanged && onNodeChanged();
    } catch (e) {
      console.error('[notion-database] rename failed', e);
    }
  };

  // 封面
  const changeCover = async (cover) => {
    if (!localNode) return;
    setCoverPickerOpen(false);
    try {
      const updated = await dbApi.updateCover(localNode.id, cover);
      setLocalNode(updated || { ...localNode, cover });
      window.AgentSpaces?.invokeService?.('node_changed', { kind: 'update', nodeId: localNode.id });
      onNodeChanged && onNodeChanged();
    } catch (e) {
      console.error('[notion-database] updateCover failed', e);
    }
  };

  const removeCover = async () => {
    setCoverPickerOpen(false);
    if (!localNode) return;
    try {
      const updated = await dbApi.updateCover(localNode.id, '');
      setLocalNode(updated || { ...localNode, cover: '' });
      window.AgentSpaces?.invokeService?.('node_changed', { kind: 'update', nodeId: localNode.id });
      onNodeChanged && onNodeChanged();
    } catch (e) {
      console.error('[notion-database] removeCover failed', e);
    }
  };

  // 图标
  const changeIcon = async (icon) => {
    if (!localNode) return;
    setIconPickerOpen(false);
    try {
      const updated = await dbApi.updateIcon(localNode.id, icon);
      setLocalNode(updated || { ...localNode, icon });
      window.AgentSpaces?.invokeService?.('node_changed', { kind: 'update', nodeId: localNode.id });
      onNodeChanged && onNodeChanged();
    } catch (e) {
      console.error('[notion-database] updateIcon failed', e);
    }
  };

  const removeIcon = async () => {
    setIconPickerOpen(false);
    if (!localNode) return;
    try {
      const updated = await dbApi.updateIcon(localNode.id, '');
      setLocalNode(updated || { ...localNode, icon: '' });
      window.AgentSpaces?.invokeService?.('node_changed', { kind: 'update', nodeId: localNode.id });
      onNodeChanged && onNodeChanged();
    } catch (e) {
      console.error('[notion-database] removeIcon failed', e);
    }
  };

  const wordCount = useMemo(() => {
    if (!content) return 0;
    return content.replace(/<[^>]*>/g, '').trim().length || 0;
  }, [content]);

  const toc = useMemo(() => {
    if (!content) return [];
    return editorMode === EDITOR_MODE.NOTION ? extractTocFromHtml(content) : extractTocFromMarkdown(content);
  }, [content, editorMode]);

  if (!localNode) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 select-none text-center">
        <span style={{ fontSize: 48 }}>📚</span>
        <h2 className="text-xl font-bold mt-4">{T.empty}</h2>
      </div>
    );
  }

  const coverBg = localNode.cover || 'linear-gradient(to right, #0284c7, #06b6d4)';

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* 内容滚动区 */}
      <div className="flex-1 min-h-0 flex">
        {/* 主体 */}
        <div className="flex-1 overflow-y-auto" data-editor-content>
          {/* 顶部工具条：编辑器切换 + 目录（sidebar 路径已在 index.jsx 处理） */}
          <div className="sticky top-0 z-20 px-6 py-2 flex items-center justify-between bg-background/90 backdrop-blur-md border-b border-border">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{T.empty === '暂无内容' ? '知识库' : 'Knowledge'}</span>
              {ChevronRight ? <ChevronRight className="w-3.5 h-3.5 opacity-50" /> : <span>/</span>}
              <span className="text-foreground font-semibold truncate max-w-[180px]">{localNode.title || 'Untitled'}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setVersionOpen(true)}
                title="版本历史"
              >
                {History ? <History className="w-4 h-4 mr-1.5" /> : null}
                版本历史
              </Button>
              <div className="flex bg-card border border-border p-1 rounded-xl">
                <Button
                  size="sm"
                  variant={editorMode === EDITOR_MODE.NOTION ? 'default' : 'ghost'}
                  onClick={() => switchMode(EDITOR_MODE.NOTION)}
                >
                  Notion
                </Button>
                <Button
                  size="sm"
                  variant={editorMode === EDITOR_MODE.MARKDOWN ? 'default' : 'ghost'}
                  onClick={() => switchMode(EDITOR_MODE.MARKDOWN)}
                >
                  Markdown
                </Button>
              </div>
            </div>
          </div>

          {/* 封面区 */}
          <div
            className="relative group border-b border-border"
            style={{ height: 180, background: coverBg }}
          >
            <div className="absolute bottom-3 right-4 flex items-center gap-1.5">
              <Button size="sm" variant="secondary" onClick={() => setCoverPickerOpen((v) => !v)}>
                {localNode.cover ? '更换封面' : '添加封面'}
              </Button>
              {localNode.cover ? (
                <Button size="sm" variant="ghost" onClick={removeCover}>移除</Button>
              ) : null}
            </div>
            {coverPickerOpen ? (
              <div className="absolute bottom-14 right-4 z-30 p-3 rounded-xl border border-border bg-card shadow-2xl flex flex-wrap gap-2" style={{ maxWidth: 280 }}>
                {PRESET_COVERS.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => changeCover(preset)}
                    style={{ background: preset }}
                    className={cn(
                      'w-7 h-7 rounded-full border cursor-pointer hover:scale-110 transition-transform',
                      localNode.cover === preset ? 'border-white' : 'border-transparent',
                    )}
                  />
                ))}
              </div>
            ) : null}
          </div>

          {/* 标题 + 图标 + 正文 */}
          <div className={cn('mx-auto px-6 md:px-12 py-8 flex flex-col w-full', isFullWidth ? 'max-w-none' : 'max-w-4xl')}>
            <div className="mb-6 relative group">
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={() => setIconPickerOpen((v) => !v)}
                  className="text-4xl bg-card p-2 rounded-2xl border border-border shadow-md hover:scale-105 transition-transform cursor-pointer shrink-0"
                  title="更换图标"
                >
                  {localNode.icon || '📝'}
                </button>
                {iconPickerOpen ? (
                  <div className="absolute z-30 mt-16 p-2 rounded-xl border border-border bg-card shadow-2xl flex flex-wrap gap-1" style={{ maxWidth: 240 }}>
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => changeIcon(emoji)}
                        className="text-xl p-1 rounded hover:bg-muted cursor-pointer"
                      >
                        {emoji}
                      </button>
                    ))}
                    {localNode.icon ? (
                      <button onClick={removeIcon} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 w-full text-left cursor-pointer">
                        移除图标
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                placeholder="Untitled"
                className="w-full text-3xl md:text-4xl font-extrabold border-none outline-none focus:ring-0 p-0 tracking-tight bg-transparent placeholder:text-muted-foreground/40"
              />
            </div>

            {/* 编辑器 */}
            <div className="flex-1 min-h-0 select-text">
              {editorMode === EDITOR_MODE.NOTION ? (
                <NotionEditor content={content} onChange={persist} theme={theme} />
              ) : (
                <MarkdownEditor contentMarkdown={content} onChange={persist} theme={theme} />
              )}
            </div>

            {/* 底部状态条 */}
            <div className="mt-6 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
              <span>字数 <strong className="text-foreground">{wordCount}</strong></span>
              <span>已自动保存</span>
            </div>
          </div>
        </div>

        {/* 目录侧栏 */}
        {toc && toc.length > 0 ? (
          <div className="w-56 shrink-0 border-l border-border p-3 overflow-y-auto hidden md:block">
            <TableOfContents items={toc} />
          </div>
        ) : null}
      </div>

      {/* 版本历史对话框 */}
      <VersionHistoryDialog
        open={versionOpen}
        onClose={() => setVersionOpen(false)}
        nodeId={localNode?.id}
        onNodeChanged={onNodeChanged}
      />
    </div>
  );
}

export default DatabaseMainPanel;
