// 贴图工坊入口 —— 文生图 / 图生图工作流 + agent_run 提示词助手
import Header from './components/Header';
import ControlPanel from './components/ControlPanel';
import Gallery from './components/Gallery';
import PreviewDialog from './components/PreviewDialog';
import SplitResultDialog from './components/SplitResultDialog';
import SplitConfirmDialog from './components/SplitConfirmDialog';
import SettingsDialog from './components/SettingsDialog';
import { useConfigData } from './hooks/useConfigData';
import { useGeneration } from './hooks/useGeneration';
import { usePromptAgent } from './hooks/usePromptAgent';
import { useStickerSplit } from './hooks/useStickerSplit';
import { DEFAULT_FORM } from './utils/styles';
import { persistableReferences } from './utils/workflow';
import { SETTING_KEYS } from './utils/settings';

const {
  Button, Check, AlertCircle,
} = window.AgentSpacesUI;

const DRAFT_KEY = 'stickerGeneratorDraft';

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
      .sg-root { height: 100%; min-height: 0; overflow: hidden; display: flex; flex-direction: column; background: var(--sg-bg); color: var(--sg-fg); font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
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

      /* collection 子贴纸内容列表 */
      .sg-collection-box { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; border-top: 1px dashed var(--sg-border); margin-top: 8px; }
      .sg-items-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .sg-items-gen { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; color: #fff; background: linear-gradient(135deg, #f97316, #f43f5e); border: 0; border-radius: 6px; padding: 4px 10px; cursor: pointer; }
      .sg-items-gen:hover:not(:disabled) { filter: brightness(1.08); }
      .sg-items-gen:disabled { opacity: .5; cursor: not-allowed; }
      .sg-items-list { display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow: auto; padding-right: 2px; }
      .sg-item-row { display: flex; align-items: center; gap: 8px; }
      .sg-item-idx { flex: 0 0 auto; width: 22px; height: 22px; border-radius: 999px; background: var(--sg-accent-soft); color: var(--sg-accent); font-size: 11px; font-weight: 800; display: grid; place-items: center; }
      .sg-item-input { flex: 1; min-width: 0; padding: 6px 9px; border: 1px solid var(--sg-border); border-radius: 6px; font-size: 12px; background: var(--sg-card); color: var(--sg-fg); }
      .sg-item-input:focus { outline: none; border-color: var(--sg-accent); }

      /* style picker */
      .sg-style-trigger { width: 100%; justify-content: flex-start; gap: 8px; }
      .sg-style-trigger-thumb { width: 28px; height: 28px; border-radius: 6px; object-fit: cover; flex: 0 0 auto; border: 1px solid var(--sg-border); }
      .sg-style-trigger-label { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .sg-style-custom-count { font-size: 11px; color: var(--sg-muted); }
      .sg-style-dot { width: 14px; height: 14px; border-radius: 999px; flex: 0 0 auto; border: 1px solid rgba(0,0,0,.1); }
      .sg-style-popover { width: 360px; }
      .sg-style-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; max-height: 420px; overflow: auto; padding: 4px; }
      .sg-style-item { position: relative; display: flex; flex-direction: column; gap: 4px; padding: 0; border: 1px solid var(--sg-border); background: var(--sg-card); border-radius: 8px; cursor: pointer; font-size: 11px; font-weight: 600; color: var(--sg-fg); text-align: center; overflow: hidden; }
      .sg-style-item:hover { border-color: var(--sg-accent); }
      .sg-style-item.is-selected { border-color: var(--sg-accent); box-shadow: 0 0 0 2px rgba(249,115,22,.25); }
      .sg-style-preview { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; background: var(--sg-soft); }
      .sg-style-item-name { padding: 4px 6px 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .sg-style-check { position: absolute; top: 5px; right: 5px; width: 18px; height: 18px; color: #fff; background: var(--sg-accent); border-radius: 999px; padding: 2px; box-shadow: 0 1px 4px rgba(0,0,0,.2); }
      .sg-style-custom-tag { position: absolute; top: 5px; left: 5px; font-size: 9px; font-weight: 700; color: var(--sg-fg); background: rgba(255,255,255,.9); border: 1px solid var(--sg-border); padding: 1px 5px; border-radius: 4px; }
      .sg-style-hint { font-size: 11px; color: var(--sg-muted); line-height: 1.5; }

      /* style picker: custom create / delete */
      .sg-style-item-wrap { position: relative; }
      .sg-style-del { position: absolute; top: 4px; right: 4px; width: 20px; height: 20px; border-radius: 4px; border: 0; background: transparent; color: var(--sg-muted); cursor: pointer; display: none; align-items: center; justify-content: center; }
      .sg-style-item-wrap:hover .sg-style-del { display: flex; }
      .sg-style-del:hover { background: #fee2e2; color: #dc2626; }
      .sg-style-create { border-top: 1px solid var(--sg-border); padding: 8px; }
      .sg-style-create-btn { width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px; border: 1px dashed var(--sg-border); background: transparent; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600; color: var(--sg-accent); }
      .sg-style-create-btn:hover { background: var(--sg-accent-soft); border-color: var(--sg-accent); }
      .sg-style-create-form { display: flex; flex-direction: column; gap: 8px; }
      .sg-style-create-head { display: flex; align-items: center; justify-content: space-between; }
      .sg-style-create-close { border: 0; background: transparent; cursor: pointer; color: var(--sg-muted); }
      .sg-style-input { padding: 7px 9px; border: 1px solid var(--sg-border); border-radius: 6px; font-size: 13px; background: var(--sg-card); color: var(--sg-fg); }
      .sg-style-textarea { min-height: 60px; resize: vertical; padding: 7px 9px; border: 1px solid var(--sg-border); border-radius: 6px; font-size: 12px; background: var(--sg-card); color: var(--sg-fg); }

      /* toggles */
      .sg-toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; }
      .sg-toggle-label { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; }
      .sg-divider { height: 1px; background: var(--sg-border); margin: 4px 0; }
      .sg-sub-block { display: flex; flex-direction: column; gap: 8px; padding: 8px; background: var(--sg-soft); border: 1px solid var(--sg-border); border-radius: 8px; }
      .sg-font-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .sg-text-lang-row { display: flex; align-items: center; gap: 8px; }
      .sg-text-lang-trigger { flex: 1; height: 32px; }
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

      /* gallery filter bar */
      .sg-filter-bar { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; background: var(--sg-card); border: 1px solid var(--sg-border); border-radius: 10px; }
      .sg-filter-kinds { display: flex; flex-wrap: wrap; gap: 6px; }
      .sg-filter-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
      .sg-filter-selects { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
      .sg-filter-select { width: 110px; height: 30px; min-width: 0; }
      .sg-filter-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: var(--sg-fg); background: var(--sg-soft); border: 1px solid var(--sg-border); padding: 4px 10px; border-radius: 999px; cursor: pointer; transition: all .15s; }
      .sg-filter-chip:hover:not(:disabled) { border-color: var(--sg-accent); color: var(--sg-accent); }
      .sg-filter-chip.is-active { background: var(--sg-accent); color: #fff; border-color: var(--sg-accent); }
      .sg-filter-chip:disabled { opacity: .4; cursor: not-allowed; }
      .sg-filter-count { font-size: 10px; font-weight: 700; opacity: .7; }
      .sg-filter-chip.is-active .sg-filter-count { opacity: .9; }
      .sg-filter-search { position: relative; display: flex; align-items: center; }
      .sg-filter-search-icon { position: absolute; left: 10px; color: var(--sg-muted); pointer-events: none; }
      .sg-filter-input { flex: 1; width: 100%; padding: 7px 32px 7px 30px; border: 1px solid var(--sg-border); border-radius: 8px; font-size: 13px; background: var(--sg-card); color: var(--sg-fg); }
      .sg-filter-input:focus { outline: none; border-color: var(--sg-accent); }
      .sg-filter-clear { position: absolute; right: 8px; border: 0; background: transparent; cursor: pointer; color: var(--sg-muted); padding: 2px; border-radius: 4px; display: grid; place-items: center; }
      .sg-filter-clear:hover { color: var(--sg-fg); background: var(--sg-soft); }

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
      .sg-card-split-tag { position: absolute; top: 8px; left: 8px; font-size: 10px; font-weight: 800; color: #fff; background: rgba(249,115,22,.92); padding: 2px 8px; border-radius: 999px; }
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
      .sg-preview-dl { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px; background: linear-gradient(135deg, #f97316, #f43f5e); color: #fff; border-radius: 8px; font-weight: 700; text-decoration: none; border: 0; cursor: pointer; width: 100%; }

      /* split result dialog */
      .sg-split-dialog { max-width: 760px; }
      .sg-split-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
      .sg-split-selectall { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; color: var(--sg-fg); background: transparent; border: 1px solid var(--sg-border); border-radius: 6px; padding: 4px 10px; cursor: pointer; }
      .sg-split-selectall:hover { background: var(--sg-soft); }
      .sg-split-zip { margin-left: auto; background: linear-gradient(135deg, #f97316, #f43f5e); color: #fff; border: 0; }
      .sg-split-prompt { font-size: 12px; color: var(--sg-muted); margin-bottom: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .sg-split-error { font-size: 12px; color: #991b1b; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; }
      .sg-split-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; max-height: 56vh; overflow: auto; padding: 2px; }
      .sg-split-cell { position: relative; aspect-ratio: 1; border: 2px solid var(--sg-border); border-radius: 8px; overflow: hidden; cursor: pointer; background: var(--sg-soft); padding: 0; transition: border-color .15s, transform .1s; }
      .sg-split-cell:hover { transform: scale(1.02); }
      .sg-split-cell.is-selected { border-color: var(--sg-accent); box-shadow: 0 0 0 2px rgba(249,115,22,.2); }
      .sg-split-cell img { width: 100%; height: 100%; object-fit: contain; }
      .sg-split-check { position: absolute; top: 5px; left: 5px; width: 22px; height: 22px; border-radius: 5px; background: rgba(255,255,255,.85); display: grid; place-items: center; color: var(--sg-accent); }
      .sg-split-check.is-on { background: var(--sg-accent); color: #fff; }
      .sg-split-idx { position: absolute; bottom: 5px; right: 5px; font-size: 10px; font-weight: 800; color: #fff; background: rgba(0,0,0,.5); border-radius: 999px; padding: 1px 7px; }

      /* split confirm dialog */
      .sg-split-confirm { max-width: 420px; }
      .sg-split-confirm-thumb { margin: 0 0 12px; max-height: 200px; overflow: hidden; border-radius: 8px; border: 1px solid var(--sg-border); display: grid; place-items: center; background: var(--sg-soft); }
      .sg-split-confirm-thumb img { max-width: 100%; max-height: 200px; object-fit: contain; }
      .sg-split-confirm-field { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
      .sg-split-confirm-presets { display: flex; align-items: center; gap: 6px; }

      /* split cell: image + alone-download button */
      .sg-split-cell-img { position: relative; width: 100%; height: 100%; padding: 0; border: 0; background: transparent; cursor: pointer; display: block; }
      .sg-split-cell-img img { width: 100%; height: 100%; object-fit: contain; }
      .sg-split-dl-one { position: absolute; top: 5px; right: 5px; width: 24px; height: 24px; border-radius: 5px; background: rgba(255,255,255,.9); border: 0; cursor: pointer; display: grid; place-items: center; color: var(--sg-accent); opacity: 0; transition: opacity .15s; }
      .sg-split-cell:hover .sg-split-dl-one { opacity: 1; }
      .sg-split-dl-one:hover { background: var(--sg-accent); color: #fff; }
      .sg-split-dl-one:disabled { opacity: .7; cursor: wait; }

      /* prompt agent: 内嵌在提示词输入框右下角 */
      .sg-prompt-wrap { position: relative; }
      .sg-textarea-with-agent { padding-bottom: 38px; }
      .sg-pa-trigger { position: absolute; right: 8px; bottom: 8px; z-index: 2; display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; color: #fff; background: linear-gradient(135deg, #f97316, #f43f5e); border: 0; border-radius: 7px; padding: 5px 10px; cursor: pointer; box-shadow: 0 2px 8px rgba(249,115,22,.35); }
      .sg-pa-trigger:hover { filter: brightness(1.08); }
      .sg-pa-trigger:disabled { opacity: .5; cursor: not-allowed; }
      .sg-pa-panel { margin-top: 8px; background: var(--sg-soft); border: 1px solid var(--sg-border); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
      .sg-pa-head { display: flex; align-items: center; justify-content: space-between; }
      .sg-pa-title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: var(--sg-fg); }
      .sg-pa-close { border: 0; background: transparent; cursor: pointer; color: var(--sg-muted); padding: 2px; border-radius: 4px; }
      .sg-pa-close:hover { background: var(--sg-card); color: var(--sg-fg); }
      .sg-pa-row { display: flex; flex-direction: column; gap: 4px; }
      .sg-pa-input { padding: 7px 9px; border: 1px solid var(--sg-border); border-radius: 6px; font-size: 13px; background: var(--sg-card); color: var(--sg-fg); }
      .sg-pa-status { font-size: 12px; color: var(--sg-muted); display: flex; align-items: center; gap: 6px; }
      .sg-pa-warn { color: #b45309; }
      .sg-pa-run { width: 100%; }
      .sg-pa-result { font-size: 13px; line-height: 1.5; background: var(--sg-card); border: 1px solid var(--sg-border); border-radius: 8px; padding: 9px; max-height: 160px; overflow: auto; white-space: pre-wrap; }
      .sg-pa-actions { display: flex; justify-content: flex-end; gap: 6px; }

      .sg-floating-status { position: fixed; right: 18px; bottom: 80px; z-index: 80; background: var(--sg-fg); color: var(--sg-bg); border-radius: 7px; padding: 8px 12px; font-size: 13px; }
      .sg-error-bar { margin: 0 0 8px; padding: 9px 12px; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; border-radius: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px; }
      .sg-success-bar { margin: 0 0 8px; padding: 9px 12px; background: #ecfdf5; color: #065f46; border: 1px solid #bbf7d0; border-radius: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px; }

      .sg-icon-xs { width: 13px; height: 13px; flex: 0 0 auto; }
      .sg-icon-sm { width: 16px; height: 16px; flex: 0 0 auto; }
      .sg-icon-lg { width: 36px; height: 36px; opacity: .5; }
      .sg-spin { animation: sg-spin 1s linear infinite; }
      @keyframes sg-spin { to { transform: rotate(360deg); } }

      /* header settings button */
      .sg-header-settings { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--sg-fg); background: var(--sg-card); border: 1px solid var(--sg-border); padding: 6px 12px; border-radius: 8px; cursor: pointer; }
      .sg-header-settings:hover { background: var(--sg-soft); border-color: var(--sg-accent); color: var(--sg-accent); }

      /* settings dialog */
      .sg-set-dialog { max-width: 520px; }
      .sg-set-body { display: flex; flex-direction: column; gap: 12px; padding: 4px 0; max-height: 60vh; overflow: auto; }
      .sg-set-section-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; color: var(--sg-muted); padding-top: 8px; border-top: 1px solid var(--sg-border); margin-top: 4px; }
      .sg-set-section-title:first-child { border-top: 0; margin-top: 0; padding-top: 0; }
      .sg-set-field { display: flex; flex-direction: column; gap: 6px; }
      .sg-set-label { font-size: 13px; font-weight: 700; color: var(--sg-fg); }
      .sg-set-slot-wrap { position: relative; }
      .sg-set-reset { position: absolute; right: 0; top: 0; font-size: 11px; height: 24px; padding: 0 8px; }
      .sg-set-slot { width: 100%; display: flex; align-items: center; gap: 8px; padding: 9px 12px; border: 1px solid var(--sg-border); background: var(--sg-card); border-radius: 8px; cursor: pointer; font-size: 13px; color: var(--sg-fg); text-align: left; }
      .sg-set-slot:hover { border-color: var(--sg-accent); background: var(--sg-soft); }
      .sg-set-slot-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .sg-set-tag { font-size: 10px; font-weight: 700; color: var(--sg-muted); border: 1px solid var(--sg-border); padding: 1px 6px; border-radius: 4px; }
      .sg-set-desc { font-size: 11px; color: var(--sg-muted); line-height: 1.5; }
      .sg-set-agent-row { display: flex; align-items: center; gap: 8px; }
      .sg-set-ok { color: #10b981; }
      .sg-set-error { font-size: 12px; color: #991b1b; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 8px 10px; }
      .sg-set-foot { display: flex; justify-content: flex-end; gap: 8px; padding-top: 12px; border-top: 1px solid var(--sg-border); margin-top: 4px; }

      /* control panel model custom input */
      .sg-model-custom { margin-top: 6px; }

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
  const { history, customStyles, settings, saveSettings } = useConfigData();
  const [form, setForm] = React.useState(() => ({
    ...DEFAULT_FORM,
    ...(AS.getUserSetting?.(DRAFT_KEY, {}) || {}),
    model: AS.getUserSetting?.(SETTING_KEYS.draftModel, '') || settings.defaultModel || '',
  }));
  const [preview, setPreview] = React.useState(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [splitTarget, setSplitTarget] = React.useState(null); // 待拆分项（打开数量确认对话框）

  // settings 里的默认模型变化时，若用户未单独选过模型，则同步填入
  React.useEffect(() => {
    const draftModel = AS.getUserSetting?.(SETTING_KEYS.draftModel, '');
    if (!draftModel && settings.defaultModel) {
      setForm((prev) => (prev.model ? prev : { ...prev, model: settings.defaultModel }));
    }
  }, [settings.defaultModel]);

  // 草稿持久化（不含 File 对象）
  React.useEffect(() => {
    AS.saveUserSettings?.({
      [DRAFT_KEY]: { ...form, references: persistableReferences(form.references) },
      [SETTING_KEYS.draftModel]: form.model,
    });
  }, [form]);

  const { running, status, error, generate } = useGeneration({ form, customStyles, settings });

  // 提示词 AI 助手：内嵌在提示词输入框右下角（由 ControlPanel 渲染）
  const promptAgent = usePromptAgent({ settings, currentPrompt: form.prompt });

  // 一键拆分：贴纸集合图 → 弹出 SplitResultDialog 展示结果（不落库）
  const stickerSplit = useStickerSplit();
  const splitError = stickerSplit.error;

  // 保存设置：写入 settings.json + 本地兜底 agent id
  const onSaveSettings = (next) => {
    saveSettings(next);
    AS.saveUserSettings?.({
      [SETTING_KEYS.agentConfigId]: next.agentConfigId || '',
      [SETTING_KEYS.agentMeta]: { name: next.agentName, modelProvider: next.agentModelProvider },
    });
    setSettingsOpen(false);
  };

  return (
    <div className="sg-root">
      <Style />
      <Header count={history.length} onOpenSettings={() => setSettingsOpen(true)} />
      {error && <div className="sg-error-bar"><AlertCircle className="sg-icon-sm" />{error}</div>}
      {splitError && <div className="sg-error-bar"><AlertCircle className="sg-icon-sm" />{splitError}</div>}
      {status && !running && <div className="sg-success-bar"><Check className="sg-icon-sm" />{status}</div>}

      <main className="sg-main">
        <div className="sg-left">
          <ControlPanel
            form={form}
            onChange={setForm}
            customStyles={customStyles}
            running={running}
            onGenerate={generate}
            promptAgent={promptAgent}
            onSaveCustomStyle={() => {}}
            onDeleteCustomStyle={() => {}}
          />
        </div>
        <div className="sg-right">
          <Gallery
            history={history}
            running={running}
            onPreview={setPreview}
            onDelete={(id) => AS.invokeService('remove_result', { id })}
            onClear={() => { if (window.confirm('确定清空所有贴图？')) AS.invokeService('clear_results'); }}
            onSplit={setSplitTarget}
            splittingIds={stickerSplit.splittingIds}
          />
        </div>
      </main>

      <PreviewDialog item={preview} onClose={() => setPreview(null)} onDelete={(id) => AS.invokeService('remove_result', { id })} />

      {/* 拆分结果对话框 */}
      <SplitResultDialog
        open={!!stickerSplit.result}
        pieces={stickerSplit.result?.pieces || []}
        sourcePrompt={stickerSplit.result?.sourcePrompt || ''}
        onClose={stickerSplit.clearResult}
      />

      {/* 拆分前数量确认对话框 */}
      <SplitConfirmDialog
        open={!!splitTarget}
        item={splitTarget}
        defaultCount={splitTarget?.collectionCount || 6}
        onClose={() => setSplitTarget(null)}
        onConfirm={(count) => {
          const target = splitTarget;
          setSplitTarget(null);
          if (target) stickerSplit.split(target, count);
        }}
      />

      {/* 设置对话框 */}
      <SettingsDialog
        open={settingsOpen}
        value={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={onSaveSettings}
      />

      {running && <div className="sg-floating-status">正在生成贴图，请稍候...</div>}
    </div>
  );
}

export default App;
