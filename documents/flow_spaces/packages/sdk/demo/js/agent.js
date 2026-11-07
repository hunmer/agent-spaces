/**
 * Agent 演示 —— listPresets / usageDashboard / design
 */
import { sdk, $, run, escapeHtml } from './sdk-config.js';

function renderAgents(container, out, list) {
  if (!Array.isArray(list) || list.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;">（无预设）</div>';
    return;
  }
  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="text-align:left;color:var(--muted);border-bottom:1px solid var(--border);">
        <th style="padding:6px 8px;">name</th>
        <th style="padding:6px 8px;">id</th>
        <th style="padding:6px 8px;">runtime</th>
        <th style="padding:6px 8px;">model</th>
        <th style="padding:6px 8px;">enabled</th>
      </tr></thead>
      <tbody>
        ${list.map((a) => `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:6px 8px;font-weight:500;">${escapeHtml(a.name || '')}</td>
            <td style="padding:6px 8px;font-family:monospace;font-size:12px;">${escapeHtml(a.id || '')}</td>
            <td style="padding:6px 8px;">${escapeHtml(a.runtime || '-')}</td>
            <td style="padding:6px 8px;font-size:12px;">${escapeHtml(a.model || '-')}</td>
            <td style="padding:6px 8px;">${a.enabled === false ? '✗' : '✓'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  out.textContent = JSON.stringify(list, null, 2);
}

// 列表（自动加载）
$('#btn-list').addEventListener('click', (e) =>
  run(e.target, $('#out-list'), async () => {
    const list = await sdk().agent.listPresets();
    renderAgents($('#agent-table'), $('#out-list'), list);
    return list;
  }),
);
window.addEventListener('load', () => $('#btn-list').click());

// 用量
$('#btn-usage').addEventListener('click', (e) =>
  run(e.target, $('#out-usage'), async () => {
    const days = Number($('#in-days').value) || 30;
    return sdk().agent.usageDashboard(days);
  }),
);

// Designer
$('#btn-design').addEventListener('click', (e) =>
  run(e.target, $('#out-design'), async () => {
    const prompt = $('#in-prompt').value.trim();
    if (!prompt) throw new Error('请输入需求描述');
    return sdk().agent.design(prompt);
  }),
);
