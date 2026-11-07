/**
 * Agent 配置演示 —— prompts / outputStyles / skills / mcps / tools（全局）
 *                     + agentCommands / hooks / command（依赖 workspaceId）
 */
import { sdk, $, run, loadWorkspaceOptions, escapeHtml } from './sdk-config.js';

const wsSelect = $('#ws-select');
loadWorkspaceOptions(wsSelect);
function wsId() {
  const id = wsSelect.value;
  if (!id) throw new Error('请先选择工作区');
  return id;
}

function renderSimpleTable(container, out, list, nameKey = 'name', idKey = 'id') {
  if (!Array.isArray(list) || list.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;">（空）</div>';
    out.textContent = JSON.stringify(list, null, 2);
    return;
  }
  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="text-align:left;color:var(--muted);border-bottom:1px solid var(--border);">
        <th style="padding:6px 8px;">${nameKey}</th>
        <th style="padding:6px 8px;">${idKey}</th>
      </tr></thead>
      <tbody>
        ${list.map((it) => `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:6px 8px;font-weight:500;">${escapeHtml(it[nameKey] || it.title || '')}</td>
            <td style="padding:6px 8px;font-family:monospace;font-size:12px;">${escapeHtml(it[idKey] || '')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  out.textContent = JSON.stringify(list, null, 2);
}

// ---- prompts ----
$('#btn-prompt-list').addEventListener('click', (e) =>
  run(e.target, $('#out-prompt'), () => sdk().prompts.list()),
);
$('#btn-prompt-agents').addEventListener('click', (e) =>
  run(e.target, $('#out-prompt'), () => sdk().prompts.listAgents()),
);
$('#btn-prompt-apply').addEventListener('click', (e) =>
  run(e.target, $('#out-prompt'), () => {
    const id = $('#in-prompt-id').value.trim();
    const agentIds = $('#in-prompt-agents').value.split(',').map((s) => s.trim()).filter(Boolean);
    if (!id) throw new Error('请输入 promptId');
    return sdk().prompts.apply(id, agentIds);
  }),
);

// ---- outputStyles ----
$('#btn-style-list').addEventListener('click', (e) =>
  run(e.target, $('#out-style'), () => sdk().outputStyles.list()),
);
$('#btn-style-agents').addEventListener('click', (e) =>
  run(e.target, $('#out-style'), () => sdk().outputStyles.listAgents()),
);
$('#btn-style-apply').addEventListener('click', (e) =>
  run(e.target, $('#out-style'), () => {
    const id = $('#in-style-id').value.trim();
    const agentIds = $('#in-style-agents').value.split(',').map((s) => s.trim()).filter(Boolean);
    if (!id) throw new Error('请输入 styleId');
    return sdk().outputStyles.apply(id, agentIds);
  }),
);

// ---- skills ----
$('#btn-skill-list').addEventListener('click', (e) =>
  run(e.target, $('#out-skill'), async () => {
    const list = await sdk().skills.list();
    renderSimpleTable($('#skill-table'), $('#out-skill'), list, 'name', 'name');
    return list;
  }),
);
const skillName = () => $('#in-skill-name').value.trim();
$('#btn-skill-fav').addEventListener('click', (e) =>
  run(e.target, $('#out-skill'), () => sdk().skills.toggleFavorite(skillName())),
);
$('#btn-skill-reveal').addEventListener('click', (e) =>
  run(e.target, $('#out-skill'), () => sdk().skills.reveal(skillName())),
);
$('#btn-skill-del').addEventListener('click', (e) =>
  run(e.target, $('#out-skill'), () => sdk().skills.delete_(skillName())),
);
$('#btn-skill-sync-check').addEventListener('click', (e) =>
  run(e.target, $('#out-skill'), () => sdk().skills.syncCheck()),
);

// ---- mcps ----
$('#btn-mcp-list').addEventListener('click', (e) =>
  run(e.target, $('#out-mcp'), async () => {
    const list = await sdk().mcps.list();
    renderSimpleTable($('#mcp-table'), $('#out-mcp'), list, 'name', 'name');
    return list;
  }),
);
const mcpName = () => $('#in-mcp-name').value.trim();
$('#btn-mcp-fav').addEventListener('click', (e) =>
  run(e.target, $('#out-mcp'), () => sdk().mcps.toggleFavorite(mcpName())),
);
$('#btn-mcp-del').addEventListener('click', (e) =>
  run(e.target, $('#out-mcp'), () => sdk().mcps.delete_(mcpName())),
);

// ---- tools ----
$('#btn-tool-list').addEventListener('click', (e) =>
  run(e.target, $('#out-tool'), () => sdk().tools.list()),
);
$('#btn-tool-update').addEventListener('click', (e) =>
  run(e.target, $('#out-tool'), () => {
    const name = $('#in-tool-name').value.trim();
    const enabled = $('#in-tool-enabled').value.trim().toLowerCase() === 'true';
    if (!name) throw new Error('请输入 tool name');
    return sdk().tools.update(name, enabled);
  }),
);

// ---- agentCommands ----
$('#btn-cmd-agents').addEventListener('click', (e) =>
  run(e.target, $('#out-cmd'), () => sdk().agentCommands.listAgents()),
);
$('#btn-cmd-all').addEventListener('click', (e) =>
  run(e.target, $('#out-cmd'), () => sdk().agentCommands.listAll()),
);
$('#btn-cmd-for').addEventListener('click', (e) =>
  run(e.target, $('#out-cmd'), () => sdk().agentCommands.listForAgent($('#in-cmd-agent').value.trim())),
);

// ---- hooks ----
$('#btn-hook-list').addEventListener('click', (e) =>
  run(e.target, $('#out-hook'), () => sdk().hooks.list(wsId())),
);
$('#btn-hook-del').addEventListener('click', (e) =>
  run(e.target, $('#out-hook'), () => sdk().hooks.delete_(wsId(), $('#in-hook-name').value.trim())),
);

// ---- command ----
$('#btn-command-list').addEventListener('click', (e) =>
  run(e.target, $('#out-command'), async () => {
    const list = await sdk().command.list(wsId());
    renderSimpleTable($('#command-table'), $('#out-command'), list, 'name', 'id');
    return list;
  }),
);
const cmdId = () => $('#in-command-id').value.trim();
$('#btn-command-start').addEventListener('click', (e) =>
  run(e.target, $('#out-command'), () => sdk().command.start(wsId(), cmdId())),
);
$('#btn-command-stop').addEventListener('click', (e) =>
  run(e.target, $('#out-command'), () => sdk().command.stop(wsId(), cmdId())),
);
