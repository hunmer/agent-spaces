import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { MODES, PROVIDERS } from '../utils/providers';
import useUI from '../hooks/useUI';
import UploadSettingsDialog from './UploadSettingsDialog';

const COLUMN_WIDTH = 220;
const COLUMN_GAP = 12;

/** 根据容器宽度动态计算列数 */
function useColumnCount(containerRef) {
  const [colCount, setColCount] = useState(2);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const width = el.clientWidth;
      const count = Math.max(1, Math.floor((width + COLUMN_GAP) / (COLUMN_WIDTH + COLUMN_GAP)));
      setColCount(count);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  return colCount;
}

/** 将 items 轮询分配到 N 列 */
function distributeToColumns(items, colCount) {
  const cols = Array.from({ length: colCount }, () => []);
  items.forEach((item, i) => cols[i % colCount].push({ item, originalIndex: i }));
  return cols;
}

/**
 * 将结果按日期+模式+提供商分组
 */
function groupResults(results) {
  const modeLabel = (id) => MODES.find((m) => m.id === id)?.label || id;
  const providerLabel = (id) => PROVIDERS.find((p) => p.id === id)?.name || id;

  const map = new Map();
  for (const item of results) {
    const date = item.createdAt?.split(' ')[0] || '未知日期';
    const key = `${date}|${item.mode}|${item.provider}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        date,
        mode: item.mode,
        modeLabel: modeLabel(item.mode),
        provider: item.provider,
        providerLabel: providerLabel(item.provider),
        items: [],
        prompts: [],
      });
    }
    const group = map.get(key);
    group.items.push(item);
    if (item.prompt && !group.prompts.includes(item.prompt)) {
      group.prompts.push(item.prompt);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const timeA = a.items[0]?.createdAt || '';
    const timeB = b.items[0]?.createdAt || '';
    return timeB.localeCompare(timeA);
  });
}

/** 单个媒体卡片（懒加载：进入视口后才挂载真实资源，避免一次性请求全部图片/视频） */
function MediaCard({ item, group, index, onMediaClick, onUseAsSource, UI }) {
  const {
    Card, CardContent, Skeleton,
    DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
    DropdownMenuItem, DropdownMenuSeparator,
  } = UI;
  const wrapRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: '300px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const isVideo = item.type === 'video';

  return (
    <Card style={styles.mediaCard}>
      <CardContent style={styles.mediaCardContent}>
        <div
          ref={wrapRef}
          style={styles.mediaWrapper}
          onClick={() => onMediaClick(group, index)}
          title="点击查看大图"
        >
          {!visible ? (
            <Skeleton style={styles.mediaPlaceholder} />
          ) : isVideo ? (
            <video
              src={item.url}
              preload="metadata"
              style={styles.mediaPreview}
              onError={(e) => { e.target.style.background = '#1a1a2e'; }}
            />
          ) : (
            <img
              src={item.url}
              alt={item.prompt || ''}
              loading="lazy"
              style={styles.mediaPreview}
              onError={(e) => {
                e.target.alt = '加载失败';
                e.target.style.background = '#f5f5f5';
              }}
            />
          )}
          <div style={styles.hoverOverlay}>
            <span style={styles.zoomIcon}>🔍</span>
          </div>
        </div>
        <div style={styles.mediaActions}>
          {item.prompt && (
            <span style={styles.mediaPrompt} title={item.prompt}>
              {item.prompt.length > 30 ? item.prompt.slice(0, 30) + '...' : item.prompt}
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" style={styles.moreBtn} title="更多操作">
                ⋮
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" style={{ minWidth: '140px' }}>
              <DropdownMenuItem onClick={() => window.open(item.url, '_blank')}>
                ⬇ 下载
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onUseAsSource(item, item.mode)}>
                🔄 重新生成
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {item.type === 'image' && (
                <>
                  <DropdownMenuItem onClick={() => onUseAsSource(item, 'image_to_image')}>
                    🎨 图生图
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onUseAsSource(item, 'image_outpainting')}>
                    🔲 扩图
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onUseAsSource(item, 'image_to_video')}>
                    🎬 图生视频
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onUseAsSource(item, 'image_edit')}>
                    ✏️ 图片编辑
                  </DropdownMenuItem>
                </>
              )}
              {item.type === 'video' && (
                <DropdownMenuItem onClick={() => onUseAsSource(item, 'video_editing')}>
                  🎞 视频编辑
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}

/** 瀑布流布局：Flex 行包含 N 个纵向列 */
function MasonryGrid({ items, colCount, group, onMediaClick, onUseAsSource, UI }) {
  const columns = useMemo(() => distributeToColumns(items, colCount), [items, colCount]);

  return (
    <div style={styles.masonryRow}>
      {columns.map((col, ci) => (
        <div key={ci} style={styles.masonryCol}>
          {col.map(({ item, originalIndex }) => (
            <MediaCard
              key={item.id}
              item={item}
              group={group}
              index={originalIndex}
              onMediaClick={onMediaClick}
              onUseAsSource={onUseAsSource}
              UI={UI}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** 通知开关：状态保存在 localStorage（workflow_setting_<projectId>.notification.enabled） */
function NotificationToggle({ UI }) {
  const { Switch } = UI;
  const [enabled, setEnabled] = useState(
    () => !!window.AgentSpaces?.getUserSetting?.('notification', 'enabled', false),
  );
  const handleToggle = useCallback((next) => {
    setEnabled(next);
    window.AgentSpaces?.setUserSetting?.('notification', 'enabled', next);
  }, []);
  return (
    <div style={styles.notifyToggle} title="开启后，任务完成时桌面通知">
      <span style={styles.notifyIcon}>🔔</span>
      <Switch checked={enabled} onCheckedChange={handleToggle} />
    </div>
  );
}

export default function RightPanel({ results, loading, progress, onClear, onUseAsSource }) {
  const UI = useUI();
  const containerRef = useRef(null);
  const colCount = useColumnCount(containerRef);
  const groups = useMemo(() => groupResults(results), [results]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleMediaClick = useCallback((group, index) => {
    const openFn = window.AgentSpacesUI?.openMediaGallery;
    if (!openFn) {
      console.warn('openMediaGallery 不可用');
      return;
    }
    const items = group.items.map((item) => ({
      src: item.url,
      type: item.type === 'video' ? 'video' : 'image',
      alt: item.prompt || '',
    }));
    openFn(items, index);
  }, []);

  // 任务完成/失败时发送桌面通知（仅自己发起的任务 + 通知开关开启时）
  useEffect(() => {
    const AS = window.AgentSpaces;
    if (!AS?.onTaskEvent || !AS?.sendNotifiction || !AS?.getUserSetting) return;
    const myId = AS.getExecutorId?.() || '';
    const unsubscribe = AS.onTaskEvent((event, data) => {
      if (event !== 'workflowUi.taskFinished' && event !== 'workflowUi.taskFailed') return;
      if (!data || data.executorId !== myId) return;
      if (!AS.getUserSetting('notification', 'enabled', false)) return;
      const ok = event === 'workflowUi.taskFinished';
      const meta = data.meta || {};
      AS.sendNotifiction(
        ok ? '生成完成 ✅' : '生成失败 ❌',
        ok
          ? `${meta.modeLabel || meta.mode || '任务'} 已完成`
          : data.error || '请查看详情',
      ).catch(() => {});
    });
    return () => { try { unsubscribe(); } catch {} };
  }, []);

  if (!UI) return null;

  const {
    Button, Badge, ScrollArea,
    Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle,
  } = UI;

  return (
    <div ref={containerRef} style={styles.root}>
      {/* 卡片操作入口已移至底部三点菜单 */}

      {/* ====== 空状态（含加载中无结果） ====== */}
      {results.length === 0 && (
        <>
          <div style={styles.toolbar}>
            <span style={styles.resultCount}>
              {loading ? `⏳ ${progress || '生成中...'}` : '共 0 个结果'}
            </span>
            <div style={styles.toolbarActions}>
              <NotificationToggle UI={UI} />
              <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)} style={{ fontSize: '12px' }}>
                ☁ 上传设置
              </Button>
            </div>
          </div>
          <div style={styles.emptyRoot}>
            <Empty>
              <EmptyHeader>
                <EmptyTitle style={{ fontSize: '18px' }}>🎨 AI 创作空间</EmptyTitle>
                <EmptyDescription>在左侧填写提示词并点击生成，结果将在此展示</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <div style={styles.emptyHint}>
                  <span>支持 文生图 · 图生图 · 图片编辑 · 图生视频 · 扩图 · 视频编辑 · 数字人</span>
                  <span style={{ opacity: 0.5, fontSize: '12px' }}>
                    MiniMax · 即梦 · 阿里云 · OpenAI
                  </span>
                </div>
              </EmptyContent>
            </Empty>
          </div>
        </>
      )}

      {/* ====== 分组平铺展示 ====== */}
      {results.length > 0 && (
        <>
          <div style={styles.toolbar}>
            <span style={styles.resultCount}>
              {loading ? `⏳ ${progress || '生成中...'}` : `共 ${results.length} 个结果`}
            </span>
            <div style={styles.toolbarActions}>
              <NotificationToggle UI={UI} />
              <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)} style={{ fontSize: '12px' }}>
                ☁ 上传设置
              </Button>
              <Button variant="ghost" size="sm" onClick={onClear} style={{ fontSize: '12px' }}>
                清空全部
              </Button>
            </div>
          </div>

          <ScrollArea style={styles.scrollArea}>
            <div style={styles.accordion}>
              {groups.map((group) => (
                <div key={group.key} style={styles.accordionItem}>
                  <div style={styles.trigger}>
                    <div style={styles.triggerContent}>
                      <div style={styles.triggerLeft}>
                        <span style={styles.dateText}>{group.date}</span>
                      </div>
                      <span style={styles.countBadge}>{group.items.length} 张</span>
                    </div>
                  </div>
                  <div style={styles.accordionContent}>
                    <MasonryGrid
                      items={group.items}
                      colCount={colCount}
                      group={group}
                      onMediaClick={handleMediaClick}
                      onUseAsSource={onUseAsSource}
                      UI={UI}
                    />
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </>
      )}

      <UploadSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
  emptyRoot: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    padding: '32px',
  },
  emptyHint: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '20px',
    color: '#888',
    fontSize: '14px',
  },
  /* 瀑布流：横向 Flex 行 */
  masonryRow: {
    display: 'flex',
    gap: `${COLUMN_GAP}px`,
    padding: '0 4px 12px 4px',
    alignItems: 'flex-start',
  },
  /* 每列：纵向 Flex 列 */
  masonryCol: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: `${COLUMN_GAP}px`,
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 4px 8px 4px',
    flexShrink: 0,
  },
  toolbarActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  notifyToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    paddingLeft: '4px',
  },
  notifyIcon: {
    fontSize: '13px',
    lineHeight: 1,
  },
  resultCount: {
    fontSize: '13px',
    color: '#888',
  },
  scrollArea: {
    flex: 1,
    minHeight: 0,
  },
  accordion: {
    width: '100%',
  },
  accordionItem: {
    borderBottom: '1px solid #f0f0f0',
  },
  trigger: {
    padding: '10px 4px',
    width: '100%',
    textAlign: 'left',
  },
  triggerContent: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingRight: '8px',
  },
  triggerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  dateText: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#374151',
  },
  countBadge: {
    fontSize: '12px',
    color: '#9ca3af',
    backgroundColor: '#f3f4f6',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  promptLine: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '4px',
    paddingRight: '8px',
    minWidth: 0,
  },
  promptLabel: {
    fontSize: '11px',
    color: '#9ca3af',
    backgroundColor: '#f3f4f6',
    padding: '1px 6px',
    borderRadius: '4px',
    flexShrink: 0,
  },
  promptText: {
    fontSize: '12px',
    color: '#4b5563',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
    flex: 1,
  },
  accordionContent: {
    padding: '0 4px 12px 4px',
  },
  mediaCard: {
    overflow: 'hidden',
    padding: 0,
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    transition: 'box-shadow 0.2s',
  },
  mediaCardContent: {
    padding: '0',
    display: 'flex',
    flexDirection: 'column',
  },
  mediaWrapper: {
    position: 'relative',
    cursor: 'pointer',
    overflow: 'hidden',
  },
  mediaPreview: {
    width: '100%',
    display: 'block',
    backgroundColor: '#f9fafb',
    transition: 'transform 0.2s ease',
  },
  mediaPlaceholder: {
    width: '100%',
    height: '220px',
    display: 'block',
  },
  hoverOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0)',
    transition: 'background-color 0.2s ease',
    pointerEvents: 'none',
  },
  zoomIcon: {
    fontSize: '24px',
    opacity: 0,
    transform: 'scale(0.8)',
    transition: 'all 0.2s ease',
    filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))',
  },
  mediaActions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 8px',
    gap: '4px',
  },
  mediaPrompt: {
    fontSize: '11px',
    color: '#6b7280',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    minWidth: 0,
  },
  moreBtn: {
    flexShrink: 0,
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '6px',
    border: 'none',
    background: 'transparent',
    color: '#9ca3af',
    fontSize: '18px',
    lineHeight: 1,
    cursor: 'pointer',
    padding: 0,
  },
};
