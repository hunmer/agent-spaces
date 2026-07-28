import { ReactFlowProvider } from '@xyflow/react';
import Canvas from './components/Canvas';
import { NodeDialogProvider } from './components/nodes/NodeDialogContext';

export default function App() {
  return (
    <ReactFlowProvider>
      <NodeDialogProvider>
        <div className="h-full min-h-0">
          <Canvas />
        </div>
      </NodeDialogProvider>
    </ReactFlowProvider>
  );
}
