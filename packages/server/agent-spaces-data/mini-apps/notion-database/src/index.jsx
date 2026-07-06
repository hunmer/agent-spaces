import { useEffect, useState, useCallback } from 'react';
import { initSchema, listNodes } from './utils/db.js';
import { DatabaseSidebar } from './components/database-sidebar.jsx';
import { DatabaseMainPanel } from './components/database-main-panel.jsx';
import { QuickSearchModal } from './components/quick-search-modal.jsx';
import { DatabaseAiChat } from './components/database-ai-chat.jsx';

const { Search, MessageCircle } = (window.AgentSpacesUI || {});

export default function App() {
  const [nodes, setNodes] = useState([]);
  const [ready, setReady] = useState(false);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [prefs, setPrefs] = useState({ activeId: '', editorMode: 'notion', theme: 'sans', openFolders: {}, openTabs: [], recentIds: [] });

  useEffect(() => {
    let cancelled = false;
    const AS = window.AgentSpaces;
    if (!AS) {
      setReady(true);
      return undefined;
    }
    const waitForConfigReady = () => new Promise((resolve) => {
      if (!AS?.onConfigReady || AS.isConfigReady?.()) {
        resolve(null);
        return;
      }
      const offReady = AS.onConfigReady(() => {
        try { offReady?.(); } catch {}
        resolve(null);
      });
    });

    (async () => {
      await initSchema();
      await waitForConfigReady();
      if (cancelled) return;
      setNodes(await listNodes());
      const p = AS.getConfig('config.json');
      if (p) setPrefs((prev) => ({ ...prev, ...p }));
      if (!cancelled) setReady(true);
    })();
    const off = AS.onConfigChanged((path, value) => {
      if (path === 'config.json' && value) setPrefs((prev) => ({ ...prev, ...value }));
    });
    const offTask = AS.onTaskEvent((event) => {
      if (event === 'miniApp.nodeChanged') listNodes().then(setNodes);
    });
    return () => {
      cancelled = true;
      off && off();
      offTask && offTask();
    };
  }, []);

  // Cmd/Ctrl+K 打开/关闭快速搜索
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const refresh = useCallback(() => { listNodes().then(setNodes); }, []);
  const updatePrefs = useCallback((patch) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      window.AgentSpaces.invokeService('update_prefs', next);
      return next;
    });
  }, []);

  if (!ready) return <div style={{ padding: 24 }}>loading…</div>;

  const activeNode = nodes.find((n) => n.id === prefs.activeId) || null;

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ width: 280, borderRight: '1px solid #eee', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px 10px', borderBottom: '1px solid #eee' }}>
          <button
            type="button"
            onClick={() => setQuickSearchOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb',
              background: '#f9fafb', cursor: 'pointer', fontSize: 13, color: '#6b7280',
            }}
            title="快速搜索 (Cmd/Ctrl+K)"
          >
            {Search ? <Search size={14} /> : <span>🔍</span>}
            <span>搜索文档…</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9ca3af' }}>⌘K</span>
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <DatabaseSidebar
            nodes={nodes}
            prefs={prefs}
            activeId={prefs.activeId}
            onSelect={(id) => updatePrefs({ activeId: id })}
            onToggle={(id) => updatePrefs({ openFolders: { ...prefs.openFolders, [id]: !prefs.openFolders[id] } })}
            onNodeChanged={refresh}
          />
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <DatabaseMainPanel
          node={activeNode}
          prefs={prefs}
          onModeChange={(m) => updatePrefs({ editorMode: m })}
          onNodeChanged={refresh}
        />
      </div>
      <QuickSearchModal
        open={quickSearchOpen}
        onClose={() => setQuickSearchOpen(false)}
        onSelect={(nodeId) => {
          updatePrefs({ activeId: nodeId });
          setQuickSearchOpen(false);
        }}
      />
      {/* AI 对话悬浮按钮 */}
      <button
        type="button"
        onClick={() => setAiChatOpen(true)}
        title="AI 对话"
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          zIndex: 40,
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: '1px solid #e5e7eb',
          background: '#0f172a',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
      >
        {MessageCircle ? <MessageCircle size={20} /> : <span>💬</span>}
      </button>
      <DatabaseAiChat
        open={aiChatOpen}
        onClose={() => setAiChatOpen(false)}
        context={activeNode ? { title: activeNode.title, content: activeNode.content } : null}
      />
    </div>
  );
}
