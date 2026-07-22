import { ReactFlowProvider } from '@xyflow/react';
import Canvas from './components/Canvas';

export default function App() {
  return (
    <ReactFlowProvider>
      <div className="h-full min-h-0">
        <Canvas />
      </div>
    </ReactFlowProvider>
  );
}
