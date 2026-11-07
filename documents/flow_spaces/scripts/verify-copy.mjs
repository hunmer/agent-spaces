#!/usr/bin/env node
/**
 * verify-copy.mjs — T2 复制结果校验（备查 / 可重跑）
 * 逐字节比对 documents/flow_spaces 与原仓库对应文件：
 *   packages/**            ↔ packages/**
 *   apps/web/src/**        ↔ packages/web/src/**（脚手架文件无源对应，单列）
 *   apps/web/public/**     ↔ packages/web/public/**
 * 输出：缺失/差异清单 + 汇总计数；全部一致时 exit 0。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FLOW = path.resolve(SCRIPT_DIR, "..");
const REPO = path.resolve(FLOW, "..", "..");

// T4: 跳过 install/build/运行期生成物（本目录新鲜生成，与原仓库同名产物无比对意义）
const SKIP_DIRS = new Set(["node_modules", "dist", "logs"]);
const walk = (dir) => {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
};
const rel = (p, base) => path.relative(base, p).split(path.sep).join("/");
const isScaffold = (r) =>
  r === "App.tsx" ||
  r === "main.tsx" ||
  r === "index.css" ||
  r === "vite-env.d.ts" ||
  r === "app/router.tsx" ||
  r === "app/placeholders.tsx" ||
  r.startsWith("pages/") ||
  r.startsWith("shims/");

// 已记录在 MIGRATION-NOTES.md 的有意 diff（业务 4 处 + server/.env 独立实例配置）
const INTENTIONAL = new Set([
  "server/.env",
  "lib/server.ts",
  "lib/navigate.ts",
  "lib/sdk.ts",
  "stores/terminal.ts",
]);

const ALIAS = { "styles/globals.css": "app/globals.css" }; // 简报指定落点 → 源路径
const groups = [
  { label: "packages", from: path.join(FLOW, "packages"), to: path.join(REPO, "packages") },
  { label: "apps/web/src", from: path.join(FLOW, "apps/web/src"), to: path.join(REPO, "packages/web/src") },
  { label: "apps/web/public", from: path.join(FLOW, "apps/web/public"), to: path.join(REPO, "packages/web/public") },
];

let bad = 0;
for (const g of groups) {
  const files = walk(g.from);
  let ok = 0,
    scaffold = 0,
    intentional = 0,
    missing = [],
    diff = [];
  for (const f of files) {
    const r = rel(f, g.from);
    const src = path.join(g.to, ALIAS[r] || r);
    if (g.label === "apps/web/src" && isScaffold(r)) {
      scaffold++;
      continue;
    }
    if (!fs.existsSync(src)) {
      missing.push(r);
      continue;
    }
    const a = fs.readFileSync(f),
      b = fs.readFileSync(src);
    if (a.equals(b)) ok++;
    else if (INTENTIONAL.has(r)) intentional++;
    else diff.push(r);
  }
  bad += missing.length + diff.length;
  console.log(
    `[${g.label}] 文件 ${files.length}: 一致 ${ok}, 脚手架(无源对应) ${scaffold}, 已记录diff ${intentional}, 源缺失 ${missing.length}, 内容差异 ${diff.length}`,
  );
  for (const m of missing) console.log(`  源缺失: ${m}`);
  for (const d of diff) console.log(`  差异: ${d}`);
}
console.log(bad === 0 ? "✅ 全部一致" : `❌ 共 ${bad} 处问题`);
process.exit(bad === 0 ? 0 : 1);
