#!/usr/bin/env node
/**
 * 红绿灯测试 runner —— 输出彩色三段汇总报告。
 *
 * 运行底层 node:test，捕获结果后输出：
 *   🟢 GREEN  339/339 tools registered          PASS
 *   🟡 YELLOW 8/8 representative tools routed    PASS
 *   🔴 RED    4/4 error cases handled           PASS
 *   ═══════════════════════════════════════════
 *   ALL GREEN ✓   (失败 → 退出码 1)
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testFile = join(__dirname, '..', 'dist', 'tests', 'redlight.test.js');

const C = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
};

const child = spawn(process.execPath, ['--test', testFile], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (d) => (stdout += d));
child.stderr.on('data', (d) => (stderr += d));

child.on('close', (code) => {
  // 去除 ANSI 颜色码
  const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
  const lines = (stdout + stderr).split('\n').map((l) => ({ raw: l, clean: strip(l) }));

  const suites = []; // [{ name, pass, fail }]
  let currentSuite = null;

  for (const { clean } of lines) {
    // "# Subtest: 🟢 GREEN ..." → 进入新 suite
    const sub = clean.match(/^#\s+Subtest:\s+(.+)$/);
    if (sub) {
      currentSuite = { name: sub[1].trim(), pass: 0, fail: 0 };
      suites.push(currentSuite);
      continue;
    }
    // 子测试：4 空格缩进的 "    ok N - ..." / "    not ok N - ..."
    // 顶层 suite 结果是 0 缩进的 "ok N - ..."，不计数
    const childOk = clean.match(/^    ok\s+\d+/);
    const childNotOk = clean.match(/^    not ok\s+\d+/);
    if ((childOk || childNotOk) && currentSuite) {
      if (childOk) currentSuite.pass++;
      else currentSuite.fail++;
    }
  }

  const summaryPass = parseInt((stdout.match(/^# pass\s+(\d+)/m) || [])[1] ?? '0', 10);
  const summaryFail = parseInt((stdout.match(/^# fail\s+(\d+)/m) || [])[1] ?? '0', 10);

  console.log('\n' + C.bold('═'.repeat(62)));
  console.log(C.bold('  @agent-spaces/mcp 红绿灯测试报告'));
  console.log(C.bold('═'.repeat(62)));

  const order = ['GREEN', 'YELLOW', 'RED'];
  suites.sort(
    (a, b) =>
      order.findIndex((o) => a.name.includes(o)) - order.findIndex((o) => b.name.includes(o)),
  );

  let allPass = true;
  for (const s of suites) {
    const total = s.pass + s.fail;
    const pass = s.fail === 0 && total > 0;
    if (!pass) allPass = false;
    const tag = pass ? C.green('PASS') : C.red('FAIL');
    // icon 取首个 emoji（GREEN/YELLOW/RED 三态图标）
    const icon = /GREEN/.test(s.name) ? '🟢' : /YELLOW/.test(s.name) ? '🟡' : '🔴';
    // label 去掉 emoji 与 "— 描述" 部分，只留主名
    const label = s.name.replace(/^[🟢🟡🔴\s]+/, '').replace(/\s*—.*$/, '').trim();
    console.log(`  ${icon}  ${label.padEnd(28)} ${String(s.pass).padStart(3)}/${String(total).padEnd(3)}  ${tag}`);
  }

  console.log(C.bold('═'.repeat(62)));
  if (allPass && summaryFail === 0) {
    console.log(C.green(C.bold(`  ALL GREEN ✓    (${summaryPass} tests passed)`)));
  } else {
    console.log(C.red(C.bold(`  HAS RED ✗    (passed=${summaryPass}, failed=${summaryFail})`)));
  }
  console.log(C.bold('═'.repeat(62)) + '\n');

  if (!allPass || summaryFail > 0) {
    console.log(C.gray('--- 失败详情（原始输出）---'));
    console.log(stderr || stdout);
  }

  process.exit(allPass && summaryFail === 0 ? 0 : 1);
});
