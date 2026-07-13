export default function Style() {
  return (
    <style>{`
      * { box-sizing: border-box; }
      html, body, #root { height: 100%; margin: 0; }
      .fr-app { height: 100vh; display: flex; flex-direction: column; background: var(--background, #f7f7f4); color: var(--foreground, #18181b); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
      .fr-header { display: flex; align-items: center; gap: 24px; padding: 14px 24px; border-bottom: 1px solid var(--border, #e4e4e7); background: var(--card, #ffffff); }
      .fr-header-title { font-size: 18px; font-weight: 700; }
      .fr-tabs { display: flex; align-items: center; gap: 4px; }
      .fr-tab { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 7px; font-size: 14px; color: var(--muted-foreground, #71717a); text-decoration: none; cursor: pointer; border: 1px solid transparent; }
      .fr-tab:hover { background: var(--accent, #f4f4f5); }
      .fr-tab.is-active { background: var(--primary, #18181b); color: var(--primary-foreground, #ffffff); }
      .fr-main { flex: 1; min-height: 0; overflow: auto; padding: 20px; }
      .fr-icon { width: 16px; height: 16px; flex: 0 0 auto; }
      .fr-spin { animation: fr-spin 1s linear infinite; }
      @keyframes fr-spin { to { transform: rotate(360deg); } }
      .fr-grid { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 380px minmax(0, 1fr); gap: 20px; }
      .fr-grid-1 { max-width: 1200px; margin: 0 auto; }
      .fr-panel { background: var(--card, #ffffff); border: 1px solid var(--border, #e4e4e7); border-radius: 10px; padding: 16px; }
      .fr-panel-title { display: flex; align-items: center; gap: 8px; font-weight: 650; font-size: 14px; margin-bottom: 4px; }
      .fr-subtitle { color: var(--muted-foreground, #71717a); font-size: 12px; margin-bottom: 14px; }
      .fr-field { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
      .fr-field-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 12px; }
      .fr-actions { display: flex; align-items: center; gap: 8px; margin-top: 18px; }
      .fr-error { margin-top: 12px; display: flex; align-items: center; gap: 8px; border-radius: 7px; padding: 9px 12px; font-size: 13px; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
      .fr-status { margin-top: 12px; display: flex; align-items: center; gap: 8px; border-radius: 7px; padding: 9px 12px; font-size: 13px; background: #ecfdf5; color: #065f46; border: 1px solid #bbf7d0; }
      .fr-empty { min-height: 320px; border: 1px dashed var(--border, #d4d4d8); border-radius: 10px; display: grid; place-items: center; color: var(--muted-foreground, #71717a); background: var(--card, #ffffff); text-align: center; padding: 24px; }
      .fr-empty-icon { width: 40px; height: 40px; margin-bottom: 10px; opacity: 0.5; }
      .fr-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
      .fr-card { background: var(--card, #ffffff); border: 1px solid var(--border, #e4e4e7); border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
      .fr-card img { width: 100%; aspect-ratio: 3 / 4; object-fit: cover; display: block; background: var(--muted, #e5e7eb); cursor: zoom-in; }
      .fr-card-body { padding: 10px; display: flex; flex-direction: column; gap: 8px; }
      .fr-card-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--muted-foreground, #71717a); font-size: 12px; }
      .fr-card-actions { display: flex; align-items: center; gap: 6px; }
      .fr-history-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
      .fr-history-actions { display: flex; align-items: center; gap: 8px; }
      .fr-photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
      .fr-photo { position: relative; border-radius: 8px; overflow: hidden; border: 1px solid var(--border, #e4e4e7); aspect-ratio: 3 / 4; background: var(--muted, #e5e7eb); }
      .fr-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .fr-photo-del { position: absolute; top: 6px; right: 6px; width: 24px; height: 24px; border-radius: 50%; background: rgba(0,0,0,0.55); color: #fff; border: 0; cursor: pointer; display: grid; place-items: center; }
      .fr-photo-del:hover { background: rgba(0,0,0,0.8); }
      .fr-photo-empty { display: grid; place-items: center; border: 1px dashed var(--border, #d4d4d8); border-radius: 8px; aspect-ratio: 3 / 4; color: var(--muted-foreground, #71717a); cursor: pointer; background: var(--card, #ffffff); }
      .fr-photo-empty:hover { background: var(--accent, #f4f4f5); }
      .fr-photos-section { margin-top: 22px; }
      .fr-section-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
      .fr-section-title { display: flex; align-items: center; gap: 8px; font-weight: 650; font-size: 14px; }
      .fr-fab { position: fixed; right: 24px; bottom: 24px; z-index: 30; display: inline-flex; align-items: center; gap: 6px; padding: 12px 18px; border-radius: 999px; background: var(--primary, #18181b); color: var(--primary-foreground, #ffffff); border: 0; cursor: pointer; font-size: 14px; font-weight: 600; box-shadow: 0 6px 20px rgba(0,0,0,0.18); }
      .fr-fab:hover { opacity: 0.92; }
      .fr-fab:disabled { opacity: 0.5; cursor: not-allowed; }
      .fr-ref-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; margin-top: 8px; }
      .fr-ref-thumb { position: relative; border-radius: 7px; overflow: hidden; border: 1px solid var(--border, #e4e4e7); aspect-ratio: 1; background: var(--muted, #e5e7eb); }
      .fr-ref-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .fr-source-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; max-height: 280px; overflow: auto; padding: 4px; }
      .fr-source-item { position: relative; width: 100%; padding: 0; border-radius: 8px; overflow: hidden; border: 2px solid transparent; cursor: pointer; aspect-ratio: 3 / 4; background: var(--muted, #e5e7eb); }
      .fr-source-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .fr-source-item.is-selected { border-color: var(--primary, #18181b); }
      .fr-source-item.is-selected::after { content: "✓"; position: absolute; top: 6px; right: 6px; width: 22px; height: 22px; border-radius: 50%; background: var(--primary, #18181b); color: var(--primary-foreground, #ffffff); display: grid; place-items: center; font-size: 13px; }
      .fr-dialog-tabs { display: flex; gap: 6px; margin-bottom: 14px; border-bottom: 1px solid var(--border, #e4e4e7); }
      .fr-dialog-tab { padding: 8px 12px; font-size: 14px; color: var(--muted-foreground, #71717a); cursor: pointer; border: 0; background: transparent; border-bottom: 2px solid transparent; }
      .fr-dialog-tab.is-active { color: var(--foreground, #18181b); border-bottom-color: var(--primary, #18181b); font-weight: 600; }
      .fr-divider { height: 1px; background: var(--border, #e4e4e7); margin: 16px 0; }
      .fr-caption { color: var(--muted-foreground, #71717a); font-size: 12px; margin-top: 6px; }
      @media (max-width: 900px) {
        .fr-grid { grid-template-columns: 1fr; }
        .fr-header { flex-direction: column; align-items: flex-start; gap: 10px; padding: 12px; }
        .fr-main { padding: 12px; }
      }
    `}</style>
  );
}
