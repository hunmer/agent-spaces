import { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Toaster } from '@agent-spaces/ui';
import Canvas from './components/Canvas';
import { NodeDialogProvider } from './components/nodes/NodeDialogContext';

export default function App({ hostConfig }) {
  // manifest.backgroundService 开启后，宿主提供的后台服务自动注册。
  if (hostConfig?.backgroundService?.enabled !== false) {
    window.AgentSpaces?.registerBackgroundService(hostConfig?.backgroundService || { enabled: true });
  }
  // 阻止浏览器默认的「保存网页」（Ctrl/Cmd+S）行为，仅 preventDefault，不阻断事件传播
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <ReactFlowProvider>
      <NodeDialogProvider>
        <div className="h-full min-h-0">
          <Canvas hostConfig={hostConfig} />
        </div>
        {/* 全局 toast 容器：供导出素材库等长任务反馈进度。richColors 着色成功/失败，bottom-right 避开顶部菜单 */}
        <Toaster richColors position="bottom-right" />
      </NodeDialogProvider>
    </ReactFlowProvider>
  );
}
