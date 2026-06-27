/**
 * Channel 演示 —— list / create / get / update / delete_ / getMessages / getState / clearMessages
 *                 / uploadAttachment / deleteMessage / getToolDetail
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

function renderChannels(container, out, list) {
  if (!Array.isArray(list) || list.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;">（无频道）</div>';
    out.textContent = JSON.stringify(list, null, 2);
    return;
  }
  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="text-align:left;color:var(--muted);border-bottom:1px solid var(--border);">
        <th style="padding:6px 8px;">name</th>
        <th style="padding:6px 8px;">id</th>
        <th style="padding:6px 8px;">type</th>
      </tr></thead>
      <tbody>
        ${list.map((c) => `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:6px 8px;font-weight:500;">${escapeHtml(c.name || c.title || '')}</td>
            <td style="padding:6px 8px;font-family:monospace;font-size:12px;">${escapeHtml(c.id || '')}</td>
            <td style="padding:6px 8px;">${escapeHtml(c.type || '-')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  out.textContent = JSON.stringify(list, null, 2);
}

// 列表
$('#btn-list').addEventListener('click', (e) =>
  run(e.target, $('#out-list'), async () => {
    const list = await sdk().channel.list(wsId());
    renderChannels($('#ch-table'), $('#out-list'), list);
    return list;
  }),
);

// 创建
$('#btn-create').addEventListener('click', (e) =>
  run(e.target, $('#out-create'), async () => {
    const name = $('#in-name').value.trim();
    if (!name) throw new Error('请输入 name');
    const data = { name };
    const type = $('#in-type').value.trim();
    if (type) data.type = type;
    return sdk().channel.create(wsId(), data);
  }, { onDone: () => $('#btn-list').click() }),
);

// 频道操作
const ch = () => $('#in-ch').value.trim();
$('#btn-get').addEventListener('click', (e) =>
  run(e.target, $('#out-op'), () => sdk().channel.get(wsId(), ch())),
);
$('#btn-state').addEventListener('click', (e) =>
  run(e.target, $('#out-op'), () => sdk().channel.getState(wsId(), ch())),
);
$('#btn-msgs').addEventListener('click', (e) =>
  run(e.target, $('#out-op'), () => sdk().channel.getMessages(wsId(), ch())),
);
$('#btn-clear').addEventListener('click', (e) =>
  run(e.target, $('#out-op'), () => sdk().channel.clearMessages(wsId(), ch())),
);
$('#btn-del').addEventListener('click', (e) =>
  run(e.target, $('#out-op'), () => sdk().channel.delete_(wsId(), ch())),
);

// 消息 & 工具
const msgId = () => $('#in-msg').value.trim();
$('#btn-delmsg').addEventListener('click', (e) =>
  run(e.target, $('#out-msg'), () => sdk().channel.deleteMessage(wsId(), ch(), msgId())),
);
$('#btn-tool').addEventListener('click', (e) =>
  run(e.target, $('#out-msg'), () =>
    sdk().channel.getToolDetail(wsId(), ch(), msgId(), $('#in-tool').value.trim()),
  ),
);
$('#btn-upload').addEventListener('click', (e) =>
  run(e.target, $('#out-msg'), async () => {
    const file = $('#in-file').files[0];
    if (!file) throw new Error('请选择文件');
    const fd = new FormData();
    fd.append('file', file);
    return sdk().channel.uploadAttachment(wsId(), fd);
  }),
);
