import { useState, useCallback } from 'react';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import useGeneration from './hooks/useGeneration';
import useUI from './hooks/useUI';

export default function App() {
  const UI = useUI();
  const { results, loading, progress, error, taskQueue, generate, clearResults } =
    useGeneration();
  const [preset, setPreset] = useState(null);

  // 右侧卡片"二次创作"菜单 → 切换左侧模式并把当前媒体预填为输入源
  const handleUseAsSource = useCallback((item, mode) => {
    setPreset({ seq: Date.now(), item, mode });
  }, []);

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
              />
            </CardContent>
          </Card>
        </ResizablePanel>

        {/* ====== 分割线 ====== */}
        <ResizableHandle style={styles.handle} />

        {/* ====== 右侧结果面板 ====== */}
        <ResizablePanel id="right-results" defaultSize="68%" minSize="50%">
          <Card style={styles.rightCard}>
            <CardContent style={styles.rightContent}>
              <RightPanel
                results={results}
                loading={loading}
                progress={progress}
                onClear={clearResults}
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
