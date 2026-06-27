/**
 * Workflow 演示 —— workflow（list/CRUD/execute/版本/日志/暂存）+ workflowPlugin（列表/配置/方案）
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

function renderWf(container, out, list) {
  if (!Array.isArray(list) || list.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;">（无工作流）</div>';
    out.textContent = JSON.stringify(list, null, 2);
    return;
  }
  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="text-align:left;color:var(--muted);border-bottom:1px solid var(--border);">
        <th style="padding:6px 8px;">name</th>
        <th style="padding:6px 8px;">id</th>
        <th style="padding:6px 8px;">folder</th>
      </tr></thead>
      <tbody>
        ${list.map((w) => `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:6px 8px;font-weight:500;">${escapeHtml(w.name || '')}</td>
            <td style="padding:6px 8px;font-family:monospace;font-size:12px;">${escapeHtml(w.id || '')}</td>
            <td style="padding:6px 8px;font-size:12px;color:var(--muted);">${escapeHtml(w.folderId || '-')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  out.textContent = JSON.stringify(list, null, 2);
}

// ---- Workflow 列表 ----
$('#btn-wf-list').addEventListener('click', (e) =>
  run(e.target, $('#out-wf-list'), async () => {
    const list = await sdk().workflow.list();
    renderWf($('#wf-table'), $('#out-wf-list'), list);
    return list;
  }),
);
$('#btn-wf-folders').addEventListener('click', (e) =>
  run(e.target, $('#out-wf-list'), () => sdk().workflow.listFolders()),
);

// ---- Workflow CRUD ----
$('#btn-wf-create').addEventListener('click', (e) =>
  run(e.target, $('#out-wf-crud'), async () => {
    const name = $('#in-wf-name').value.trim();
    if (!name) throw new Error('请输入 name');
    return sdk().workflow.create({ name });
  }, { onDone: () => $('#btn-wf-list').click() }),
);
const wfId = (sel) => $(sel).value.trim();
$('#btn-wf-get').addEventListener('click', (e) =>
  run(e.target, $('#out-wf-crud'), () => sdk().workflow.get(wfId('#in-wf-id'))),
);
$('#btn-wf-dup').addEventListener('click', (e) =>
  run(e.target, $('#out-wf-crud'), () => sdk().workflow.duplicate(wfId('#in-wf-id'))),
);
$('#btn-wf-del').addEventListener('click', (e) =>
  run(e.target, $('#out-wf-crud'), () => sdk().workflow.delete_(wfId('#in-wf-id'))),
);

// ---- 执行 & 日志 ----
$('#btn-wf-execute').addEventListener('click', (e) =>
  run(e.target, $('#out-wf-ex'), async () => {
    const body = parseJSON($('#in-ex-body').value, 'execute body');
    return sdk().workflow.execute($('#in-ex-id').value.trim(), body);
  }),
);
$('#btn-wf-logs').addEventListener('click', (e) =>
  run(e.target, $('#out-wf-ex'), () => sdk().workflow.listExecutionLogs($('#in-ex-id').value.trim())),
);
$('#btn-wf-alllogs').addEventListener('click', (e) =>
  run(e.target, $('#out-wf-ex'), () => sdk().workflow.listAllExecutionLogs(50)),
);

// ---- 暂存 / 会话 / 历史 ----
$('#btn-load-staging').addEventListener('click', (e) =>
  run(e.target, $('#out-wf-load'), () => sdk().workflow.loadStaging($('#in-load-id').value.trim())),
);
$('#btn-load-chat').addEventListener('click', (e) =>
  run(e.target, $('#out-wf-load'), () => sdk().workflow.loadChat($('#in-load-id').value.trim())),
);
$('#btn-load-history').addEventListener('click', (e) =>
  run(e.target, $('#out-wf-load'), () => sdk().workflow.loadOperationHistory($('#in-load-id').value.trim())),
);

// ---- 版本 ----
$('#btn-ver-list').addEventListener('click', (e) =>
  run(e.target, $('#out-wf-ver'), () => sdk().workflow.listVersions($('#in-ver-id').value.trim())),
);
$('#btn-ver-clear').addEventListener('click', (e) =>
  run(e.target, $('#out-wf-ver'), () => sdk().workflow.clearVersions($('#in-ver-id').value.trim())),
);

// ---- 插件 ----
$('#btn-pl-list').addEventListener('click', (e) =>
  run(e.target, $('#out-pl'), () => sdk().workflowPlugin.listAll()),
);
const plId = () => $('#in-pl-id').value.trim();
$('#btn-pl-enable').addEventListener('click', (e) =>
  run(e.target, $('#out-pl'), () => sdk().workflowPlugin.enable(plId())),
);
$('#btn-pl-disable').addEventListener('click', (e) =>
  run(e.target, $('#out-pl'), () => sdk().workflowPlugin.disable(plId())),
);
$('#btn-pl-uninstall').addEventListener('click', (e) =>
  run(e.target, $('#out-pl'), () => sdk().workflowPlugin.uninstall(plId())),
);

// ---- 插件配置 / 方案 ----
const plCfgId = () => $('#in-pl-cfg-id').value.trim();
const plWfId = () => $('#in-pl-wf-id').value.trim();
$('#btn-pl-config').addEventListener('click', (e) =>
  run(e.target, $('#out-pl-cfg'), () => sdk().workflowPlugin.getConfig(plCfgId())),
);
$('#btn-pl-nodes').addEventListener('click', (e) =>
  run(e.target, $('#out-pl-cfg'), () => sdk().workflowPlugin.getWorkflowNodes(plCfgId())),
);
$('#btn-pl-schemes').addEventListener('click', (e) =>
  run(e.target, $('#out-pl-cfg'), () => sdk().workflowPlugin.listSchemes(plWfId(), plCfgId())),
);
