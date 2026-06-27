/**
 * 系统设置演示 —— npmSettings / font / avatar / robotAccounts / subscription / speech / notification / inspector
 */
import { sdk, $, run, escapeHtml } from './sdk-config.js';

function parseJSON(text, hint) {
  if (!text.trim()) throw new Error(`请填写 JSON：${hint}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`JSON 解析失败：${hint}`);
  }
}

function renderTable(container, out, list) {
  if (!Array.isArray(list) || list.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;">（空）</div>';
    out.textContent = JSON.stringify(list, null, 2);
    return;
  }
  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="text-align:left;color:var(--muted);border-bottom:1px solid var(--border);">
        <th style="padding:6px 8px;">name</th>
        <th style="padding:6px 8px;">id</th>
      </tr></thead>
      <tbody>
        ${list.map((it) => `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:6px 8px;font-weight:500;">${escapeHtml(it.name || it.title || '')}</td>
            <td style="padding:6px 8px;font-family:monospace;font-size:12px;">${escapeHtml(it.id || '')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  out.textContent = JSON.stringify(list, null, 2);
}

// ---- npmSettings ----
$('#btn-npm-get').addEventListener('click', (e) =>
  run(e.target, $('#out-npm'), () => sdk().npmSettings.get()),
);
$('#btn-npm-update').addEventListener('click', (e) =>
  run(e.target, $('#out-npm'), () => sdk().npmSettings.update(parseJSON($('#in-npm').value, 'settings'))),
);

// ---- font ----
$('#btn-font-list').addEventListener('click', (e) =>
  run(e.target, $('#out-font'), () => sdk().font.list()),
);
$('#btn-font-upload').addEventListener('click', (e) =>
  run(e.target, $('#out-font'), () => {
    const name = $('#in-font-name').value.trim();
    const content = $('#in-font-content').value;
    if (!name) throw new Error('请输入 font name');
    return sdk().font.uploadByName(name, content);
  }),
);
$('#btn-font-del').addEventListener('click', (e) =>
  run(e.target, $('#out-font'), () => sdk().font.delete_($('#in-font-id').value.trim())),
);

// ---- avatar ----
$('#btn-avatar-get').addEventListener('click', (e) =>
  run(e.target, $('#out-avatar'), () => sdk().avatar.get($('#in-avatar-user').value.trim())),
);
$('#btn-avatar-upload').addEventListener('click', (e) =>
  run(e.target, $('#out-avatar'), async () => {
    const file = $('#in-avatar-file').files[0];
    if (!file) throw new Error('请选择图片');
    const fd = new FormData();
    fd.append('file', file);
    return sdk().avatar.upload(fd);
  }),
);

// ---- robotAccounts ----
$('#btn-robot-list').addEventListener('click', (e) =>
  run(e.target, $('#out-robot'), async () => {
    const list = await sdk().robotAccounts.list();
    renderTable($('#robot-table'), $('#out-robot'), list);
    return list;
  }),
);
$('#btn-robot-create').addEventListener('click', (e) =>
  run(e.target, $('#out-robot'), () => sdk().robotAccounts.create(parseJSON($('#in-robot-data').value, 'create data'))),
);
$('#btn-robot-qr').addEventListener('click', (e) =>
  run(e.target, $('#out-robot'), () => sdk().robotAccounts.wechatQR()),
);
$('#btn-robot-del').addEventListener('click', (e) =>
  run(e.target, $('#out-robot'), () => sdk().robotAccounts.delete_($('#in-robot-id').value.trim())),
);

// ---- subscription ----
$('#btn-sub-list').addEventListener('click', (e) =>
  run(e.target, $('#out-sub'), () => sdk().subscription.list()),
);
$('#btn-sub-quota').addEventListener('click', (e) =>
  run(e.target, $('#out-sub'), () => sdk().subscription.quota($('#in-sub-id').value.trim())),
);

// ---- speech ----
$('#btn-speech-list').addEventListener('click', (e) =>
  run(e.target, $('#out-speech'), () => sdk().speech.list()),
);
$('#btn-speech-del').addEventListener('click', (e) =>
  run(e.target, $('#out-speech'), () => sdk().speech.delete_($('#in-speech-id').value.trim())),
);

// ---- notification ----
$('#btn-notif-list').addEventListener('click', (e) =>
  run(e.target, $('#out-notif'), () => sdk().notification.list()),
);
$('#btn-notif-read').addEventListener('click', (e) =>
  run(e.target, $('#out-notif'), () => sdk().notification.markRead($('#in-notif-id').value.trim())),
);
$('#btn-notif-clear').addEventListener('click', (e) =>
  run(e.target, $('#out-notif'), () => sdk().notification.clearAll()),
);

// ---- inspector ----
$('#btn-inspector').addEventListener('click', (e) =>
  run(e.target, $('#out-inspector'), async () => {
    const data = parseJSON($('#in-inspector').value, 'track data');
    await sdk().inspector.track(data);
    return { message: '已上报', data };
  }),
);
