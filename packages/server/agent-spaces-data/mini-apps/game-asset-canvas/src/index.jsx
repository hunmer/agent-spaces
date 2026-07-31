import { ReactFlowProvider } from '@xyflow/react';
import { Toaster } from '@agent-spaces/ui';
import Canvas from './components/Canvas';
import { NodeDialogProvider } from './components/nodes/NodeDialogContext';

export default function App() {
  return (
    <ReactFlowProvider>
      <NodeDialogProvider>
        <div className="h-full min-h-0">
          <Canvas />
        </div>
        {/* 全局 toast 容器：供导出素材库等长任务反馈进度。richColors 着色成功/失败，bottom-right 避开顶部菜单 */}
        <Toaster richColors position="bottom-right" />
      </NodeDialogProvider>
    </ReactFlowProvider>
  );
}
