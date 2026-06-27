/**
 * Task 演示 —— list / create / get / update / delete_ / retry / cancel / reorder
 */
import { sdk, $, run, loadWorkspaceOptions, escapeHtml } from './sdk-config.js';

const wsSelect = $('#ws-select');
loadWorkspaceOptions(wsSelect);
wsSelect.addEventListener('change', () => $('#btn-list').click());

function wsId() {
  const id = wsSelect.value;
  if (!id) throw new Error('请先选择工作区');
  return id;
}

function parseJSON(text, hint) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`JSON 解析失败：${hint}`);
  }
}

function renderTasks(container, out, list) {
  if (!Array.isArray(list) || list.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;">（无任务）</div>';
    out.textContent = JSON.stringify(list, null, 2);
    return;
  }
  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="text-align:left;color:var(--muted);border-bottom:1px solid var(--border);">
        <th style="padding:6px 8px;">title</th>
        <th style="padding:6px 8px;">id</th>
        <th style="padding:6px 8px;">status</th>
        <th style="padding:6px 8px;">issueId</th>
      </tr></thead>
      <tbody>
        ${list.map((t) => `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:6px 8px;font-weight:500;">${escapeHtml(t.title || '')}</td>
            <td style="padding:6px 8px;font-family:monospace;font-size:12px;">${escapeHtml(t.id || '')}</td>
            <td style="padding:6px 8px;">${escapeHtml(t.status || '-')}</td>
            <td style="padding:6px 8px;font-size:12px;color:var(--muted);">${escapeHtml(t.issueId || '-')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  out.textContent = JSON.stringify(list, null, 2);
}

// 列表
$('#btn-list').addEventListener('click', (e) =>
  run(e.target, $('#out-list'), async () => {
    const issueId = $('#in-issue').value.trim();
    const list = await sdk().task.list(wsId(), issueId || undefined);
    renderTasks($('#task-table'), $('#out-list'), list);
    return list;
  }),
);

// 创建
$('#btn-create').addEventListener('click', (e) =>
  run(e.target, $('#out-create'), async () => {
    const title = $('#in-title').value.trim();
    const prompt = $('#in-prompt').value.trim();
    const issueId = $('#in-issue2').value.trim();
    if (!title && !prompt) throw new Error('请输入 title 或 prompt');
    const data = { title, prompt };
    if (issueId) data.issueId = issueId;
    return sdk().task.create(wsId(), data);
  }, { onDone: () => $('#btn-list').click() }),
);

// 单个操作
$('#btn-get').addEventListener('click', (e) =>
  run(e.target, $('#out-op'), () => sdk().task.get(wsId(), $('#in-id').value.trim())),
);
$('#btn-retry').addEventListener('click', (e) =>
  run(e.target, $('#out-op'), () => sdk().task.retry(wsId(), $('#in-id').value.trim())),
);
$('#btn-cancel').addEventListener('click', (e) =>
  run(e.target, $('#out-op'), () => sdk().task.cancel(wsId(), $('#in-id').value.trim())),
);
$('#btn-delete').addEventListener('click', (e) =>
  run(e.target, $('#out-op'), () => sdk().task.delete_(wsId(), $('#in-id').value.trim())),
);

// update / reorder
$('#btn-update').addEventListener('click', (e) =>
  run(e.target, $('#out-upd'), async () => {
    const id = $('#in-upd-id').value.trim();
    if (!id) throw new Error('请输入 taskId');
    const data = parseJSON($('#in-upd-data').value, 'update data');
    return sdk().task.update(wsId(), id, data);
  }),
);
$('#btn-reorder').addEventListener('click', (e) =>
  run(e.target, $('#out-upd'), async () => {
    const data = parseJSON($('#in-reorder').value, 'reorder data');
    return sdk().task.reorder(wsId(), data);
  }),
);
