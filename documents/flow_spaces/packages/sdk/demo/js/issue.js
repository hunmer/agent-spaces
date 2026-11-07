/**
 * Issue 演示 —— list / create / start / resume / interrupt
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

function renderIssues(container, out, list) {
  if (!Array.isArray(list) || list.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;">（该工作区暂无 Issue）</div>';
    out.textContent = JSON.stringify(list, null, 2);
    return;
  }
  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="text-align:left;color:var(--muted);border-bottom:1px solid var(--border);">
        <th style="padding:6px 8px;">title</th>
        <th style="padding:6px 8px;">id</th>
        <th style="padding:6px 8px;">status</th>
        <th style="padding:6px 8px;">createdAt</th>
      </tr></thead>
      <tbody>
        ${list.map((it) => `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:6px 8px;font-weight:500;">${escapeHtml(it.title || '')}</td>
            <td style="padding:6px 8px;font-family:monospace;font-size:12px;">${escapeHtml(it.id || '')}</td>
            <td style="padding:6px 8px;">${escapeHtml(it.status || '-')}</td>
            <td style="padding:6px 8px;font-size:12px;color:var(--muted);">${escapeHtml(it.createdAt || '')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  out.textContent = JSON.stringify(list, null, 2);
}

// 列表
$('#btn-list').addEventListener('click', (e) =>
  run(e.target, $('#out-list'), async () => {
    const list = await sdk().issue.list(wsId());
    renderIssues($('#issue-table'), $('#out-list'), list);
    return list;
  }),
);

// 创建
$('#btn-create').addEventListener('click', (e) =>
  run(e.target, $('#out-create'), async () => {
    const title = $('#in-title').value.trim();
    const description = $('#in-desc').value.trim();
    if (!title) throw new Error('请输入 title');
    if (!description) throw new Error('请输入 description');
    return sdk().issue.create(wsId(), { title, description });
  }, { onDone: () => $('#btn-list').click() }),
);

// start / resume / interrupt
$('#btn-start').addEventListener('click', (e) =>
  run(e.target, $('#out-run'), () => sdk().issue.start(wsId(), $('#in-id').value.trim())),
);
$('#btn-resume').addEventListener('click', (e) =>
  run(e.target, $('#out-run'), () => sdk().issue.resume(wsId(), $('#in-id').value.trim())),
);
$('#btn-interrupt').addEventListener('click', (e) =>
  run(e.target, $('#out-run'), () => sdk().issue.interrupt(wsId(), $('#in-id').value.trim())),
);
