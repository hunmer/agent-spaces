const { Sparkles, Settings2 } = window.AgentSpacesUI;

// 顶栏：贴图工坊标题 + 副标题 + 计数 + 设置按钮
export default function Header({ count = 0, onOpenSettings }) {
  return (
    <header className="sg-header">
      <div className="sg-header-brand">
        <div className="sg-header-logo">
          <Sparkles className="sg-icon-sm" />
        </div>
        <div>
          <h1 className="sg-header-title">贴图工坊</h1>
          <p className="sg-header-sub">StickerCraft · AI 贴图生成器</p>
        </div>
      </div>
      <div className="sg-header-meta">
        <span className="sg-pill">已生成 {count}</span>
        <button type="button" className="sg-header-settings" onClick={onOpenSettings} title="设置">
          <Settings2 className="sg-icon-sm" />
          <span>设置</span>
        </button>
      </div>
    </header>
  );
}
