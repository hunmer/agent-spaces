/**
 * Git 演示 —— status / log / branches / commit / push / pull
 */
import { sdk, $, run, loadWorkspaceOptions } from './sdk-config.js';

const wsSelect = $('#ws-select');
loadWorkspaceOptions(wsSelect);

function wsId() {
  const id = wsSelect.value;
  if (!id) throw new Error('请先选择工作区');
  return id;
}

// status
$('#btn-status').addEventListener('click', (e) =>
  run(e.target, $('#out-status'), () => sdk().git.status(wsId())),
);

// log
$('#btn-log').addEventListener('click', (e) =>
  run(e.target, $('#out-log'), () => sdk().git.log(wsId())),
);

// branches
$('#btn-branches').addEventListener('click', (e) =>
  run(e.target, $('#out-branches'), () => sdk().git.branches(wsId())),
);

// commit
$('#btn-commit').addEventListener('click', (e) =>
  run(e.target, $('#out-commit'), async () => {
    const message = $('#in-msg').value.trim();
    if (!message) throw new Error('请输入 commit message');
    await sdk().git.commit(wsId(), message);
    return { message: '提交成功', committed: message };
  }),
);

// push
$('#btn-push').addEventListener('click', (e) =>
  run(e.target, $('#out-commit'), async () => {
    await sdk().git.push(wsId());
    return { message: 'push 完成' };
  }),
);

// pull
$('#btn-pull').addEventListener('click', (e) =>
  run(e.target, $('#out-commit'), async () => {
    await sdk().git.pull(wsId());
    return { message: 'pull 完成' };
  }),
);
