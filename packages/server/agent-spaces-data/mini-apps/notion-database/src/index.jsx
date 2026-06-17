import { useEffect, useState, useCallback } from 'react';
import { initSchema, listNodes } from './utils/db.js';
import { DatabaseSidebar } from './components/database-sidebar.jsx';
import { DatabaseMainPanel } from './components/database-main-panel.jsx';
import { QuickSearchModal } from './components/quick-search-modal.jsx';

const { Search } = (window.AgentSpacesUI || {});

export default function App() {
  const [nodes, setNodes] = useState([]);
  const [ready, setReady] = useState(false);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [prefs, setPrefs] = useState({ activeId: '', editorMode: 'notion', theme: 'sans', openFolders: {}, openTabs: [], recentIds: [] });

  useEffect(() => {
    (async () => {
      await initSchema();
      setNodes(await listNodes());
      const p = window.AgentSpaces.getConfig('config.json');
      if (p) setPrefs((prev) => ({ ...prev, ...p }));
      setReady(true);
    })();
    const off = window.AgentSpaces.onConfigChanged((path, value) => {
      if (path === 'config.json' && value) setPrefs((prev) => ({ ...prev, ...value }));
    });
    const offTask = window.AgentSpaces.onTaskEvent((event) => {
      if (event === 'miniApp.nodeChanged') listNodes().then(setNodes);
    });
    return () => { off && off(); offTask && offTask(); };
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
    </div>
  );
}
