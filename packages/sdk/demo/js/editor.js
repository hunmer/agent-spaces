/**
 * Editor 演示 —— editor（tree/content/save/search/CRUD/state/import）+ worktree（list/CRUD/diff/merge/PR）
 */
import { sdk, $, run, loadWorkspaceOptions, escapeHtml } from './sdk-config.js';

const wsSelect = $('#ws-select');
loadWorkspaceOptions(wsSelect);

function wsId() {
  const id = wsSelect.value;
  if (!id) throw new Error('请先选择工作区');
  return id;
}

function parseJSON(text, hint) {
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`JSON 解析失败：${hint}`);
  }
}

function renderWt(container, out, list) {
  if (!Array.isArray(list) || list.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;">（无 worktree）</div>';
    out.textContent = JSON.stringify(list, null, 2);
    return;
  }
  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="text-align:left;color:var(--muted);border-bottom:1px solid var(--border);">
        <th style="padding:6px 8px;">branch</th>
        <th style="padding:6px 8px;">id</th>
        <th style="padding:6px 8px;">path</th>
      </tr></thead>
      <tbody>
        ${list.map((w) => `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:6px 8px;font-weight:500;">${escapeHtml(w.branch || w.name || '')}</td>
            <td style="padding:6px 8px;font-family:monospace;font-size:12px;">${escapeHtml(w.id || '')}</td>
            <td style="padding:6px 8px;font-size:12px;color:var(--muted);">${escapeHtml(w.path || '-')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  out.textContent = JSON.stringify(list, null, 2);
}

// ---- 文件树 ----
$('#btn-tree').addEventListener('click', (e) =>
  run(e.target, $('#out-tree'), () => sdk().editor.tree(wsId())),
);
$('#btn-exists').addEventListener('click', (e) =>
  run(e.target, $('#out-tree'), () => sdk().editor.exists(wsId(), $('#in-path').value.trim())),
);
$('#btn-reveal').addEventListener('click', (e) =>
  run(e.target, $('#out-tree'), () => sdk().editor.reveal(wsId(), $('#in-path').value.trim())),
);

// ---- 读写 ----
const rwPath = () => $('#in-rw-path').value.trim();
$('#btn-content').addEventListener('click', (e) =>
  run(e.target, $('#out-rw'), () => sdk().editor.content(wsId(), rwPath())),
);
$('#btn-save').addEventListener('click', (e) =>
  run(e.target, $('#out-rw'), async () => {
    const content = $('#in-rw-content').value;
    await sdk().editor.save(wsId(), rwPath(), content);
    return { message: '已保存', path: rwPath() };
  }),
);

// ---- 文件操作 ----
$('#btn-copy').addEventListener('click', (e) =>
  run(e.target, $('#out-op'), () => sdk().editor.copy(wsId(), $('#in-src').value.trim(), $('#in-dest').value.trim())),
);
$('#btn-rename').addEventListener('click', (e) =>
  run(e.target, $('#out-op'), () => sdk().editor.rename(wsId(), $('#in-src').value.trim(), $('#in-dest').value.trim())),
);
$('#btn-delete').addEventListener('click', (e) =>
  run(e.target, $('#out-op'), () => sdk().editor.deleteFile(wsId(), $('#in-src').value.trim())),
);
$('#btn-search').addEventListener('click', (e) =>
  run(e.target, $('#out-op'), () => sdk().editor.search(wsId(), { query: $('#in-search').value.trim() })),
);

// ---- 编辑器状态 ----
$('#btn-state-get').addEventListener('click', (e) =>
  run(e.target, $('#out-state'), () => sdk().editor.editorState(wsId())),
);
$('#btn-state-save').addEventListener('click', (e) =>
  run(e.target, $('#out-state'), async () => {
    const state = parseJSON($('#in-state').value, 'state');
    await sdk().editor.saveEditorState(wsId(), state);
    return { message: '已保存编辑器状态' };
  }),
);

// ---- 导入 ----
const target = () => $('#in-target').value.trim();
$('#btn-import-url').addEventListener('click', (e) =>
  run(e.target, $('#out-import'), () => sdk().editor.importUrl(wsId(), $('#in-url').value.trim(), target())),
);
$('#btn-import-path').addEventListener('click', (e) =>
  run(e.target, $('#out-import'), () => sdk().editor.importPath(wsId(), $('#in-abspath').value.trim(), target())),
);
$('#btn-upload').addEventListener('click', (e) =>
  run(e.target, $('#out-import'), async () => {
    const files = Array.from($('#in-files').files);
    if (files.length === 0) throw new Error('请选择文件');
    return sdk().editor.uploadFiles(wsId(), target(), files);
  }),
);

// ---- Worktree ----
$('#btn-wt-list').addEventListener('click', (e) =>
  run(e.target, $('#out-wt'), async () => {
    const list = await sdk().worktree.list(wsId());
    renderWt($('#wt-table'), $('#out-wt'), list);
    return list;
  }),
);
const wtId = () => $('#in-wt-id').value.trim();
$('#btn-wt-create').addEventListener('click', (e) =>
  run(e.target, $('#out-wt-op'), async () => {
    const data = parseJSON($('#in-wt-data').value, 'create data') || {};
    return sdk().worktree.create(wsId(), data);
  }, { onDone: () => $('#btn-wt-list').click() }),
);
$('#btn-wt-diff').addEventListener('click', (e) =>
  run(e.target, $('#out-wt-op'), () => sdk().worktree.diff(wsId(), wtId())),
);
$('#btn-wt-merge').addEventListener('click', (e) =>
  run(e.target, $('#out-wt-op'), () => sdk().worktree.merge(wsId(), wtId())),
);
$('#btn-wt-pr').addEventListener('click', (e) =>
  run(e.target, $('#out-wt-op'), () => sdk().worktree.createPR(wsId(), wtId())),
);
$('#btn-wt-remove').addEventListener('click', (e) =>
  run(e.target, $('#out-wt-op'), () => sdk().worktree.remove(wsId(), wtId())),
);
