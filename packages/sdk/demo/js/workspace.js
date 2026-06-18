/**
 * Workspace 演示 —— list / get / create / browseFolder
 */
import { sdk, $, run, escapeHtml } from './sdk-config.js';

// 渲染列表为简易表格，并回填原始 JSON
function renderTable(container, out, list) {
  if (!Array.isArray(list) || list.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;">（无工作区）</div>';
    return;
  }
  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="text-align:left;color:var(--muted);border-bottom:1px solid var(--border);">
        <th style="padding:6px 8px;">name</th>
        <th style="padding:6px 8px;">id</th>
        <th style="padding:6px 8px;">boundDirs</th>
      </tr></thead>
      <tbody>
        ${list.map((w) => `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:6px 8px;font-weight:500;">${escapeHtml(w.name || '')}</td>
            <td style="padding:6px 8px;font-family:monospace;font-size:12px;">${escapeHtml(w.id || '')}</td>
            <td style="padding:6px 8px;font-size:12px;color:var(--muted);">${escapeHtml((w.boundDirs || []).join(', '))}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  out.textContent = JSON.stringify(list, null, 2);
}

// 列表（进入页面自动加载一次）
$('#btn-list').addEventListener('click', (e) =>
  run(e.target, $('#out-list'), async () => {
    const list = await sdk().workspace.list();
    renderTable($('#ws-table'), $('#out-list'), list);
    return list;
  }),
);
window.addEventListener('load', () => $('#btn-list').click());

// 查询单个
$('#btn-get').addEventListener('click', (e) =>
  run(e.target, $('#out-get'), async () => {
    const id = $('#in-get').value.trim();
    if (!id) throw new Error('请输入 workspace id');
    return sdk().workspace.get(id);
  }),
);

// 创建
$('#btn-create').addEventListener('click', (e) =>
  run(e.target, $('#out-create'), async () => {
    const name = $('#in-name').value.trim();
    if (!name) throw new Error('请输入名称');
    return sdk().workspace.create({ name });
  }, { onDone: () => $('#btn-list').click() }),
);

// 浏览文件夹
$('#btn-browse').addEventListener('click', (e) =>
  run(e.target, $('#out-browse'), async () => {
    const path = $('#in-path').value.trim();
    return sdk().workspace.browseFolder(path || undefined);
  }),
);
