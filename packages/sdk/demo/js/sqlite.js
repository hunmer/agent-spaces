/**
 * SQLite 演示 —— 数据库 CRUD / 表结构 / SQL query & exec
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

function renderDb(container, out, list) {
  if (!Array.isArray(list) || list.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;">（无数据库）</div>';
    out.textContent = JSON.stringify(list, null, 2);
    return;
  }
  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="text-align:left;color:var(--muted);border-bottom:1px solid var(--border);">
        <th style="padding:6px 8px;">name</th>
        <th style="padding:6px 8px;">id</th>
        <th style="padding:6px 8px;">workflowId</th>
      </tr></thead>
      <tbody>
        ${list.map((d) => `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:6px 8px;font-weight:500;">${escapeHtml(d.name || '')}</td>
            <td style="padding:6px 8px;font-family:monospace;font-size:12px;">${escapeHtml(d.id || '')}</td>
            <td style="padding:6px 8px;font-size:12px;color:var(--muted);">${escapeHtml(d.workflowId || '-')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  out.textContent = JSON.stringify(list, null, 2);
}

// ---- 列表 ----
$('#btn-db-list').addEventListener('click', (e) =>
  run(e.target, $('#out-db'), async () => {
    const wf = $('#in-wf-filter').value.trim();
    const list = await sdk().sqlite.listDatabases(wf || undefined);
    renderDb($('#db-table'), $('#out-db'), list);
    return list;
  }),
);

// ---- CRUD ----
$('#btn-db-create').addEventListener('click', (e) =>
  run(e.target, $('#out-crud'), () => sdk().sqlite.createDatabase(parseJSON($('#in-db-data').value, 'create input'))),
);
$('#btn-db-update').addEventListener('click', (e) =>
  run(e.target, $('#out-crud'), () => {
    const id = $('#in-db-id').value.trim();
    const updates = parseJSON($('#in-db-data').value, 'updates');
    if (!id) throw new Error('请输入 db id');
    return sdk().sqlite.updateDatabase(id, updates);
  }),
);
$('#btn-db-delete').addEventListener('click', (e) =>
  run(e.target, $('#out-crud'), () => sdk().sqlite.deleteDatabase($('#in-db-id').value.trim())),
);

// ---- 表 ----
const tblDb = () => $('#in-tbl-db').value.trim();
$('#btn-tables').addEventListener('click', (e) =>
  run(e.target, $('#out-tbl'), () => sdk().sqlite.listTables(tblDb())),
);
$('#btn-describe').addEventListener('click', (e) =>
  run(e.target, $('#out-tbl'), () => sdk().sqlite.describeTable(tblDb(), $('#in-tbl-name').value.trim())),
);

// ---- SQL ----
const sqlDb = () => $('#in-sql-db').value.trim();
const sqlText = () => $('#in-sql').value.trim();
const sqlParams = () => parseJSON($('#in-sql-params').value, 'params');

$('#btn-query').addEventListener('click', (e) =>
  run(e.target, $('#out-sql'), () => {
    if (!sqlText()) throw new Error('请输入 SQL');
    const p = sqlParams();
    return p ? sdk().sqlite.query(sqlDb(), sqlText(), p) : sdk().sqlite.query(sqlDb(), sqlText());
  }),
);
$('#btn-exec').addEventListener('click', (e) =>
  run(e.target, $('#out-sql'), () => {
    if (!sqlText()) throw new Error('请输入 SQL');
    const p = sqlParams();
    return p ? sdk().sqlite.exec(sqlDb(), sqlText(), p) : sdk().sqlite.exec(sqlDb(), sqlText());
  }),
);
