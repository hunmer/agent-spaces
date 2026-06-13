import { useState, useCallback, useEffect, useRef } from 'react';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import useGeneration from './hooks/useGeneration';
import useUI from './hooks/useUI';

export default function App() {
  const UI = useUI();
  const { results, loading, progress, error, taskQueue, generate, clearResults, removeResult } =
    useGeneration();
  const [preset, setPreset] = useState(null);
  const leftPanelApiRef = useRef(null);

  // 右侧卡片"二次创作"菜单 → 切换左侧模式并把当前媒体预填为输入源
  const handleUseAsSource = useCallback((item, mode) => {
    setPreset({ seq: Date.now(), item, mode });
  }, []);

  const handleLeftPanelReady = useCallback((api) => {
    leftPanelApiRef.current = api;
  }, []);

  // ====== Agent 广播事件监听 ======
  // api.js 中的 switch_mode / set_form / trigger_generate / use_as_source /
  // delete_result / clear_history 通过 broadcast 通知前端，这里转发到 LeftPanel 的
  // imperative API 或 useGeneration 的对应方法。
  useEffect(() => {
    const AS = window.AgentSpaces;
    if (!AS?.onTaskEvent) return;

    const unsubscribe = AS.onTaskEvent((event, data) => {
      const api = leftPanelApiRef.current;
      switch (event) {
        case 'miniApp.switchMode': {
          api?.switchMode?.(data?.mode);
          break;
        }
        case 'miniApp.setForm': {
          api?.applyFormPatch?.(data || {});
          break;
        }
        case 'miniApp.triggerGenerate': {
          // 等下一帧确保 setForm 的 setState 已应用
          setTimeout(() => leftPanelApiRef.current?.submit?.(), 0);
          break;
        }
        case 'miniApp.useAsSource': {
          if (data?.mode && data?.source) {
            setPreset({
              seq: Date.now(),
              kind: 'useAsSource',
              mode: data.mode,
              item: {
                type: data.source.type,
                url: data.source.url,
                prompt: data.source.prompt || '',
                provider: data.source.provider,
              },
            });
          }
          break;
        }
        case 'miniApp.deleteResult': {
          if (data?.id) removeResult?.(data.id);
          break;
        }
        case 'miniApp.clearHistory': {
          clearResults?.();
          break;
        }
        case 'miniApp.clientRequest': {
          // 服务端 toolcall 通过 ctx.requestClient 读取客户端状态
          if (data?.type === 'history') {
            const respond = AS.respondClientRequest;
            if (!respond) return;
            try {
              const history = AS.getConfig?.('generation-history.json') || [];
              respond(data.requestId, {
                updatedAt: new Date().toISOString(),
                count: Array.isArray(history) ? history.length : 0,
                items: Array.isArray(history) ? history : [],
              });
            } catch (err) {
              respond(data.requestId, null, false, err?.message || String(err));
            }
          }
          break;
        }
        default:
          break;
      }
    });

    return () => {
      try { unsubscribe(); } catch {}
    };
  }, [removeResult, clearResults]);

  if (!UI) return null;

  const {
    ResizablePanelGroup, ResizablePanel, ResizableHandle,
    Card, CardContent,
  } = UI;

  return (
    <div style={styles.root}>
      <ResizablePanelGroup direction="horizontal" style={styles.panelGroup}>
        {/* ====== 左侧表单面板 ====== */}
        <ResizablePanel id="left-form" defaultSize="32%" minSize="25%" maxSize="45%">
          <Card style={styles.leftCard}>
            <CardContent style={styles.leftContent}>
              <LeftPanel
                onGenerate={generate}
                taskQueue={taskQueue}
                error={error}
                preset={preset}
                onReady={handleLeftPanelReady}
              />
            </CardContent>
          </Card>
        </ResizablePanel>

        {/* ====== 分割线 ====== */}
        <ResizableHandle style={styles.handle} />

        {/* ====== 右侧结果面板 ====== */}
        <ResizablePanel id="right-results" defaultSize="50%" minSize="40%">
          <Card style={styles.rightCard}>
            <CardContent style={styles.rightContent}>
              <RightPanel
                results={results}
                loading={loading}
                progress={progress}
                onClear={clearResults}
                onDelete={removeResult}
                onUseAsSource={handleUseAsSource}
              />
            </CardContent>
          </Card>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

const styles = {
  root: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f2f5',
    padding: '12px',
    boxSizing: 'border-box',
    overflow: 'hidden',
  },
  panelGroup: {
    height: '100%',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  leftCard: {
    height: '100%',
    borderRadius: '12px 0 0 12px',
    borderRight: 'none',
    overflow: 'hidden',
  },
  leftContent: {
    padding: '16px',
    height: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
  },
  handle: {
    width: '2px',
    backgroundColor: '#e2e8f0',
  },
  rightCard: {
    height: '100%',
    borderRadius: '0 12px 12px 0',
    borderLeft: 'none',
    overflow: 'hidden',
  },
  rightContent: {
    padding: '16px',
    height: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
  },
};
