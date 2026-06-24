// 文案转分镜 · 主入口
// 项目管理 + 角色管理 + 分镜管理 + 工作流生图/生视频 + 文案经 Agent 导入
import { useStore } from './hooks/useStore.js';
import { DEFAULT_SETTINGS, SETTING_KEYS } from './utils/constants.js';
import CharacterPanel from './components/CharacterPanel.jsx';
import ScenePanel from './components/ScenePanel.jsx';
import { ImportDialog, GenerateParamsDialog, AgentConfigButton } from './components/Dialogs.jsx';

function Style() {
  return (
    <style>{`
      .sb-app { height: 100vh; display: flex; flex-direction: column; background: #f7f7f4; color: #18181b; }
      .sb-icon { width: 16px; height: 16px; flex: 0 0 auto; }
      .sb-spin { animation: sb-spin 1s linear infinite; }
      @keyframes sb-spin { to { transform: rotate(360deg); } }

      .sb-topbar { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: #ffffff; border-bottom: 1px solid #e4e4e7; flex-wrap: wrap; }
      .sb-topbar-left { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; }
      .sb-topbar-right { display: flex; align-items: center; gap: 6px; }
      .sb-project-select { min-width: 180px; max-width: 280px; }
      .sb-divider { width: 1px; height: 22px; background: #e4e4e7; margin: 0 4px; }

      .sb-tabs { display: flex; gap: 4px; padding: 8px 14px 0; background: #ffffff; border-bottom: 1px solid #e4e4e7; }
      .sb-tab { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 0; background: transparent; color: #71717a; font-size: 13px; cursor: pointer; border-bottom: 2px solid transparent; }
      .sb-tab.is-active { color: #18181b; border-bottom-color: #18181b; font-weight: 600; }

      .sb-content { flex: 1; min-height: 0; overflow: auto; padding: 14px; }

      .sb-split { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 14px; height: 100%; }
      .sb-list-side { display: flex; flex-direction: column; min-height: 0; background: #fff; border: 1px solid #e4e4e7; border-radius: 8px; overflow: hidden; }
      .sb-list-head { display: flex; align-items: center; gap: 8px; padding: 12px; border-bottom: 1px solid #f0f0f0; }
      .sb-list-title { display: flex; align-items: center; gap: 6px; font-weight: 650; font-size: 14px; }
      .sb-ml-auto { margin-left: auto; }
      .sb-list { flex: 1; min-height: 0; overflow: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px; }
      .sb-list-item { display: flex; align-items: center; gap: 8px; text-align: left; padding: 9px 10px; border: 1px solid transparent; border-radius: 6px; background: transparent; cursor: pointer; }
      .sb-list-item:hover { background: #f4f4f5; }
      .sb-list-item.is-active { background: #f4f4f5; border-color: #d4d4d8; }
      .sb-list-item-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
      .sb-list-item-name { font-size: 13px; font-weight: 600; color: #18181b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .sb-list-item-sub { font-size: 11px; color: #a1a1aa; }
      .sb-list-gen { flex: 0 0 auto; border: 1px solid #e4e4e7; background: #fff; border-radius: 6px; padding: 5px; cursor: pointer; color: #52525b; display: grid; place-items: center; }
      .sb-list-gen:hover:not(:disabled) { background: #18181b; color: #fff; border-color: #18181b; }
      .sb-list-gen:disabled { opacity: .6; cursor: default; }
      .sb-list-empty, .sb-edit-empty { display: grid; place-items: center; color: #a1a1aa; font-size: 13px; padding: 24px; text-align: center; }

      .sb-edit { background: #fff; border: 1px solid #e4e4e7; border-radius: 8px; overflow: auto; }
      .sb-edit-body { padding: 16px; }
      .sb-edit-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #f0f0f0; position: sticky; top: 0; background: #fff; }
      .sb-edit-title { font-weight: 650; font-size: 14px; }
      .sb-edit-head-actions { display: flex; align-items: center; gap: 6px; }

      .sb-field { display: flex; flex-direction: column; gap: 7px; margin-top: 14px; }
      .sb-field:first-child { margin-top: 0; }
      .sb-textarea { min-height: 120px; resize: vertical; }
      .sb-textarea-sm { min-height: 84px; resize: vertical; }
      .sb-textarea-lg { min-height: 200px; resize: vertical; }
      .sb-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

      .sb-img-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(86px, 1fr)); gap: 8px; }
      .sb-img-thumb { position: relative; aspect-ratio: 1; border: 1px solid #e4e4e7; border-radius: 6px; overflow: hidden; background: #f4f4f5; }
      .sb-img-thumb img { width: 100%; height: 100%; object-fit: cover; cursor: pointer; display: block; }
      .sb-img-thumb.is-selected { border-color: #111827; box-shadow: 0 0 0 2px #111827 inset; }
      .sb-img-thumb.is-uploading { display: grid; place-items: center; color: #71717a; }
      .sb-img-star { position: absolute; top: 4px; left: 4px; background: #111827; color: #fbbf24; border-radius: 50%; padding: 3px; display: grid; place-items: center; }
      .sb-img-del { position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,.55); color: #fff; border: 0; border-radius: 50%; padding: 3px; cursor: pointer; display: grid; place-items: center; }
      .sb-img-del:hover { background: #000; }

      .sb-scenes { display: flex; flex-direction: column; gap: 12px; }
      .sb-scenes-head { display: flex; align-items: center; gap: 8px; }
      .sb-scene-list { display: flex; flex-direction: column; gap: 12px; }
      .sb-scene-card { background: #fff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 14px; }
      .sb-scene-head { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
      .sb-scene-no { width: 28px; height: 28px; border-radius: 50%; background: #18181b; color: #fff; display: grid; place-items: center; font-size: 13px; font-weight: 700; flex: 0 0 auto; }
      .sb-scene-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; }
      .sb-scene-media { margin-top: 12px; border-top: 1px dashed #e4e4e7; padding-top: 12px; display: flex; flex-direction: column; gap: 12px; }
      .sb-media-block { display: flex; flex-direction: column; gap: 6px; }
      .sb-media-head { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #71717a; font-weight: 600; }
      .sb-video { width: 100%; max-height: 320px; border-radius: 6px; background: #000; }

      .sb-chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .sb-chip { padding: 4px 10px; border: 1px solid #e4e4e7; border-radius: 999px; background: #fff; font-size: 12px; cursor: pointer; color: #52525b; }
      .sb-chip:hover { background: #f4f4f5; }
      .sb-chip.is-on { background: #18181b; color: #fff; border-color: #18181b; }
      .sb-chips-empty { color: #a1a1aa; font-size: 12px; }

      .sb-error { margin-top: 10px; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; border-radius: 6px; padding: 8px 10px; font-size: 13px; }

      .sb-modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 100; display: grid; place-items: center; padding: 16px; }
      .sb-modal { background: #fff; border-radius: 10px; width: 100%; max-width: 560px; max-height: 88vh; display: flex; flex-direction: column; box-shadow: 0 20px 50px rgba(0,0,0,.2); }
      .sb-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid #f0f0f0; font-weight: 650; }
      .sb-modal-close { border: 0; background: transparent; font-size: 22px; line-height: 1; cursor: pointer; color: #71717a; }
      .sb-modal-body { padding: 16px; overflow: auto; }
      .sb-modal-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
      .sb-radio-row { display: flex; flex-direction: column; gap: 8px; }
      .sb-radio { padding: 10px 12px; border: 1px solid #e4e4e7; border-radius: 6px; background: #fff; font-size: 13px; cursor: pointer; text-align: left; color: #52525b; }
      .sb-radio.is-on { border-color: #111827; background: #fafafa; color: #18181b; font-weight: 600; }

      @media (max-width: 900px) {
        .sb-split { grid-template-columns: 1fr; }
        .sb-grid-2 { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}

function App() {
  const AS = window.AgentSpaces;
  const { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Plus, Pencil, Trash2, FileText } = window.AgentSpacesUI;

  const { projects, project, projectId, settings, actions } = useStore();

  const [tab, setTab] = React.useState('characters');
  const [importOpen, setImportOpen] = React.useState(false);
  const [agentConfigId, setAgentConfigId] = React.useState(() => AS.getUserSetting?.(SETTING_KEYS.agentConfigId, '') || '');
  const [agentMeta, setAgentMeta] = React.useState(() => AS.getUserSetting?.(SETTING_KEYS.agentMeta, null) || null);

  const cfg = { ...DEFAULT_SETTINGS, ...(settings || {}) };

  // 生成参数对话框（每次生成前弹出，默认填上次参数）
  const resolverRef = React.useRef(null);
  const [genOpen, setGenOpen] = React.useState(false);
  const [genValue, setGenValue] = React.useState(cfg);

  const requestParams = React.useCallback(() => {
    setGenValue({ ...DEFAULT_SETTINGS, ...(settings || {}) });
    setGenOpen(true);
    return new Promise((resolve) => { resolverRef.current = resolve; });
  }, [settings]);

  const onParamsConfirm = (p) => {
    setGenOpen(false);
    actions.saveSettings(p); // 记忆为下次默认
    resolverRef.current?.(p);
    resolverRef.current = null;
  };
  const onParamsCancel = () => {
    setGenOpen(false);
    resolverRef.current?.(null);
    resolverRef.current = null;
  };

  const newProject = async () => {
    const name = window.prompt('项目名称', `项目 ${projects.length + 1}`);
    if (name === null) return;
    await actions.newProject(name.trim() || `项目 ${projects.length + 1}`);
  };

  const renameProject = async () => {
    if (!project) return;
    const name = window.prompt('项目新名称', project.name);
    if (name === null) return;
    await actions.renameProject(project.id, name.trim() || project.name);
  };

  const deleteProject = async () => {
    if (!project) return;
    if (!window.confirm(`删除项目「${project.name}」？此操作不可撤销。`)) return;
    await actions.deleteProject(project.id);
  };

  const onAgentConfigured = (info) => {
    setAgentConfigId(info.id);
    const meta = { name: info.name, modelProvider: info.modelProvider };
    setAgentMeta(meta);
    AS.saveUserSettings?.({ [SETTING_KEYS.agentConfigId]: info.id, [SETTING_KEYS.agentMeta]: meta });
  };

  return (
    <div className="sb-app">
      <Style />

      <header className="sb-topbar">
        <div className="sb-topbar-left">
          <Select value={projectId || undefined} onValueChange={(id) => actions.setActiveProject(id)}>
            <SelectTrigger className="sb-project-select"><SelectValue placeholder="选择项目" /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={newProject} title="新建项目"><Plus className="sb-icon" /></Button>
          <Button size="sm" variant="outline" onClick={renameProject} disabled={!project} title="重命名"><Pencil className="sb-icon" /></Button>
          <Button size="sm" variant="outline" onClick={deleteProject} disabled={!project} title="删除项目"><Trash2 className="sb-icon" /></Button>
        </div>
        <div className="sb-topbar-right">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} disabled={!project}>
            <FileText className="sb-icon" />导入文案
          </Button>
          <AgentConfigButton agentConfigId={agentConfigId} agentMeta={agentMeta} onConfigured={onAgentConfigured} />
        </div>
      </header>

      <div className="sb-tabs">
        <button type="button" className={`sb-tab${tab === 'characters' ? ' is-active' : ''}`} onClick={() => setTab('characters')}>
          角色 ({project?.characters?.length || 0})
        </button>
        <button type="button" className={`sb-tab${tab === 'scenes' ? ' is-active' : ''}`} onClick={() => setTab('scenes')}>
          分镜 ({project?.scenes?.length || 0})
        </button>
      </div>

      <main className="sb-content">
        {!project ? (
          <div className="sb-edit-empty" style={{ height: 'calc(100vh - 180px)', border: '1px dashed #d4d4d8', borderRadius: 8 }}>
            尚未选择项目，点击左上角「+」新建一个项目开始
          </div>
        ) : tab === 'characters' ? (
          <CharacterPanel project={project} actions={actions} settings={cfg} requestParams={requestParams} />
        ) : (
          <ScenePanel project={project} actions={actions} settings={cfg} requestParams={requestParams} />
        )}
      </main>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} actions={actions} agentConfigId={agentConfigId} />
      <GenerateParamsDialog
        open={genOpen}
        value={genValue}
        onConfirm={onParamsConfirm}
        onCancel={onParamsCancel}
      />
    </div>
  );
}

export default App;
