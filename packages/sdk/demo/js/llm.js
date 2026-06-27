/**
 * LLM 演示 —— llm（模型/供应商 CRUD）+ knowledgeBase（列表/CRUD/文件/检索）
 */
import { sdk, $, run, loadWorkspaceOptions, escapeHtml } from './sdk-config.js';

function parseJSON(text, hint) {
  if (!text.trim()) throw new Error(`请填写 JSON：${hint}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`JSON 解析失败：${hint}`);
  }
}

function renderModels(container, out, list) {
  if (!Array.isArray(list) || list.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;">（无模型）</div>';
    out.textContent = JSON.stringify(list, null, 2);
    return;
  }
  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="text-align:left;color:var(--muted);border-bottom:1px solid var(--border);">
        <th style="padding:6px 8px;">name</th>
        <th style="padding:6px 8px;">id</th>
        <th style="padding:6px 8px;">provider</th>
      </tr></thead>
      <tbody>
        ${list.map((m) => `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:6px 8px;font-weight:500;">${escapeHtml(m.name || '')}</td>
            <td style="padding:6px 8px;font-family:monospace;font-size:12px;">${escapeHtml(m.id || '')}</td>
            <td style="padding:6px 8px;">${escapeHtml(m.providerId || m.provider || '-')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  out.textContent = JSON.stringify(list, null, 2);
}

// ---- LLM ----
$('#btn-models').addEventListener('click', (e) =>
  run(e.target, $('#out-llm'), async () => {
    const list = await sdk().llm.listModels();
    renderModels($('#model-table'), $('#out-llm'), list);
    return list;
  }),
);
$('#btn-providers').addEventListener('click', (e) =>
  run(e.target, $('#out-llm'), () => sdk().llm.listProviders()),
);

$('#btn-model-create').addEventListener('click', (e) =>
  run(e.target, $('#out-model-crud'), async () => {
    const data = parseJSON($('#in-model-data').value, 'model data');
    return sdk().llm.createModel(data);
  }, { onDone: () => $('#btn-models').click() }),
);
$('#btn-model-update').addEventListener('click', (e) =>
  run(e.target, $('#out-model-crud'), async () => {
    const id = $('#in-model-id').value.trim();
    if (!id) throw new Error('请输入 model id');
    const data = parseJSON($('#in-model-data').value, 'update data');
    return sdk().llm.updateModel(id, data);
  }),
);
$('#btn-model-delete').addEventListener('click', (e) =>
  run(e.target, $('#out-model-crud'), () => sdk().llm.deleteModel($('#in-model-id').value.trim())),
);

// ---- 知识库 ----
const wsSelect = $('#ws-select');
loadWorkspaceOptions(wsSelect);
wsSelect.addEventListener('change', () => $('#btn-kb-list').click());
function wsId() {
  const id = wsSelect.value;
  if (!id) throw new Error('请先选择工作区');
  return id;
}

function renderKb(container, out, list) {
  if (!Array.isArray(list) || list.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;">（无知识库）</div>';
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
        ${list.map((k) => `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:6px 8px;font-weight:500;">${escapeHtml(k.name || '')}</td>
            <td style="padding:6px 8px;font-family:monospace;font-size:12px;">${escapeHtml(k.id || '')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  out.textContent = JSON.stringify(list, null, 2);
}

$('#btn-kb-list').addEventListener('click', (e) =>
  run(e.target, $('#out-kb'), async () => {
    const list = await sdk().knowledgeBase.list(wsId());
    renderKb($('#kb-table'), $('#out-kb'), list);
    return list;
  }),
);
$('#btn-kb-create').addEventListener('click', (e) =>
  run(e.target, $('#out-kb-crud'), async () => {
    const name = $('#in-kb-name').value.trim();
    if (!name) throw new Error('请输入名称');
    return sdk().knowledgeBase.create(wsId(), { name });
  }, { onDone: () => $('#btn-kb-list').click() }),
);
$('#btn-kb-stats').addEventListener('click', (e) =>
  run(e.target, $('#out-kb-crud'), () => sdk().knowledgeBase.stats(wsId(), $('#in-kb-id').value.trim())),
);
$('#btn-kb-del').addEventListener('click', (e) =>
  run(e.target, $('#out-kb-crud'), () => sdk().knowledgeBase.delete_(wsId(), $('#in-kb-id').value.trim())),
);

// 文件 & 检索
const kb2 = () => $('#in-kb2-id').value.trim();
$('#btn-kb-files').addEventListener('click', (e) =>
  run(e.target, $('#out-kb-files'), () => sdk().knowledgeBase.listFiles(wsId(), kb2())),
);
$('#btn-kb-reindex').addEventListener('click', (e) =>
  run(e.target, $('#out-kb-files'), () => sdk().knowledgeBase.reindexFile(wsId(), kb2(), $('#in-kb-file').value.trim())),
);
$('#btn-kb-query').addEventListener('click', (e) =>
  run(e.target, $('#out-kb-files'), async () => {
    const body = parseJSON($('#in-kb-query').value, 'query body');
    return sdk().knowledgeBase.query(wsId(), kb2(), body);
  }),
);
