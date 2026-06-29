// 贴图工坊入口 —— 文生图 / 图生图工作流 + agent_run 提示词助手
import Header from './components/Header';
import ControlPanel from './components/ControlPanel';
import Gallery from './components/Gallery';
import PreviewDialog from './components/PreviewDialog';
import { useConfigData } from './hooks/useConfigData';
import { useGeneration } from './hooks/useGeneration';
import { useAgentPresets } from './hooks/useAgentPresets';
import { DEFAULT_FORM } from './utils/styles';
import { persistableReferences } from './utils/workflow';

const {
  Popover, PopoverTrigger, PopoverContent, Button, Badge, Loader2, Check, X,
  Bot, Wand2, AlertCircle,
} = window.AgentSpacesUI;

const DRAFT_KEY = 'stickerGeneratorDraft';
const MODEL_KEY = 'stickerGeneratorModel';

function Style() {
  return (
    <style>{`
      :root {
        --sg-bg: var(--background, #ffffff);
        --sg-fg: var(--foreground, #18181b);
        --sg-card: var(--card, #ffffff);
        --sg-border: var(--border, #e4e4e7);
        --sg-muted: var(--muted-foreground, #71717a);
        --sg-soft: var(--secondary, #f4f4f5);
        --sg-accent: var(--primary, #f97316);
        --sg-accent-soft: var(--accent, #fff7ed);
      }
      .sg-root { height: 100vh; display: flex; flex-direction: column; background: var(--sg-bg); color: var(--sg-fg); font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
      .sg-main { flex: 1; min-height: 0; display: grid; grid-template-columns: 380px minmax(0, 1fr); }
      .sg-left { min-height: 0; overflow: auto; border-right: 1px solid var(--sg-border); background: var(--sg-card); padding: 14px; display: flex; flex-direction: column; gap: 10px; }
      .sg-right { min-height: 0; overflow: auto; padding: 16px; }

      /* header */
      .sg-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; border-bottom: 1px solid var(--sg-border); background: var(--sg-card); }
      .sg-header-brand { display: flex; align-items: center; gap: 12px; }
      .sg-header-logo { width: 38px; height: 38px; border-radius: 10px; background: linear-gradient(135deg, #f97316, #f43f5e); color: #fff; display: grid; place-items: center; box-shadow: 0 4px 12px rgba(249,115,22,.35); }
      .sg-header-title { font-size: 18px; font-weight: 800; margin: 0; line-height: 1.1; }
      .sg-header-sub { font-size: 12px; color: var(--sg-muted); margin: 2px 0 0; }
      .sg-header-meta { display: flex; align-items: center; gap: 8px; }
      .sg-pill { font-size: 12px; font-weight: 600; color: var(--sg-muted); background: var(--sg-soft); border: 1px solid var(--sg-border); padding: 4px 10px; border-radius: 999px; }

      /* section */
      .sg-section { background: var(--sg-card); border: 1px solid var(--sg-border); border-radius: 10px; overflow: hidden; }
      .sg-section-head { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: transparent; border: 0; cursor: pointer; font-size: 13px; font-weight: 700; color: var(--sg-fg); }
      .sg-section-head:hover { background: var(--sg-soft); }
      .sg-section-title { display: flex; align-items: center; gap: 7px; }
      .sg-section-right { display: flex; align-items: center; gap: 8px; color: var(--sg-muted); }
      .sg-section-body { padding: 4px 12px 12px; display: flex; flex-direction: column; gap: 10px; }

      .sg-field { display: flex; flex-direction: column; gap: 6px; }
      .sg-field-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--sg-muted); }
      .sg-mini-label { font-size: 11px; font-weight: 700; color: var(--sg-muted); display: flex; align-items: center; gap: 4px; }
      .sg-textarea { min-height: 120px; resize: vertical; }
      .sg-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

      .sg-presets { display: flex; flex-direction: column; gap: 6px; }
      .sg-preset-list { display: flex; flex-wrap: wrap; gap: 6px; }
      .sg-preset-chip { font-size: 11px; font-weight: 600; background: var(--sg-soft); color: var(--sg-fg); border: 1px solid var(--sg-border); padding: 4px 8px; border-radius: 6px; cursor: pointer; }
      .sg-preset-chip:hover { background: var(--sg-accent-soft); color: var(--sg-accent); border-color: var(--sg-accent); }

      /* layout mode */
      .sg-layout-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
      .sg-layout-btn { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 4px; border: 1px solid var(--sg-border); background: var(--sg-card); border-radius: 8px; cursor: pointer; font-size: 11px; font-weight: 600; color: var(--sg-fg); }
      .sg-layout-btn:hover { border-color: var(--sg-accent); }
      .sg-layout-btn.is-selected { border-color: var(--sg-accent); background: var(--sg-accent-soft); color: var(--sg-accent); }
      .sg-collection-count { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
      .sg-collection-presets { display: flex; align-items: center; gap: 6px; }
      .sg-count-btn { width: 30px; height: 30px; border: 1px solid var(--sg-border); background: var(--sg-card); border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; color: var(--sg-fg); }
      .sg-count-btn.is-selected { border-color: var(--sg-accent); background: var(--sg-accent); color: #fff; }
      .sg-count-input { width: 56px; }

      /* style picker */
      .sg-style-trigger { width: 100%; justify-content: flex-start; gap: 8px; }
      .sg-style-trigger-label { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .sg-style-custom-count { font-size: 11px; color: var(--sg-muted); }
      .sg-style-dot { width: 14px; height: 14px; border-radius: 999px; flex: 0 0 auto; border: 1px solid rgba(0,0,0,.1); }
      .sg-style-popover { width: 320px; }
      .sg-style-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; max-height: 360px; overflow: auto; padding: 4px; }
      .sg-style-item { position: relative; display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--sg-border); background: var(--sg-card); border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600; color: var(--sg-fg); text-align: left; }
      .sg-style-item:hover { border-color: var(--sg-accent); }
      .sg-style-item.is-selected { border-color: var(--sg-accent); background: var(--sg-accent-soft); }
      .sg-style-item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .sg-style-check { width: 14px; height: 14px; color: var(--sg-accent); }
      .sg-style-custom-tag { font-size: 9px; font-weight: 700; color: var(--sg-muted); border: 1px solid var(--sg-border); padding: 1px 4px; border-radius: 4px; }
      .sg-style-hint { font-size: 11px; color: var(--sg-muted); line-height: 1.5; }

      /* toggles */
      .sg-toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; }
      .sg-toggle-label { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; }
      .sg-divider { height: 1px; background: var(--sg-border); margin: 4px 0; }
      .sg-sub-block { display: flex; flex-direction: column; gap: 8px; padding: 8px; background: var(--sg-soft); border: 1px solid var(--sg-border); border-radius: 8px; }
      .sg-font-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
      .sg-font-btn { padding: 6px; border: 1px solid var(--sg-border); background: var(--sg-card); border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; color: var(--sg-fg); }
      .sg-font-btn.is-selected { border-color: var(--sg-accent); background: var(--sg-accent-soft); color: var(--sg-accent); }
      .sg-color-row { display: flex; flex-wrap: wrap; gap: 8px; }
      .sg-color-btn { width: 26px; height: 26px; border-radius: 999px; border: 2px solid var(--sg-border); cursor: pointer; }
      .sg-color-btn.is-selected { box-shadow: 0 0 0 2px var(--sg-accent); }

      /* generate */
      .sg-generate-wrap { padding-top: 4px; }
      .sg-generate-btn { width: 100%; background: linear-gradient(135deg, #f97316, #f43f5e); color: #fff; font-weight: 800; height: 44px; border: 0; }
      .sg-generate-btn:hover { filter: brightness(1.05); }
      .sg-generate-btn:disabled { background: var(--sg-muted); cursor: not-allowed; }

      /* gallery */
      .sg-gallery { height: 100%; display: flex; flex-direction: column; gap: 14px; }
      .sg-gallery-head { display: flex; align-items: center; justify-content: space-between; }
      .sg-gallery-title { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 800; }
      .sg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
      .sg-card { background: var(--sg-card); border: 1px solid var(--sg-border); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; transition: transform .15s, box-shadow .15s; }
      .sg-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,.08); }
      .sg-card-thumb { position: relative; width: 100%; aspect-ratio: 1; background: var(--sg-soft); border: 0; padding: 0; cursor: pointer; display: grid; place-items: center; }
      .sg-card-thumb img { width: 100%; height: 100%; object-fit: contain; }
      .sg-card-zoom { position: absolute; right: 8px; bottom: 8px; width: 28px; height: 28px; border-radius: 999px; background: rgba(0,0,0,.6); color: #fff; display: grid; place-items: center; opacity: 0; transition: opacity .15s; }
      .sg-card-thumb:hover .sg-card-zoom { opacity: 1; }
      .sg-card-body { padding: 10px; display: flex; flex-direction: column; gap: 8px; }
      .sg-card-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
      .sg-card-time { font-size: 11px; color: var(--sg-muted); }
      .sg-card-prompt { font-size: 12px; line-height: 1.45; color: var(--sg-fg); margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .sg-card-actions { display: flex; align-items: center; gap: 6px; }
      .sg-card-dl { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; padding: 4px 8px; border: 1px solid var(--sg-border); border-radius: 6px; color: var(--sg-fg); text-decoration: none; }

      .sg-empty { flex: 1; min-height: 320px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--sg-muted); border: 1.5px dashed var(--sg-border); border-radius: 12px; background: var(--sg-card); }
      .sg-empty-title { font-size: 16px; font-weight: 700; margin: 4px 0 0; color: var(--sg-fg); }
      .sg-empty-desc { font-size: 13px; margin: 0; text-align: center; max-width: 320px; }

      /* preview dialog */
      .sg-preview-dialog { max-width: 900px; }
      .sg-preview-header { display: flex; flex-direction: row; align-items: center; justify-content: space-between; }
      .sg-preview-body { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 0; }
      .sg-preview-img-wrap { background: var(--sg-soft); display: grid; place-items: center; padding: 24px; min-height: 300px; }
      .sg-preview-img-wrap img { max-width: 100%; max-height: 60vh; object-fit: contain; }
      .sg-preview-info { padding: 20px; display: flex; flex-direction: column; gap: 14px; border-left: 1px solid var(--sg-border); }
      .sg-preview-meta { display: flex; flex-wrap: wrap; gap: 6px; }
      .sg-preview-block label { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--sg-muted); margin-bottom: 4px; }
      .sg-preview-block p { font-size: 13px; line-height: 1.5; margin: 0; }
      .sg-preview-time { font-family: ui-monospace, monospace; font-size: 12px; }
      .sg-preview-dl { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px; background: linear-gradient(135deg, #f97316, #f43f5e); color: #fff; border-radius: 8px; font-weight: 700; text-decoration: none; }

      /* floating agent helper */
      .sg-agent-fab { position: fixed; right: 20px; bottom: 20px; z-index: 50; width: 48px; height: 48px; border-radius: 999px; background: linear-gradient(135deg, #f97316, #f43f5e); color: #fff; display: grid; place-items: center; box-shadow: 0 6px 20px rgba(249,115,22,.4); cursor: pointer; border: 0; }
      .sg-agent-fab:hover { filter: brightness(1.08); }
      .sg-agent-panel { width: 340px; }
      .sg-agent-head { display: flex; align-items: center; gap: 8px; padding: 4px 0 8px; border-bottom: 1px solid var(--sg-border); margin-bottom: 10px; font-weight: 700; }
      .sg-agent-row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
      .sg-agent-status { font-size: 12px; color: var(--sg-muted); display: flex; align-items: center; gap: 6px; }
      .sg-agent-result { font-size: 13px; line-height: 1.5; background: var(--sg-soft); border: 1px solid var(--sg-border); border-radius: 8px; padding: 10px; max-height: 200px; overflow: auto; white-space: pre-wrap; }

      .sg-floating-status { position: fixed; right: 18px; bottom: 80px; z-index: 80; background: var(--sg-fg); color: var(--sg-bg); border-radius: 7px; padding: 8px 12px; font-size: 13px; }
      .sg-error-bar { margin: 0 0 8px; padding: 9px 12px; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; border-radius: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px; }
      .sg-success-bar { margin: 0 0 8px; padding: 9px 12px; background: #ecfdf5; color: #065f46; border: 1px solid #bbf7d0; border-radius: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px; }

      .sg-icon-xs { width: 13px; height: 13px; flex: 0 0 auto; }
      .sg-icon-sm { width: 16px; height: 16px; flex: 0 0 auto; }
      .sg-icon-lg { width: 36px; height: 36px; opacity: .5; }
      .sg-spin { animation: sg-spin 1s linear infinite; }
      @keyframes sg-spin { to { transform: rotate(360deg); } }

      @media (max-width: 900px) {
        .sg-main { grid-template-columns: 1fr; }
        .sg-left { border-right: 0; border-bottom: 1px solid var(--sg-border); max-height: none; }
        .sg-preview-body { grid-template-columns: 1fr; }
        .sg-preview-info { border-left: 0; border-top: 1px solid var(--sg-border); }
      }
    `}</style>
  );
}

function App() {
  const AS = window.AgentSpaces;
  const { history, customStyles, sharedConfig } = useConfigData();
  const [form, setForm] = React.useState(() => ({
    ...DEFAULT_FORM,
    ...(AS.getUserSetting?.(DRAFT_KEY, {}) || {}),
    model: AS.getUserSetting?.(MODEL_KEY, '') || sharedConfig.defaultModel || '',
  }));
  const [preview, setPreview] = React.useState(null);
  const [agentOpen, setAgentOpen] = React.useState(false);

  // 草稿持久化（不含 File 对象）
  React.useEffect(() => {
    AS.saveUserSettings?.({
      [DRAFT_KEY]: { ...form, references: persistableReferences(form.references) },
      [MODEL_KEY]: form.model,
    });
  }, [form]);

  const { running, status, error, generate } = useGeneration({ form, customStyles });

  // agent_run 提示词助手
  const { presets, loading: presetsLoading } = useAgentPresets(true);
  const [agentBusy, setAgentBusy] = React.useState(false);
  const [agentResult, setAgentResult] = React.useState('');
  const [agentTopic, setAgentTopic] = React.useState('');

  const optimizePrompt = async () => {
    const topic = String(agentTopic || form.prompt || '').trim();
    if (!topic) { setAgentResult('请先输入主题或提示词'); return; }
    const presetId = sharedConfig.defaultAgentPresetId || presets[0]?.id;
    if (!presetId) { setAgentResult('未找到可用的 Agent preset，请先在设置中配置。'); return; }
    setAgentBusy(true);
    setAgentResult('正在生成贴图提示词...');
    try {
      const resp = await AS.callPluginTool('@agent-spaces/builtin', 'agent_run', {
        prompt: `你是贴图提示词专家。请根据以下主题，生成 3 条适合制作贴纸(sticker)的英文提示词，每条一行，简洁有画面感，强调主体、风格、表情和构图。主题：「${topic}」`,
        agentConfigId: presetId,
        permissionMode: 'dontAsk',
      });
      const text = resp?.result?.result || resp?.result || '';
      setAgentResult(typeof text === 'string' ? text : JSON.stringify(text));
    } catch (err) {
      setAgentResult(`生成失败：${err?.message || err}`);
    } finally {
      setAgentBusy(false);
    }
  };

  const applyAgentResult = () => {
    const text = String(agentResult || '').trim();
    if (!text) return;
    setForm((prev) => ({ ...prev, prompt: prev.prompt.trim() ? `${prev.prompt.trim()}\n${text}` : text }));
    setAgentOpen(false);
  };

  return (
    <div className="sg-root">
      <Style />
      <Header count={history.length} />
      {error && <div className="sg-error-bar"><AlertCircle className="sg-icon-sm" />{error}</div>}
      {status && !running && <div className="sg-success-bar"><Check className="sg-icon-sm" />{status}</div>}

      <main className="sg-main">
        <div className="sg-left">
          <ControlPanel
            form={form}
            onChange={setForm}
            customStyles={customStyles}
            running={running}
            onGenerate={generate}
            onUploadRefs={(files) => {
              // 上传完成后把可持久化结构回写，避免 File 对象残留
              Promise.resolve()
                .then(() => setForm((prev) => ({ ...prev, references: persistableReferences(prev.references) })))
                .catch(() => {});
            }}
          />
        </div>
        <div className="sg-right">
          <Gallery
            history={history}
            running={running}
            onPreview={setPreview}
            onDelete={(id) => AS.invokeService('remove_result', { id })}
            onClear={() => { if (window.confirm('确定清空所有贴图？')) AS.invokeService('clear_results'); }}
          />
        </div>
      </main>

      <PreviewDialog item={preview} onClose={() => setPreview(null)} onDelete={(id) => AS.invokeService('remove_result', { id })} />

      {/* agent_run 提示词助手浮层 */}
      <button type="button" className="sg-agent-fab" title="AI 提示词助手" onClick={() => setAgentOpen((v) => !v)}>
        <Wand2 className="sg-icon-sm" />
      </button>
      {agentOpen && (
        <div className="sg-agent-panel" style={{ position: 'fixed', right: 20, bottom: 80, zIndex: 60, background: 'var(--sg-card)', border: '1px solid var(--sg-border)', borderRadius: 12, padding: 14, boxShadow: '0 12px 40px rgba(0,0,0,.18)' }}>
          <div className="sg-agent-head">
            <Bot className="sg-icon-sm" />
            <span>AI 提示词助手</span>
            <Button size="icon" variant="ghost" style={{ marginLeft: 'auto' }} onClick={() => setAgentOpen(false)}>
              <X className="sg-icon-sm" />
            </Button>
          </div>
          <div className="sg-agent-row">
            <span className="sg-field-label">主题 / 关键词</span>
            <input
              style={{ padding: '8px', borderRadius: 6, border: '1px solid var(--sg-border)', background: 'var(--sg-card)', color: 'var(--sg-fg)', fontSize: 13, width: '100%' }}
              value={agentTopic}
              onChange={(e) => setAgentTopic(e.target.value)}
              placeholder={form.prompt || '例如：戴墨镜的猫'}
            />
          </div>
          {presetsLoading && <div className="sg-agent-status"><Loader2 className="sg-icon-xs sg-spin" /> 加载 Agent preset...</div>}
          {!presetsLoading && presets.length === 0 && (
            <div className="sg-agent-status">未发现 Agent preset，请先在「设置 → Agent」里配置一个 agent。</div>
          )}
          <Button onClick={optimizePrompt} disabled={agentBusy || presets.length === 0} style={{ width: '100%', marginBottom: 10 }}>
            {agentBusy ? <Loader2 className="sg-icon-sm sg-spin" /> : <Wand2 className="sg-icon-sm" />}
            {agentBusy ? '生成中...' : '生成提示词'}
          </Button>
          {agentResult && (
            <>
              <div className="sg-agent-result">{agentResult}</div>
              <Button variant="outline" onClick={applyAgentResult} style={{ width: '100%', marginTop: 8 }}>
                <Check className="sg-icon-sm" /> 应用到提示词框
              </Button>
            </>
          )}
        </div>
      )}

      {running && <div className="sg-floating-status">正在生成贴图，请稍候...</div>}
    </div>
  );
}

export default App;
