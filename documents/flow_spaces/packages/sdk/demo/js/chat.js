/**
 * Chat 演示 —— ChatAgent / 消息 / 工作区树 / ChatWorkspace / ChatSession / 会话状态
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

function renderList(container, out, list, nameKey = 'name') {
  if (!Array.isArray(list) || list.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;">（空）</div>';
    out.textContent = JSON.stringify(list, null, 2);
    return;
  }
  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="text-align:left;color:var(--muted);border-bottom:1px solid var(--border);">
        <th style="padding:6px 8px;">${nameKey}</th>
        <th style="padding:6px 8px;">id</th>
      </tr></thead>
      <tbody>
        ${list.map((it) => `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:6px 8px;font-weight:500;">${escapeHtml(it[nameKey] || it.title || '')}</td>
            <td style="padding:6px 8px;font-family:monospace;font-size:12px;">${escapeHtml(it.id || '')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  out.textContent = JSON.stringify(list, null, 2);
}

// ---- Chat Agents ----
$('#btn-agents').addEventListener('click', (e) =>
  run(e.target, $('#out-agent'), async () => {
    const list = await sdk().chat.listAgents();
    renderList($('#agent-table'), $('#out-agent'), list, 'name');
    return list;
  }),
);
const agentId = () => $('#in-agent-id').value.trim();
$('#btn-messages').addEventListener('click', (e) =>
  run(e.target, $('#out-agent'), () => {
    const limit = Number($('#in-limit').value) || undefined;
    return sdk().chat.listMessages(agentId(), limit);
  }),
);
$('#btn-clear-msg').addEventListener('click', (e) =>
  run(e.target, $('#out-agent'), () => sdk().chat.clearMessages(agentId())),
);

// ---- ChatAgent CRUD ----
$('#btn-agent-create').addEventListener('click', (e) =>
  run(e.target, $('#out-agent-crud'), () => sdk().chat.createAgent(parseJSON($('#in-agent-data').value, 'create data'))),
);
$('#btn-agent-update').addEventListener('click', (e) =>
  run(e.target, $('#out-agent-crud'), () => {
    const id = $('#in-agent2-id').value.trim();
    const data = parseJSON($('#in-agent-data').value, 'update data');
    if (!id) throw new Error('请输入 agent id');
    return sdk().chat.updateAgent(id, data);
  }),
);
$('#btn-agent-delete').addEventListener('click', (e) =>
  run(e.target, $('#out-agent-crud'), () => sdk().chat.deleteAgent($('#in-agent2-id').value.trim())),
);

// ---- 工作区树 ----
const treeAgent = () => $('#in-tree-agent').value.trim();
$('#btn-tree').addEventListener('click', (e) =>
  run(e.target, $('#out-tree'), () => sdk().chat.workspaceTree(treeAgent())),
);
$('#btn-file-content').addEventListener('click', (e) =>
  run(e.target, $('#out-tree'), () => sdk().chat.workspaceFileContent(treeAgent(), $('#in-tree-path').value.trim())),
);

// ---- Chat Workspaces ----
$('#btn-ws-list').addEventListener('click', (e) =>
  run(e.target, $('#out-ws'), async () => {
    const list = await sdk().chat.listWorkspaces();
    renderList($('#ws-table'), $('#out-ws'), list, 'name');
    return list;
  }),
);
$('#btn-ws-create').addEventListener('click', (e) =>
  run(e.target, $('#out-ws-crud'), () => sdk().chat.createWorkspace(parseJSON($('#in-ws-data').value, 'create data'))),
);
const wsId = () => $('#in-ws-id').value.trim();
$('#btn-ws-update').addEventListener('click', (e) =>
  run(e.target, $('#out-ws-crud'), () => {
    const data = parseJSON($('#in-ws-data').value, 'update data');
    return sdk().chat.updateWorkspace(wsId(), data);
  }),
);
$('#btn-ws-delete').addEventListener('click', (e) =>
  run(e.target, $('#out-ws-crud'), () => sdk().chat.deleteWorkspace(wsId())),
);
$('#btn-ws-state-get').addEventListener('click', (e) =>
  run(e.target, $('#out-ws-crud'), () => sdk().chat.getWorkspaceState(wsId())),
);

// ---- Chat Sessions ----
$('#btn-sess-list').addEventListener('click', (e) =>
  run(e.target, $('#out-sess'), async () => {
    const list = await sdk().chat.listSessions($('#in-sess-ws').value.trim());
    renderList($('#sess-table'), $('#out-sess'), list, 'title');
    return list;
  }),
);
const opWs = () => $('#in-op-ws').value.trim();
const opSess = () => $('#in-op-sess').value.trim();
$('#btn-sess-create').addEventListener('click', (e) =>
  run(e.target, $('#out-sess-op'), () => sdk().chat.createSession(opWs(), $('#in-op-agent').value.trim())),
);
$('#btn-sess-rename').addEventListener('click', (e) =>
  run(e.target, $('#out-sess-op'), () => sdk().chat.renameSession(opWs(), opSess(), $('#in-op-title').value.trim())),
);
$('#btn-sess-delete').addEventListener('click', (e) =>
  run(e.target, $('#out-sess-op'), () => sdk().chat.deleteSession(opWs(), opSess())),
);
$('#btn-sess-msgs').addEventListener('click', (e) =>
  run(e.target, $('#out-sess-op'), () => sdk().chat.listSessionMessages(opWs(), opSess())),
);
$('#btn-sess-clear').addEventListener('click', (e) =>
  run(e.target, $('#out-sess-op'), () => sdk().chat.clearSessionMessages(opWs(), opSess())),
);
