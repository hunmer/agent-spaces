// 移植自原 HistoryPanel.tsx。
// 归档/清空走 store.archiveSession / clearMessages（服务端单写者）。
import React from 'react';

export default function HistoryPanel({ store }) {
  const { messages, history, setView, archiveSession, deleteHistory } = store;

  const handleEndSession = async () => {
    await archiveSession();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
      <div className="w-full max-w-4xl h-[90vh] flex flex-col glass-panel rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-white/10 flex justify-between items-center text-white">
          <h2 className="text-2xl font-bold text-cyan-400">记忆（历史）</h2>
          <div className="flex gap-4 items-center">
            {messages.length > 0 && (
              <button
                onClick={handleEndSession}
                className="px-4 py-2 bg-yellow-600/50 hover:bg-yellow-600 rounded text-sm"
              >
                归档当前会话
              </button>
            )}
            <button onClick={() => setView('chat')} className="text-gray-400 hover:text-white text-2xl">
              ✕
            </button>
          </div>
        </div>

        <div className="flex-grow overflow-y-auto p-6 space-y-8">
          {messages.length > 0 && (
            <div className="mb-8">
              <h3 className="text-cyan-200 font-bold mb-4 border-l-4 border-cyan-500 pl-3">当前对话</h3>
              <div className="space-y-3 pl-4">
                {messages.map((msg) => (
                  <div key={msg.id} className="flex gap-2">
                    <span className={`font-bold ${msg.role === 'user' ? 'text-yellow-400' : 'text-pink-400'}`}>
                      {msg.role === 'user' ? '你' : 'AI'}:
                    </span>
                    <span className="text-gray-300 whitespace-pre-wrap">{msg.content}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {history.length === 0 && messages.length === 0 && (
            <div className="text-center text-gray-500 mt-20">暂无记忆。</div>
          )}

          {history.map((session, idx) => (
            <div key={idx} className="bg-white/5 rounded-lg p-4 border border-white/5">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-gray-400 text-sm">
                  会话 #{history.length - idx} - {new Date(session[0]?.timestamp || Date.now()).toLocaleString()}
                </h3>
                <button
                  onClick={() => deleteHistory(idx)}
                  className="text-xs text-red-400 hover:text-red-300"
                  title="删除此会话"
                >
                  🗑️ 删除
                </button>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                {session.map((msg) => (
                  <div key={msg.id} className="text-sm">
                    <span className={`font-bold mr-2 ${msg.role === 'user' ? 'text-yellow-500/80' : 'text-pink-500/80'}`}>
                      {msg.role === 'user' ? '你' : 'AI'}:
                    </span>
                    <span className="text-gray-400 whitespace-pre-wrap">{msg.content}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
