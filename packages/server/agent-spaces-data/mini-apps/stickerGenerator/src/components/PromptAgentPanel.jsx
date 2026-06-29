// 提示词 AI 助手面板：内嵌在提示词输入框右下角
// 由 usePromptAgent 提供状态，ControlPanel 注入
const { Button, Loader2, Wand2, Check, X, AlertCircle } = window.AgentSpacesUI;

export default function PromptAgentPanel({ agent, onApply, disabled }) {
  const { open, setOpen, busy, topic, setTopic, result, error, presetsLoading, hasAgent, run, reset } = agent;

  const handleApply = () => {
    onApply?.(String(result || '').trim());
    setOpen(false);
    reset();
  };

  // 触发按钮：始终显示在提示词框右下角
  if (!open) {
    return (
      <button
        type="button"
        className="sg-pa-trigger"
        disabled={disabled}
        title={hasAgent ? 'AI 生成提示词' : '未配置 Agent，请到设置中配置'}
        onClick={() => setOpen(true)}
      >
        <Wand2 className="sg-icon-xs" />
        <span>AI 生成</span>
      </button>
    );
  }

  // 展开面板：覆盖在 Textarea 下方
  return (
    <div className="sg-pa-panel">
      <div className="sg-pa-head">
        <span className="sg-pa-title"><Wand2 className="sg-icon-xs" /> AI 提示词助手</span>
        <button type="button" className="sg-pa-close" onClick={() => { setOpen(false); reset(); }} title="收起">
          <X className="sg-icon-sm" />
        </button>
      </div>

      <div className="sg-pa-row">
        <span className="sg-field-label">主题 / 关键词</span>
        <input
          className="sg-pa-input"
          value={topic}
          autoFocus
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } }}
          placeholder="例如：戴墨镜的猫"
          disabled={busy}
        />
      </div>

      {presetsLoading && <div className="sg-pa-status"><Loader2 className="sg-icon-xs sg-spin" /> 加载 Agent...</div>}
      {!hasAgent && !presetsLoading && (
        <div className="sg-pa-status sg-pa-warn"><AlertCircle className="sg-icon-xs" /> 未配置 Agent，请点击右上角「设置」配置。</div>
      )}
      {error && <div className="sg-pa-status sg-pa-warn"><AlertCircle className="sg-icon-xs" /> {error}</div>}

      <Button onClick={() => run()} disabled={busy || !hasAgent} className="sg-pa-run">
        {busy ? <Loader2 className="sg-icon-xs sg-spin" /> : <Wand2 className="sg-icon-xs" />}
        {busy ? '生成中...' : '生成提示词'}
      </Button>

      {result && (
        <>
          <div className="sg-pa-result">{result}</div>
          <div className="sg-pa-actions">
            <Button variant="outline" size="sm" onClick={reset} disabled={busy}>清空</Button>
            <Button size="sm" onClick={handleApply} disabled={busy || !result.trim()}>
              <Check className="sg-icon-xs" /> 应用到提示词
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
