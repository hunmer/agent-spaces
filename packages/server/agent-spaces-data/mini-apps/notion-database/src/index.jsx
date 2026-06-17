import { useEffect, useState, useCallback } from 'react';
import { initSchema, listNodes } from './utils/db.js';
import { DatabaseSidebar } from './components/database-sidebar.jsx';
import { DatabaseMainPanel } from './components/database-main-panel.jsx';

export default function App() {
  const [nodes, setNodes] = useState([]);
  const [ready, setReady] = useState(false);
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
      <div style={{ width: 280, borderRight: '1px solid #eee', overflow: 'auto' }}>
        <DatabaseSidebar
          nodes={nodes}
          prefs={prefs}
          activeId={prefs.activeId}
          onSelect={(id) => updatePrefs({ activeId: id })}
          onToggle={(id) => updatePrefs({ openFolders: { ...prefs.openFolders, [id]: !prefs.openFolders[id] } })}
          onNodeChanged={refresh}
        />
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <DatabaseMainPanel
          node={activeNode}
          prefs={prefs}
          onModeChange={(m) => updatePrefs({ editorMode: m })}
          onNodeChanged={refresh}
        />
      </div>
    </div>
  );
}
