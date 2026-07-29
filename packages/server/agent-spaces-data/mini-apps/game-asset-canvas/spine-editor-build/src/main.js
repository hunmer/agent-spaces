/**
 * Spine 骨骼编辑器主入口。
 *
 * 职责：
 * 1. 初始化 SpineEditorApp（Pixi）+ 各 UI 模块（Toolbar/AssetFilter/BoneTree/TransformPanel）
 * 2. 监听父窗口 postMessage（注入资源 / 背景）
 * 3. 主动 postMessage 到父窗口（ready / 导出 / close）
 * 4. 串联各模块回调（选中同步、变换应用、模式切换、导出）
 *
 * postMessage 协议（与 SpineEditorDialog.jsx 配对）：
 *   父→本：spine:inject-assets {skelDataUrl, atlasDataUrl, pngDataUrl, name}
 *          spine:inject-background {imageUrl}
 *   本→父：spine:ready
 *          spine:export-pose {json, name}
 *          spine:export-screenshot {dataUrl, name}
 *          spine:export-video {dataUrl, name}    // 动作录制（WebM）
 *          spine:export-spine {files:[{name,dataUrl}]}
 *          spine:close
 */
import './styles.css';
import { SpineEditorApp } from './core/SpineEditorApp';
import { RecordManager } from './core/RecordManager';
import { loadSpine, getAnimations, getSkins, BoneVisibility } from './loaders/SpineLoader';
import { PoseExporter } from './exporters/PoseExporter';
import { Toolbar } from './ui/Toolbar';
import { AssetFilter } from './ui/AssetFilter';
import { BoneTree } from './ui/BoneTree';
import { TransformPanel } from './ui/TransformPanel';

// ===== 全局状态 =====
let app = null;           // SpineEditorApp
let toolbar = null;
let filter = null;
let boneTree = null;
let transformPanel = null;
let pendingAssets = null; // 就绪前收到的注入资源（ready 后消费）
let loadedAssetsRaw = null; // 最近加载的原始资源（用于「下载 Spine」导出）
let visibility = null;    // BoneVisibility 实例（骨骼显隐管理）
let recorder = null;      // RecordManager（canvas 动作录制）

function setStatus(text, type = 'ready') {
  const bar = document.getElementById('statusbar');
  const dot = bar?.querySelector('.status-dot');
  if (bar) {
    bar.innerHTML = `<span class="status-dot ${type}"></span><span>${escapeHtml(text)}</span>`;
  }
}

function setHint(text) {
  const hint = document.getElementById('canvas-hint');
  if (hint) {
    if (text) { hint.textContent = text; hint.style.display = ''; }
    else hint.style.display = 'none';
  }
}

function postToParent(type, payload = {}) {
  try {
    window.parent?.postMessage({ type, payload }, '*');
  } catch (e) {
    console.error('[spine-editor] postToParent failed:', e);
  }
}

// ===== 初始化 =====
async function init() {
  const canvas = document.getElementById('pixi-canvas');
  app = new SpineEditorApp(canvas);
  await app.init();

  // 工具栏
  toolbar = new Toolbar(document.getElementById('toolbar'), {
    onModeChange: (mode) => app.setMode(mode),
    onAnimationChange: (name) => app.setAnimation(name),
    onSkinChange: (name) => app.setSkin(name),
    onUndo: () => { app.undo(); refreshUndoRedo(); },
    onRedo: () => { app.redo(); refreshUndoRedo(); },
    onFitView: () => app.fitView(),
    onExportPose: exportPose,
    onExportScreenshot: exportScreenshot,
    onExportSpine: exportSpineFiles,
    onToggleRecord: toggleRecord,
  });

  // 录制管理器（检测不支持时禁用按钮）
  recorder = new RecordManager(canvas);
  if (!RecordManager.isSupported()) {
    const btn = document.getElementById('btn-record');
    if (btn) { btn.disabled = true; btn.title = '当前浏览器不支持录制'; }
  }

  // 角色库过滤（左侧 tab1）
  filter = new AssetFilter(document.getElementById('tab-library'), {
    onSelect: (charBase) => loadFromLibrary(charBase),
  });

  // 骨骼显隐管理器
  visibility = new BoneVisibility();

  // 骨骼树（左侧 tab2）
  boneTree = new BoneTree(document.getElementById('tab-bones'), {
    onSelect: (bone) => {
      app.gizmo.selectBone(bone);
      transformPanel.setBone(bone);
    },
    visibility,
    onToggleVisibility: (bone) => {
      visibility.toggle(app?.spine, bone);
      boneTree.refresh();
      app.gizmo.redraw();
    },
  });

  // 变换面板（右侧）
  transformPanel = new TransformPanel(document.getElementById('right-panel'), {
    onApply: (bone, values) => {
      app.applyTransform(bone, values);
      setStatus('已应用变换', 'modified');
      refreshUndoRedo();
    },
    onFlip: (bone, axis) => { app.flip(bone, axis); refreshUndoRedo(); },
    onFlipCharacter: (axis) => { app.flipCharacter(axis); refreshUndoRedo(); },
    onReset: (bone) => { app.resetBone(bone); refreshUndoRedo(); },
    onResetAll: () => { app.resetAll(); refreshUndoRedo(); },
  });

  // SpineEditorApp 回调
  app.setCallbacks({
    onSelect: (bone) => {
      transformPanel.setBone(bone);
      boneTree.selectByName(bone?.data?.name || null);
    },
    onLiveTransform: (bone) => {
      transformPanel.setBone(bone, true);
    },
    onModified: (modified) => {
      setStatus(modified ? '已修改（未导出）' : '就绪', modified ? 'modified' : 'ready');
    },
  });

  // tab 切换
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    };
  });

  // 全局快捷键
  bindShortcuts();

  setStatus('就绪：上传 .skel/.atlas/.png 或从角色库选择', 'ready');
  setHint('就绪：上传 .skel/.atlas/.png\n或从左侧角色库选择角色');

  // 通知父窗口就绪
  postToParent('spine:ready');

  // 消费就绪前缓存的注入请求
  if (pendingAssets) {
    const assets = pendingAssets;
    pendingAssets = null;
    injectAssets(assets);
  }
}

// ===== 加载资源 =====
async function loadSpineInto(assets) {
  setHint('加载中…');
  setStatus(`正在加载 ${assets.name || 'spine'}…`, 'modified');
  try {
    const spine = await loadSpine({
      skel: assets.skelDataUrl || assets.skel,
      atlas: assets.atlasDataUrl || assets.atlas,
      png: assets.pngDataUrl || assets.png,
      name: assets.name || 'spine',
    });
    app.setSpine(spine);
    // 重置骨骼显隐状态
    visibility?.reset(spine);

    // 更新 UI
    const anims = getAnimations(spine);
    const skins = getSkins(spine);
    toolbar.setAnimations(anims);
    toolbar.setSkins(skins);
    boneTree.setSpine(spine);
    transformPanel.setBone(null);

    // 默认皮肤
    if (skins.length) app.setSkin(skins[0]);

    setHint(null);
    setStatus(`已加载：${spine.name}（Spine ${spine._spineVersion}，${anims.length} 动画 / ${skins.length} 皮肤）`, 'ready');
    refreshUndoRedo();
    return spine;
  } catch (err) {
    console.error('[spine-editor] loadSpine failed:', err);
    setHint('加载失败');
    setStatus(`加载失败：${err?.message || String(err)}`, 'error');
    return null;
  }
}

/** 注入父窗口传来的资源（dataUrl 形式） */
async function injectAssets(assets) {
  loadedAssetsRaw = assets;
  await loadSpineInto(assets);
}

/** 从角色库加载（需资源 base URL，默认指向参考仓库 GitHub Pages） */
async function loadFromLibrary(charBase) {
  // 角色库的资源路径约定：参考仓库用 ./assets/<skin>.skel 等。
  // 本 SPA 作为 vendor 内嵌，资源不在本地，需指向远程。
  // 可配置 base URL（这里默认参考仓库 gh-pages）。
  const LIBRARY_BASE = 'https://FrankoFPM.github.io/Spine-Viewer-Web/assets/';
  const skin = (charBase.skin && charBase.skin[0]) || charBase.asset || charBase.name;
  const base = `${LIBRARY_BASE}${skin}`;
  setStatus(`正在从仓库下载 ${skin}…`, 'modified');
  setHint(`下载 ${skin} 中…`);
  try {
    // 下载三个文件：skel/atlas/png 全部转 dataUrl（统一格式 + 可用于「下载 Spine」导出）
    const [skelDataUrl, atlasDataUrl, pngDataUrl] = await Promise.all([
      fetch(`${base}.skel`).then((r) => { if (!r.ok) throw new Error(`.skel ${r.status}`); return blobToDataUrl(r); }),
      fetch(`${base}.atlas`).then((r) => { if (!r.ok) throw new Error(`.atlas ${r.status}`); return blobToDataUrl(r); }),
      fetch(`${base}.png`).then((r) => { if (!r.ok) throw new Error(`.png ${r.status}`); return blobToDataUrl(r); }),
    ]);
    const spine = await loadSpine({
      skel: skelDataUrl,
      atlas: atlasDataUrl,
      png: pngDataUrl,
      name: charBase.name,
    });
    app.setSpine(spine);
    // 重置骨骼显隐状态
    visibility?.reset(spine);
    const anims = getAnimations(spine);
    const skins = getSkins(spine);
    toolbar.setAnimations(anims);
    toolbar.setSkins(skins);
    boneTree.setSpine(spine);
    transformPanel.setBone(null);
    if (skins.length) app.setSkin(skins[0]);
    // 缓存原始 dataUrl（供「下载 Spine」导出）
    loadedAssetsRaw = { name: charBase.name, skelDataUrl, atlasDataUrl, pngDataUrl };
    setHint(null);
    setStatus(`已加载：${charBase.name}（Spine ${spine._spineVersion}）`, 'ready');
    refreshUndoRedo();
  } catch (err) {
    console.error('[spine-editor] loadFromLibrary failed:', err);
    setHint('下载失败：' + (err?.message || err));
    setStatus(`下载失败：${err?.message || String(err)}`, 'error');
  }
}

/** fetch Response → base64 dataUrl */
function blobToDataUrl(resp) {
  return resp.blob().then((b) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result);
    r.onerror = () => reject(new Error('转 dataUrl 失败'));
    r.readAsDataURL(b);
  }));
}

// ===== 导出 =====
function exportPose() {
  if (!app?.spine) { setStatus('无角色可导出', 'error'); return; }
  const json = PoseExporter.toJson(app.spine);
  const name = `${app.spine.name || 'spine'}-pose.json`;
  postToParent('spine:export-pose', { json, name });
  setStatus(`已导出姿势：${name}`, 'ready');
}

function exportScreenshot() {
  if (!app?.spine) { setStatus('无角色可截图', 'error'); return; }
  const dataUrl = app.exportScreenshot();
  if (!dataUrl) { setStatus('截图失败', 'error'); return; }
  const name = `${app.spine.name || 'spine'}-${Date.now()}.png`;
  postToParent('spine:export-screenshot', { dataUrl, name });
  setStatus(`已截图：${name}（已回传节点）`, 'ready');
}

/** 切换录制：开始（自动切播放模式）/停止（回传 WebM） */
async function toggleRecord() {
  if (!recorder) return;
  if (!recorder.isRecording) {
    // 开始录制
    if (!app?.spine) { setStatus('无角色可录制，先加载角色', 'error'); return; }
    try {
      // pose 模式画面几乎静止，动作录制需动画推进 → 自动切 play 模式
      if (app.mode !== 'play') {
        app.setMode('play');
        toolbar.setMode('play');
      }
      recorder.start({ fps: 30 });
      toolbar.setRecording(true);
      setStatus('录制中…再次点击停止', 'modified');
    } catch (err) {
      console.error('[spine-editor] record start failed:', err);
      setStatus(`录制失败：${err?.message || String(err)}`, 'error');
    }
  } else {
    // 停止录制
    setStatus('正在生成视频…', 'modified');
    const dataUrl = await recorder.stop();
    toolbar.setRecording(false);
    if (!dataUrl) { setStatus('录制失败：未能生成视频', 'error'); return; }
    const name = `${app.spine?.name || 'spine'}-${Date.now()}.webm`;
    postToParent('spine:export-video', { dataUrl, name });
    setStatus(`已录制：${name}（已回传节点）`, 'ready');
  }
}

async function exportSpineFiles() {
  if (!loadedAssetsRaw) { setStatus('无可导出的原始文件', 'error'); return; }
  const name = loadedAssetsRaw.name || 'spine';
  const files = [];
  if (loadedAssetsRaw.skelDataUrl) files.push({ name: `${name}.skel`, dataUrl: loadedAssetsRaw.skelDataUrl });
  if (loadedAssetsRaw.atlasDataUrl) files.push({ name: `${name}.atlas`, dataUrl: loadedAssetsRaw.atlasDataUrl });
  if (loadedAssetsRaw.pngDataUrl) files.push({ name: `${name}.png`, dataUrl: loadedAssetsRaw.pngDataUrl });
  if (!files.length) { setStatus('无可导出的原始文件', 'error'); return; }
  setStatus(`正在打包 ZIP（${files.length} 个文件）…`, 'modified');
  try {
    // 在 iframe 内用 JSZip 打包，直接触发浏览器下载（不回传 mini-app）
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (const f of files) {
      const blob = await (await fetch(f.dataUrl)).blob();
      zip.file(f.name, blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`已下载 ${name}.zip（${files.length} 个文件）`, 'ready');
  } catch (err) {
    console.error('[spine-editor] exportSpineFiles failed:', err);
    setStatus(`打包失败：${err?.message || String(err)}`, 'error');
  }
}

function refreshUndoRedo() {
  toolbar?.updateUndoRedo(app.canUndo(), app.canRedo());
}

// ===== 快捷键 =====
function bindShortcuts() {
  window.addEventListener('keydown', (e) => {
    const inInput = document.activeElement?.tagName === 'INPUT' ||
      document.activeElement?.tagName === 'TEXTAREA' ||
      document.activeElement?.tagName === 'SELECT';
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) { app.redo(); } else { app.undo(); }
      refreshUndoRedo();
    } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
      e.preventDefault();
      app.redo();
      refreshUndoRedo();
    } else if (e.code === 'KeyF' && !inInput) {
      e.preventDefault();
      app.fitView();
    }
  });
}

// ===== postMessage 监听（父→本） =====
window.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (typeof msg !== 'object' || !msg.type) return;
  console.log('[spine-editor] recv', msg.type);
  if (msg.type === 'spine:inject-assets') {
    if (app?.app) {
      injectAssets(msg.payload);
    } else {
      pendingAssets = msg.payload; // 就绪前缓存
    }
  } else if (msg.type === 'spine:inject-background') {
    // 背景：可选，暂简化为不处理（可作为后续增强）
  }
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 启动
init().catch((err) => {
  console.error('[spine-editor] init failed:', err);
  setStatus(`初始化失败：${err?.message || String(err)}`, 'error');
});
