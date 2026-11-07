/**
 * Data 演示 —— data（全局树/读写/导入导出）+ search（code/files）+ codeFavorites（list/create/delete_）
 */
import { sdk, $, run, loadWorkspaceOptions, escapeHtml } from './sdk-config.js';

const wsSelect = $('#ws-select');
loadWorkspaceOptions(wsSelect);
function wsId() {
  const id = wsSelect.value;
  if (!id) throw new Error('请先选择工作区');
  return id;
}

// ---- data 树 ----
$('#btn-tree').addEventListener('click', (e) =>
  run(e.target, $('#out-data'), () => sdk().data.tree()),
);
$('#btn-content').addEventListener('click', (e) =>
  run(e.target, $('#out-data'), () => sdk().data.content($('#in-path').value.trim())),
);
$('#btn-save').addEventListener('click', (e) =>
  run(e.target, $('#out-data'), async () => {
    await sdk().data.save($('#in-path').value.trim(), $('#in-content').value);
    return { message: '已保存' };
  }),
);

// ---- data 文件操作 ----
$('#btn-delete').addEventListener('click', (e) =>
  run(e.target, $('#out-op'), () => sdk().data.deleteFile($('#in-src').value.trim())),
);
$('#btn-rename').addEventListener('click', (e) =>
  run(e.target, $('#out-op'), () => sdk().data.rename($('#in-src').value.trim(), $('#in-dest').value.trim())),
);
$('#btn-copy').addEventListener('click', (e) =>
  run(e.target, $('#out-op'), () => sdk().data.copy($('#in-src').value.trim(), $('#in-dest').value.trim())),
);

// ---- 导入导出 ----
$('#btn-export').addEventListener('click', (e) =>
  run(e.target, $('#out-io'), () => sdk().data.exportZip()),
);
$('#btn-import-zip').addEventListener('click', (e) =>
  run(e.target, $('#out-io'), async () => {
    const file = $('#in-zip').files[0];
    if (!file) throw new Error('请选择 zip 文件');
    const fd = new FormData();
    fd.append('file', file);
    return sdk().data.importZip(fd);
  }),
);
$('#btn-ccswitch').addEventListener('click', (e) =>
  run(e.target, $('#out-io'), () => sdk().data.importCcSwitch()),
);
$('#btn-ccswitch-preview').addEventListener('click', (e) =>
  run(e.target, $('#out-io'), () => sdk().data.ccSwitchPreview()),
);

// ---- search ----
$('#btn-search-code').addEventListener('click', (e) =>
  run(e.target, $('#out-search'), () => sdk().search.code(wsId(), { query: $('#in-query').value.trim() })),
);
$('#btn-search-files').addEventListener('click', (e) =>
  run(e.target, $('#out-search'), () => sdk().search.files(wsId(), $('#in-query').value.trim())),
);

// ---- codeFavorites ----
function renderFav(container, out, list) {
  if (!Array.isArray(list) || list.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;">（无收藏）</div>';
    out.textContent = JSON.stringify(list, null, 2);
    return;
  }
  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="text-align:left;color:var(--muted);border-bottom:1px solid var(--border);">
        <th style="padding:6px 8px;">title</th>
        <th style="padding:6px 8px;">id</th>
      </tr></thead>
      <tbody>
        ${list.map((f) => `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:6px 8px;font-weight:500;">${escapeHtml(f.title || '')}</td>
            <td style="padding:6px 8px;font-family:monospace;font-size:12px;">${escapeHtml(f.id || '')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  out.textContent = JSON.stringify(list, null, 2);
}

$('#btn-fav-list').addEventListener('click', (e) =>
  run(e.target, $('#out-fav'), async () => {
    const list = await sdk().codeFavorites.list(wsId());
    renderFav($('#fav-table'), $('#out-fav'), list);
    return list;
  }),
);
$('#btn-fav-create').addEventListener('click', (e) =>
  run(e.target, $('#out-fav'), async () => {
    const title = $('#in-fav-title').value.trim();
    const path = $('#in-fav-path').value.trim();
    if (!title) throw new Error('请输入 title');
    return sdk().codeFavorites.create(wsId(), { title, path });
  }, { onDone: () => $('#btn-fav-list').click() }),
);
$('#btn-fav-del').addEventListener('click', (e) =>
  run(e.target, $('#out-fav'), () => sdk().codeFavorites.delete_(wsId(), $('#in-fav-id').value.trim())),
);
