/**
 * Mini Apps 演示 —— 项目 CRUD / 文件树读写 / 配置 / 头像背景 / zip / Agent 配置 & 对话
 */
import { sdk, $, run, escapeHtml } from './sdk-config.js';

function parseJSON(text, hint) {
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`JSON 解析失败：${hint}`);
  }
}

/** 把 File 读成 data URL */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderApps(container, out, list) {
  if (!Array.isArray(list) || list.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;">（无应用）</div>';
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
        ${list.map((a) => `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:6px 8px;font-weight:500;">${escapeHtml(a.name || '')}</td>
            <td style="padding:6px 8px;font-family:monospace;font-size:12px;">${escapeHtml(a.id || '')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  out.textContent = JSON.stringify(list, null, 2);
}

// ---- 列表 ----
$('#btn-list').addEventListener('click', (e) =>
  run(e.target, $('#out-list'), async () => {
    const list = await sdk().miniApp.list();
    renderApps($('#app-table'), $('#out-list'), list);
    return list;
  }),
);

// ---- 项目 CRUD ----
$('#btn-create').addEventListener('click', (e) =>
  run(e.target, $('#out-crud'), async () => {
    const name = $('#in-name').value.trim();
    if (!name) throw new Error('请输入名称');
    return sdk().miniApp.create({ name });
  }, { onDone: () => $('#btn-list').click() }),
);
const crudApp = () => $('#in-app-id').value.trim();
$('#btn-get').addEventListener('click', (e) =>
  run(e.target, $('#out-crud'), () => sdk().miniApp.get(crudApp())),
);
$('#btn-update').addEventListener('click', (e) =>
  run(e.target, $('#out-crud'), async () => {
    const data = parseJSON($('#in-update-data').value, 'update data') || {};
    return sdk().miniApp.update(crudApp(), data);
  }),
);
$('#btn-delete').addEventListener('click', (e) =>
  run(e.target, $('#out-crud'), () => sdk().miniApp.delete_(crudApp())),
);

// ---- 文件树 ----
const treeApp = () => $('#in-tree-app').value.trim();
$('#btn-tree').addEventListener('click', (e) =>
  run(e.target, $('#out-tree'), () => sdk().miniApp.getFileTree(treeApp())),
);
$('#btn-manifest').addEventListener('click', (e) =>
  run(e.target, $('#out-tree'), () => sdk().miniApp.getFileManifest(treeApp())),
);
$('#btn-read-config').addEventListener('click', (e) =>
  run(e.target, $('#out-tree'), () => sdk().miniApp.readConfig(treeApp(), $('#in-tree-path').value.trim())),
);

// ---- 文件读写 ----
const rwApp = () => $('#in-rw-app').value.trim();
const rwPath = () => $('#in-rw-path').value.trim();
$('#btn-read').addEventListener('click', (e) =>
  run(e.target, $('#out-rw'), () => sdk().miniApp.readFile(rwApp(), rwPath())),
);
$('#btn-write').addEventListener('click', (e) =>
  run(e.target, $('#out-rw'), async () => {
    await sdk().miniApp.writeFile(rwApp(), rwPath(), $('#in-rw-content').value);
    return { message: '已写入', path: rwPath() };
  }),
);
$('#btn-del-file').addEventListener('click', (e) =>
  run(e.target, $('#out-rw'), () => sdk().miniApp.deleteFile(rwApp(), rwPath())),
);
$('#btn-rename-file').addEventListener('click', (e) =>
  run(e.target, $('#out-rw'), () => sdk().miniApp.renameFile(rwApp(), rwPath(), $('#in-rw-to').value.trim())),
);
$('#btn-mkdir').addEventListener('click', (e) =>
  run(e.target, $('#out-rw'), () => sdk().miniApp.createFolder(rwApp(), $('#in-rw-to').value.trim())),
);

// ---- 数据文件 & 上传 ----
const dataApp = () => $('#in-data-app').value.trim();
const dataPath = () => $('#in-data-path').value.trim();
$('#btn-write-data').addEventListener('click', (e) =>
  run(e.target, $('#out-data'), () => sdk().miniApp.writeDataFile(dataApp(), dataPath(), $('#in-data-content').value)),
);
$('#btn-write-config').addEventListener('click', (e) =>
  run(e.target, $('#out-data'), () => sdk().miniApp.writeConfig(dataApp(), dataPath(), $('#in-data-content').value)),
);
$('#btn-upload').addEventListener('click', (e) =>
  run(e.target, $('#out-data'), async () => {
    const files = Array.from($('#in-upload').files);
    if (files.length === 0) throw new Error('请选择文件');
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    return sdk().miniApp.uploadFiles(dataApp(), fd);
  }),
);

// ---- 头像 / 背景 / zip ----
const mediaApp = () => $('#in-media-app').value.trim();
$('#btn-upload-avatar').addEventListener('click', (e) =>
  run(e.target, $('#out-media'), async () => {
    const file = $('#in-avatar-file').files[0];
    if (!file) throw new Error('请选择图片');
    const dataUrl = await fileToDataUrl(file);
    return sdk().miniApp.uploadAvatar(mediaApp(), dataUrl);
  }),
);
$('#btn-avatar-url').addEventListener('click', (e) =>
  run(e.target, $('#out-media'), () => sdk().miniApp.getAvatarUrl(mediaApp())),
);
$('#btn-upload-bg').addEventListener('click', (e) =>
  run(e.target, $('#out-media'), async () => {
    const file = $('#in-bg-file').files[0];
    if (!file) throw new Error('请选择图片');
    const dataUrl = await fileToDataUrl(file);
    return sdk().miniApp.uploadBackground(mediaApp(), dataUrl);
  }),
);
$('#btn-export').addEventListener('click', (e) =>
  run(e.target, $('#out-media'), () => sdk().miniApp.exportZip(mediaApp())),
);
$('#btn-import').addEventListener('click', (e) =>
  run(e.target, $('#out-media'), async () => {
    const file = $('#in-zip').files[0];
    if (!file) throw new Error('请选择 zip');
    const fd = new FormData();
    fd.append('file', file);
    return sdk().miniApp.importZip(fd);
  }),
);
$('#btn-reveal').addEventListener('click', (e) =>
  run(e.target, $('#out-media'), () => sdk().miniApp.revealFolder(mediaApp())),
);

// ---- Agent 配置 ----
const agApp = () => $('#in-ag-app').value.trim();
const agId = () => $('#in-ag-id').value.trim();
$('#btn-ag-list').addEventListener('click', (e) =>
  run(e.target, $('#out-ag'), () => sdk().miniApp.listAgents(agApp())),
);
$('#btn-ag-get').addEventListener('click', (e) =>
  run(e.target, $('#out-ag'), () => sdk().miniApp.getAgent(agApp(), agId())),
);
$('#btn-ag-update').addEventListener('click', (e) =>
  run(e.target, $('#out-ag'), async () => {
    const data = parseJSON($('#in-ag-data').value, 'update data') || {};
    return sdk().miniApp.updateAgent(agApp(), agId(), data);
  }),
);

// ---- Agent 对话 ----
const chatApp = () => $('#in-chat-app').value.trim();
const chatSession = () => $('#in-chat-session').value.trim();
const chatAgent = () => $('#in-chat-agent').value.trim();
$('#btn-chat-history').addEventListener('click', (e) =>
  run(e.target, $('#out-chat'), () => sdk().miniApp.agentHistory(chatApp(), chatSession(), chatAgent() || undefined)),
);
$('#btn-chat-clear').addEventListener('click', (e) =>
  run(e.target, $('#out-chat'), () => sdk().miniApp.clearAgentHistory(chatApp(), chatSession(), chatAgent() || undefined)),
);
$('#btn-chat-send').addEventListener('click', (e) =>
  run(e.target, $('#out-chat'), async () => {
    const body = parseJSON($('#in-chat-body').value, 'chat body');
    if (!body) throw new Error('请输入 chat body');
    return sdk().miniApp.agentChat(chatApp(), chatAgent(), body);
  }),
);
