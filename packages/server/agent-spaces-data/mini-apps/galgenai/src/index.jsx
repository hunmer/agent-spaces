// GalGenAI Live2D 伙伴 — 入口。
// 移植自 D:\galgenai 的 App.tsx + index.tsx，作为 agent-spaces miniapp 运行：
// - 对话走 @agent-spaces/builtin/agent_run（替代 Gemini）
// - 语音走 text_to_voice 工作流（替代内置 TTS）
// - 状态用 configs + services（替代 zustand persist）
// - Live2D 依赖通过 CDN 运行时注入（不在 renderer allowlist 内）
import React from 'react';
import { useGalgenaiStore } from './hooks/useGalgenaiStore';
import Live2DViewer from './components/Live2DViewer';
import ChatInterface from './components/ChatInterface';
import SettingsPanel from './components/SettingsPanel';
import HistoryPanel from './components/HistoryPanel';
import ModelLibrary from './components/ModelLibrary';

function App() {
  const store = useGalgenaiStore();
  const { settings, currentView, setView, setAvailableMotions, motionToPlay, triggerMotion } = store;
  const currentModel = (settings.models || []).find((m) => m.id === settings.currentModelId);

  return (
    <div
      className="relative w-full h-full min-h-0 overflow-hidden bg-cover bg-center transition-all duration-700"
      style={{ backgroundImage: `url(${settings.backgroundUrl})` }}
    >
      {/* 暗色遮罩，保证前景可读 */}
      <div className="absolute inset-0 bg-black/30 pointer-events-none z-0" />

      <Live2DViewer
        modelConfig={currentModel}
        onAvailableMotions={setAvailableMotions}
        motionToPlay={motionToPlay}
        onMotionConsumed={() => triggerMotion(null)}
        onOpenLibrary={() => setView('model-library')}
      />

      {currentView === 'chat' && <ChatInterface store={store} />}
      {currentView === 'settings' && <SettingsPanel store={store} />}
      {currentView === 'history' && <HistoryPanel store={store} />}
      {currentView === 'model-library' && <ModelLibrary store={store} />}
    </div>
  );
}

export default App;
