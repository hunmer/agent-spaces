/**
 * Agent Store 演示 —— fetchIndex(baseUrl)
 */
import { sdk, $, run } from './sdk-config.js';

$('#btn-fetch').addEventListener('click', (e) =>
  run(e.target, $('#out'), () => {
    const baseUrl = $('#in-base').value.trim();
    if (!baseUrl) throw new Error('请输入 store baseUrl');
    return sdk().agentStore.fetchIndex(baseUrl);
  }),
);
