#!/usr/bin/env node
/**
 * 校验 game-asset-canvas 提示词库的完整性：
 * 1. prompts.js 语法（babel transform）
 * 2. PROMPT_LIBRARY 条目 id 唯一性
 * 3. references 字段指向的文件是否真实存在
 * 4. category / scene / aspect 字段合法性
 *
 * 用法：node verify-prompts.js
 * 退出码：0 全部通过；1 有错误
 */
const fs = require('fs');
const path = require('path');

const ROOT = 'G:/agent_spaces/packages/server/agent-spaces-data/mini-apps/game-asset-canvas';
const PROMPTS_FILE = path.join(ROOT, 'src/utils/prompts.js');
const SRC_DIR = path.join(ROOT, 'src');

let errors = 0;
const err = (msg) => { console.error('  ✗ ' + msg); errors++; };
const ok = (msg) => console.log('  ✓ ' + msg);

// ---- 1. 语法校验 ----
console.log('\n[1/4] 语法校验 (babel transform)');
try {
  const babel = require('@babel/standalone');
  const src = fs.readFileSync(PROMPTS_FILE, 'utf8');
  babel.transform(src, { presets: ['react'] });
  ok('prompts.js 语法正确');
} catch (e) {
  err('prompts.js 语法错误: ' + e.message);
  console.log('\n校验中止（语法错误无法继续解析条目）');
  process.exit(1);
}

// ---- 提取 PROMPT_LIBRARY 数组并 eval ----
// 由于 prompts.js 用 export，require 不了；用正则+eval 提取数组字面量
const src = fs.readFileSync(PROMPTS_FILE, 'utf8');
const libMatch = src.match(/export\s+const\s+PROMPT_LIBRARY\s*=\s*(\[[\s\S]*?\n\];)/);
if (!libMatch) {
  err('未找到 PROMPT_LIBRARY 数组定义');
  process.exit(1);
}
let LIBRARY;
try {
  // eslint-disable-next-line no-eval
  LIBRARY = eval(libMatch[1]);
} catch (e) {
  err('PROMPT_LIBRARY 解析失败: ' + e.message);
  process.exit(1);
}

// ---- 2. id 唯一性 ----
console.log(`\n[2/4] id 唯一性 (共 ${LIBRARY.length} 条)`);
const seen = new Map();
LIBRARY.forEach((item) => {
  if (!item.id) { err('有条目缺少 id'); return; }
  if (seen.has(item.id)) {
    err(`id 重复: "${item.id}" (第 ${seen.get(item.id)} 条与当前条)`);
  } else {
    seen.set(item.id, LIBRARY.indexOf(item));
  }
});
if (errors === 0) ok('所有 id 唯一');

// ---- 3. 字段合法性 ----
console.log('\n[3/4] 字段合法性');
const VALID_CATEGORY = ['character', 'sprite', 'background', 'convert'];
const VALID_SCENE = ['text', 'edit', 'both'];
const VALID_ASPECT = ['21:9', '16:9', '9:16', '1:1', '4:3', '3:4'];
LIBRARY.forEach((item) => {
  if (!VALID_CATEGORY.includes(item.category)) err(`"${item.id}" category 非法: ${item.category}`);
  if (!VALID_SCENE.includes(item.scene)) err(`"${item.id}" scene 非法: ${item.scene}`);
  if (item.aspect && !VALID_ASPECT.includes(item.aspect)) {
    err(`"${item.id}" aspect 非法: ${item.aspect}（需先在 constants.js 的 ASPECT_OPTIONS 补充）`);
  }
  if (!item.title || !item.desc || !item.prompt) {
    err(`"${item.id}" 缺少 title/desc/prompt`);
  }
});
if (errors === 0) ok('字段全部合法');

// ---- 4. references 文件存在性 ----
console.log('\n[4/4] references 文件存在性');
const refItems = LIBRARY.filter((item) => Array.isArray(item.references) && item.references.length > 0);
console.log(`  共 ${refItems.length} 条带参考图，${refItems.reduce((n, i) => n + i.references.length, 0)} 个文件`);
refItems.forEach((item) => {
  item.references.forEach((rel) => {
    const abs = path.join(SRC_DIR, rel);
    if (!fs.existsSync(abs)) {
      err(`"${item.id}" references 文件不存在: ${rel}`);
    }
  });
});
if (errors === 0) ok('所有 references 文件存在');

// ---- 汇总 ----
console.log('\n' + (errors === 0 ? '✅ 全部通过' : `❌ ${errors} 个错误`));
process.exit(errors === 0 ? 0 : 1);
