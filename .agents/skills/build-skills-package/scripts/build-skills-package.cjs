#!/usr/bin/env node
/**
 * 把若干 skill 文件夹封装成 Agent Spaces 技能包（skillspackage）。
 *
 * 产物（直接写入 packages/templates/skillspackage/）：
 *   {slug}.zip
 *     └─ {slug}/
 *         ├─ manifest.json
 *         ├─ PROMPT.md
 *         └─ skills/
 *             ├─ {skill-1}.zip    ← 每个 skill 一个 zip，SKILL.md 在根
 *             └─ {skill-2}.zip
 *
 * 然后调用 generate-index.mjs 重建 index.json（zip 即唯一真相源）。
 *
 * 用法：
 *   node build-skills-package.cjs --slug <slug> --src <skills-dir> [options]
 *
 * 参数：
 *   --slug <slug>           技能包 slug（必填，也作 zip 文件名 / 目录前缀）
 *   --src <dir>             源 skills 目录，其下每个子目录是一个 skill（必填）
 *   --name <displayName>    商店显示名（默认 = slug）
 *   --summary <text>        manifest.summary（默认空）
 *   --prompt <file>         PROMPT.md 文件路径（默认用源目录下的 PROMPT.md，否则用占位模板）
 *   --tools <a,b,c>         manifest.tools 逗号分隔（默认不填，最小权限）
 *   --out <dir>             输出目录（默认 packages/templates/skillspackage）
 *   --no-index              跳过自动重建索引
 *   --force                 覆盖已存在的 {slug}.zip
 *
 * 示例：
 *   node build-skills-package.cjs --slug phaserjs --src G:/game/skills \
 *     --name "Phaser.js 游戏开发专家" --summary "Phaser 4 全套技能"
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');

// ---------- CLI 解析 ----------
function parseArgs(argv) {
  const args = { tools: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--slug': args.slug = next(); break;
      case '--src': args.src = next(); break;
      case '--name': args.name = next(); break;
      case '--summary': args.summary = next(); break;
      case '--prompt': args.prompt = next(); break;
      case '--tools': args.tools = (next() || '').split(',').map(s => s.trim()).filter(Boolean); break;
      case '--out': args.out = next(); break;
      case '--no-index': args.noIndex = true; break;
      case '--force': args.force = true; break;
      case '-h':
      case '--help':
        console.log(fs.readFileSync(__filename, 'utf-8').match(/\/\*\*[\s\S]*?\*\//)[0]);
        process.exit(0);
    }
  }
  return args;
}

// ---------- 零依赖 ZIP 打包器（store + deflate 混合，与 generate-index.mjs 一致） ----------
function collectDirFiles(dir, prefix) {
  const out = [];
  for (const file of fs.readdirSync(dir)) {
    if (file === 'node_modules' || file === '.git') continue;
    const fullPath = path.join(dir, file);
    const rel = prefix ? `${prefix}/${file}` : file;
    const s = fs.statSync(fullPath);
    if (s.isDirectory()) out.push(...collectDirFiles(fullPath, rel));
    else out.push({ rel, fullPath });
  }
  return out;
}

function writeZip(files, outPath) {
  // files: Array<{ rel: string, data: Buffer }>
  const localParts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.rel, 'utf-8');
    const isAlreadyZip = f.rel.toLowerCase().endsWith('.zip');
    let compMethod = 0;
    let fileData = f.data;
    // 小文本走 deflate，已压缩的 zip 走 store，避免无谓开销
    if (!isAlreadyZip && f.data.length > 1024) {
      const deflated = zlib.deflateRawSync(f.data);
      if (deflated.length < f.data.length) {
        compMethod = 8;
        fileData = deflated;
      }
    }
    const crc = zlib.crc32(f.data);
    const compSize = fileData.length;
    const uncompSize = f.data.length;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(compMethod, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(compSize, 18);
    lh.writeUInt32LE(uncompSize, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    localParts.push(lh, nameBuf, fileData);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(compMethod, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(compSize, 20);
    ch.writeUInt32LE(uncompSize, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + fileData.length;
  }

  const centralBuf = Buffer.concat(central);
  const cdOffset = offset;
  const cdSize = centralBuf.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  fs.writeFileSync(outPath, Buffer.concat([...localParts, centralBuf, eocd]));
}

// ---------- 主流程 ----------
function main() {
  const args = parseArgs(process.argv);

  // 参数校验
  if (!args.slug) { console.error('[error] --slug 必填'); process.exit(1); }
  if (!args.src) { console.error('[error] --src 必填'); process.exit(1); }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(args.slug)) {
    console.error('[error] --slug 只能含小写字母/数字/连字符'); process.exit(1);
  }
  if (!fs.existsSync(args.src) || !fs.statSync(args.src).isDirectory()) {
    console.error(`[error] 源目录不存在: ${args.src}`); process.exit(1);
  }

  // 定位输出目录：优先 --out；否则从脚本位置向上找 packages/templates/skillspackage
  const scriptDir = __dirname;
  let targetDir;
  if (args.out) {
    targetDir = path.resolve(args.out);
  } else {
    // .agents/skills/<skill>/scripts → repo root = scriptDir 退 4 层
    const candidate = path.resolve(scriptDir, '../../../../packages/templates/skillspackage');
    targetDir = fs.existsSync(candidate) ? candidate : null;
  }
  if (!targetDir || !fs.existsSync(targetDir)) {
    console.error(`[error] 输出目录不存在: ${targetDir || '(未定位)'}`); process.exit(1);
  }

  // 收集源 skills
  const skills = fs.readdirSync(args.src, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(args.src, d.name, 'SKILL.md')))
    .map(d => d.name)
    .sort();
  if (skills.length === 0) {
    console.error(`[error] ${args.src} 下没有任何含 SKILL.md 的子目录`); process.exit(1);
  }
  console.log(`[info] 发现 ${skills.length} 个 skill: ${skills.join(', ')}`);

  // 外层 zip 路径
  const outerZip = path.join(targetDir, `${args.slug}.zip`);
  if (fs.existsSync(outerZip) && !args.force) {
    console.error(`[error] 已存在 ${outerZip}，加 --force 覆盖`); process.exit(1);
  }

  // 1) 逐个 skill 打成内层 zip（无目录前缀，SKILL.md 在根）
  const innerFiles = []; // { rel: '{slug}/skills/{name}.zip', data: Buffer }
  for (const name of skills) {
    const files = collectDirFiles(path.join(args.src, name), '')
      .map(f => ({ rel: f.rel, data: fs.readFileSync(f.fullPath) }));
    const buf = zipToBuffer(files);
    innerFiles.push({
      rel: `${args.slug}/skills/${name}.zip`,
      data: buf,
    });
    console.log(`  + skills/${name}.zip (${files.length} files)`);
  }

  // 2) manifest.json
  const manifest = {
    type: 'skillhub-expert-package',
    slug: args.slug,
    displayName: args.name || args.slug,
    summary: args.summary || '',
    skillSlugs: skills,
  };
  if (args.tools.length) manifest.tools = args.tools;
  innerFiles.push({
    rel: `${args.slug}/manifest.json`,
    data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'),
  });

  // 3) PROMPT.md
  let promptText;
  if (args.prompt && fs.existsSync(args.prompt)) {
    promptText = fs.readFileSync(args.prompt, 'utf-8');
  } else if (fs.existsSync(path.join(args.src, 'PROMPT.md'))) {
    promptText = fs.readFileSync(path.join(args.src, 'PROMPT.md'), 'utf-8');
  } else {
    promptText = [
      `# ${manifest.displayName}`,
      '',
      `你已安装以下技能（共 ${skills.length} 个）：${skills.map(s => `**${s}**`).join('、')}。`,
      '请根据用户需求，按需调用相应技能完成任务。',
      '',
      '## 使用策略',
      '',
      skills.map(s => `- **${s}**：`).join('\n'),
      '',
      '## 任务执行原则',
      '',
      '1. 先定位问题域，调用对应技能',
      '2. 遵循该领域的惯用法与最佳实践',
      '3. 输出可运行的方案或代码',
    ].join('\n');
  }
  innerFiles.push({
    rel: `${args.slug}/PROMPT.md`,
    data: Buffer.from(promptText, 'utf-8'),
  });

  // 4) 写外层 zip
  writeZip(innerFiles, outerZip);
  console.log(`[done] ${args.slug}.zip → ${outerZip} (${innerFiles.length} entries)`);

  // 5) 重建索引
  if (!args.noIndex) {
    const genScript = path.resolve(targetDir, '..', 'generate-index.mjs');
    if (fs.existsSync(genScript)) {
      console.log(`[info] 重建索引: node ${genScript}`);
      try {
        execSync(`node "${genScript}"`, { stdio: 'inherit' });
      } catch (e) {
        console.warn(`[warn] generate-index 失败，请手动执行`);
      }
    } else {
      console.warn(`[warn] 未找到 generate-index.mjs，请手动重建索引`);
    }
  }
}

// 内存版打包（返回 Buffer），用于嵌套 zip
function zipToBuffer(files) {
  const tmp = path.join(require('os').tmpdir(), `__bsp_${Date.now()}_${Math.random().toString(36).slice(2)}.zip`);
  writeZip(files, tmp);
  const buf = fs.readFileSync(tmp);
  fs.unlinkSync(tmp);
  return buf;
}

main();
