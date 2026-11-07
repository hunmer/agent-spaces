#!/usr/bin/env node
/**
 * copy-closure.mjs — T2 迁移复制脚本（备查 / 可重跑 / 幂等）
 *
 * 从 agent-spaces 原仓库复制到 documents/flow_spaces：
 *   A) packages/{shared,sdk,server,templates} 四包源码
 *      规则：仅复制 git 跟踪文件（天然排除 node_modules/dist/out 等生成物），
 *      另显式排除 server/agent-spaces-data/**（运行时数据，git 跟踪但非源码）与 .DS_Store。
 *   B) packages/web/src 的 workflow + mini-app 依赖闭包（Lead 决策口径 2026-11-07）：
 *      种子 = 9 个目录/文件：
 *        app/workflows, app/mini-apps, app/mini-apps-preview,
 *        components/workflow, components/workflows, components/mini-apps,
 *        lib/workflow-nodes, stores/workflow-editor, stores/workflow.ts
 *      排除 app 下所有 page.tsx 与 layout.tsx（Next 壳，由 react-router/main.tsx 替代），
 *      同目录 *-client.tsx 保留（真实入口）。
 *      边（四类静态解析，含 import type）：
 *        ① import … from '@/…' / './…' / '../…'
 *        ② export {…} from / export * from
 *        ③ dynamic import('…') 字面量 / require('…')
 *        ④ 相对路径跨目录逃出种子目录同样递归（实现上对所有已入集文件全量解析）
 *      裸包名（react、@agent-spaces/*、next/* 等）视为外部依赖不跟随。
 *      计数口径：闭包内 ts/tsx 文件数（规划预期 ~594）；闭包内非 ts 资源一并复制另计。
 *      对账：删除上一轮复制过、本轮不在清单内且源仓库存在对应文件的文件
 *      （脚手架 src/{App.tsx,main.tsx,index.css,vite-env.d.ts}、src/pages/**、src/shims/** 永不删）。
 *   C) 资源：src/locales 全量、src/app/globals.css、
 *      public/{monaco,monaco-themes,icons,devices,sdk} 全量。
 *
 * 输出：flow_spaces/scripts/copy-report.txt（含最终数字、分目录分布、与规划口径对比、
 *       差距文件清单）+ 控制台摘要。
 * 用法：node copy-closure.mjs [--dry-run]
 * 约束：只写 flow_spaces 内部；不触碰原仓库任何文件。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DRY = process.argv.includes("--dry-run");

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FLOW = path.resolve(SCRIPT_DIR, ".."); // documents/flow_spaces
const REPO = path.resolve(FLOW, "..", ".."); // agent_spaces 仓库根
const WEB = path.join(REPO, "packages", "web");
const SRC = path.join(WEB, "src");
const DEST_SRC = path.join(FLOW, "apps", "web", "src");

const report = [];
const log = (line = "") => {
  console.log(line);
  report.push(line);
};

const copyFile = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};

const walk = (dir) => {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === ".DS_Store" || e.name === "node_modules") continue;
      out.push(...walk(p));
    } else if (e.isFile()) {
      out.push(p);
    }
  }
  return out;
};

const rel = (p, base) => path.relative(base, p).split(path.sep).join("/");

/* ---------------- A) 四包源码 ---------------- */
log("=== A) packages/{shared,sdk,server,templates} ===");
log("规则: git 跟踪文件; 排除 server/agent-spaces-data/**(运行时数据) 与 .DS_Store");
const PKGS = ["shared", "sdk", "server", "templates"];
const pkgStats = {};
for (const pkg of PKGS) {
  const out = execFileSync(
    "git",
    ["-c", "core.quotepath=false", "ls-files", "-z", "--", `packages/${pkg}`],
    { cwd: REPO, maxBuffer: 256 * 1024 * 1024 },
  );
  let files = out.toString("utf8").split("\0").filter(Boolean);
  const before = files.length;
  files = files.filter(
    (f) =>
      !f.startsWith(`packages/server/agent-spaces-data/`) &&
      !f.endsWith(".DS_Store"),
  );
  const excluded = before - files.length;
  let copied = 0;
  if (!DRY) {
    for (const f of files) {
      copyFile(path.join(REPO, f), path.join(FLOW, f));
      copied++;
    }
  } else {
    copied = files.length;
  }
  pkgStats[pkg] = { copied, excluded };
  log(
    `  ${pkg}: 复制 ${copied} 个文件 (git跟踪 ${before}, 排除 ${excluded}: agent-spaces-data/.DS_Store)`,
  );
}

/* ---------------- B) web/src 闭包（Lead 决策口径） ---------------- */
log("");
log("=== B) packages/web/src workflow+mini-app 闭包（Lead 口径: 9 种子 + 四类静态解析） ===");

const SEEDS = [
  "app/workflows",
  "app/mini-apps",
  "app/mini-apps-preview",
  "components/workflow",
  "components/workflows",
  "components/mini-apps",
  "lib/workflow-nodes",
  "stores/workflow-editor",
  "stores/workflow.ts",
];
// 排除 Next 壳(page/layout)；*-client.tsx 保留
const isShell = (r) => r.startsWith("app/") && /(^|\/)(page|layout)\.tsx?$/.test(r);
const isTsx = (f) => /\.(ts|tsx)$/.test(f);

let seedFiles = [];
for (const s of SEEDS) {
  const p = path.join(SRC, s);
  if (!fs.existsSync(p)) {
    log(`  ⚠️ 种子不存在: ${s}`);
    continue;
  }
  seedFiles.push(...(fs.statSync(p).isDirectory() ? walk(p) : [p]));
}
const shells = seedFiles.filter((f) => isShell(rel(f, SRC)));
seedFiles = seedFiles.filter((f) => !isShell(rel(f, SRC)));
log(
  `种子: ${SEEDS.length} 个 → ${seedFiles.length} 文件 (排除壳 ${shells.length} 个: ${shells
    .map((f) => rel(f, SRC))
    .join(", ")})`,
);

const EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".json"];

const resolveSpec = (spec, fromFile) => {
  let base = null;
  if (spec.startsWith("./") || spec.startsWith("../")) {
    base = path.resolve(path.dirname(fromFile), spec);
  } else if (spec.startsWith("@/")) {
    base = path.join(SRC, spec.slice(2));
  } else {
    return { external: true }; // 裸包名: react / @agent-spaces/* / next/* ...
  }
  const cands = [
    base,
    ...EXTS.map((e) => base + e),
    ...EXTS.map((e) => path.join(base, "index" + e)),
  ];
  for (const c of cands) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return { file: c };
  }
  return { unresolved: true };
};

const importRes = [
  // ①② import/export … from（含 import type、export * from、多行）
  /\b(?:import|export)\b[^;'"()]*?\bfrom\s*['"]([^'"\n]+)['"]/g,
  // 副作用 import '…'
  /(?:^|\n)\s*import\s*['"]([^'"\n]+)['"]/g,
  // ③ dynamic import('…') 字面量
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  // require('…')
  /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  // CSS @import
  /@import\s*(?:url\(\s*)?['"]([^'"\n]+)['"]/g,
];
const depsOf = (file) => {
  const text = fs.readFileSync(file, "utf8");
  const specs = new Set();
  for (const re of importRes) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) specs.add(m[1]);
  }
  return [...specs];
};

const seen = new Set(seedFiles);
const queue = seedFiles.filter(isTsx);
const unresolved = [];
while (queue.length) {
  const f = queue.pop();
  for (const spec of depsOf(f)) {
    const r = resolveSpec(spec, f);
    if (r.external) continue;
    if (r.unresolved) {
      unresolved.push(`${rel(f, SRC)} -> ${spec}`);
      continue;
    }
    if (!seen.has(r.file)) {
      seen.add(r.file);
      if (isTsx(r.file)) queue.push(r.file);
    }
  }
}

const closureAll = [...seen];
const closureTs = closureAll.filter(isTsx);
const closureOther = closureAll.filter((f) => !isTsx(f));
let webCopied = 0;
if (!DRY) {
  for (const f of closureAll) {
    copyFile(f, path.join(DEST_SRC, rel(f, SRC)));
    webCopied++;
  }
} else {
  webCopied = closureAll.length;
}

// 对账：删除上一轮复制、本轮不在清单内且源存在对应文件的文件（脚手架/新增文件永不删）
const keepRel = new Set(closureAll.map((f) => rel(f, SRC)));
const isScaffold = (r) =>
  r === "App.tsx" ||
  r === "main.tsx" ||
  r === "index.css" ||
  r === "vite-env.d.ts" ||
  r.startsWith("pages/") ||
  r.startsWith("shims/");
const deleted = [];
if (!DRY && fs.existsSync(DEST_SRC)) {
  for (const f of walk(DEST_SRC)) {
    const r = rel(f, DEST_SRC);
    if (isScaffold(r) || keepRel.has(r)) continue;
    if (fs.existsSync(path.join(SRC, r))) {
      fs.rmSync(f);
      deleted.push(r);
    }
  }
}

// 分目录分布（闭包 ts/tsx；components 按前两段，顶层目录 stores/hooks/lib/app 按首段聚合）
const dist2 = {};
const dist1 = {};
for (const f of closureTs) {
  const parts = rel(f, SRC).split("/");
  const k2 = parts.length > 1 ? parts.slice(0, 2).join("/") : parts[0];
  dist2[k2] = (dist2[k2] || 0) + 1;
  dist1[parts[0]] = (dist1[parts[0]] || 0) + 1;
}
log(
  `闭包结果: 共 ${closureAll.length} 文件, 其中 ts/tsx = ${closureTs.length} (规划预期 ~594), 其他 = ${closureOther.length}`,
);
if (closureOther.length) {
  const extCount = {};
  for (const f of closureOther) {
    const e = path.extname(f) || "(无扩展)";
    extCount[e] = (extCount[e] || 0) + 1;
  }
  log(`  其他类型: ${Object.entries(extCount).map(([k, v]) => k + v).join(" ")}`);
}
if (unresolved.length) {
  log(`  静态不可解析引用 ${unresolved.length} 处(动态模板串, 已跳过):`);
  for (const u of unresolved.slice(0, 20)) log(`    ${u}`);
}
if (deleted.length) {
  log(`  对账删除 ${deleted.length} 个上一轮遗留文件(不在本轮清单且源存在):`);
  for (const d of deleted.slice(0, 30)) log(`    ${d}`);
}

// 与规划口径对比（Lead 提供的参考分布，"约"为非精确值）
const PLAN_REF = [
  ["components/ui", 190], ["components/workflow", 148], ["lib", 44],
  ["components/mini-apps", 34], ["components/common", 20], ["stores", 31],
  ["lib/workflow-nodes", 17], ["components/chat", 14], ["hooks", 12],
  ["components/sidebar", "~10"], ["components/workflows", "~10"],
  ["components/editor", "~10"], ["components/reui", "~10"], ["components/viewers", 6],
  ["components/plugins", 4], ["components/layout", 4], ["components/composer", 4],
  ["app", 10], ["components/home", 2], ["components/git", 2],
];
const actualOf = (k) => (k.includes("/") ? dist2[k] || 0 : dist1[k] || 0);
log("");
log("分目录分布 (实际 vs 规划参考):");
for (const [k, v] of PLAN_REF) {
  const a = actualOf(k);
  const mark = typeof v === "number" && a < v ? " ⚠️缺" : "";
  log(`  ${k}: 实际 ${a} / 规划 ${v}${mark}`);
}
// 差距文件清单：规划参考目录中未入闭包的 ts/tsx
log("");
log("差距文件清单（规划参考目录中未入闭包的 ts/tsx, 供 adapter/T4 动态兜底参考）:");
for (const [k] of PLAN_REF) {
  const dir = k.split(" ")[0];
  const srcDir = path.join(SRC, dir);
  if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) continue;
  const miss = walk(srcDir)
    .filter(isTsx)
    .filter((f) => !keepRel.has(rel(f, SRC)))
    .map((f) => rel(f, SRC));
  if (miss.length) {
    log(`  [${dir}] 未入闭包 ${miss.length} 个:`);
    for (const m of miss) log(`    ${m}`);
  }
}

/* ---------------- C) 资源 ---------------- */
log("");
log("=== C) 资源(locales 全量 / globals.css / public 五目录) ===");
const assets = [];
for (const f of walk(path.join(SRC, "locales")))
  assets.push([f, path.join(DEST_SRC, rel(f, SRC))]);
assets.push([
  path.join(SRC, "app", "globals.css"),
  path.join(DEST_SRC, "styles", "globals.css"), // 任务简报指定落点 src/styles/globals.css
]);
for (const sub of ["monaco", "monaco-themes", "icons", "devices", "sdk"]) {
  const dir = path.join(WEB, "public", sub);
  if (!fs.existsSync(dir)) {
    log(`  ⚠️ public/${sub} 源目录不存在，跳过`);
    continue;
  }
  for (const f of walk(dir))
    assets.push([f, path.join(FLOW, "apps", "web", "public", sub, rel(f, dir))]);
}
let assetCopied = 0;
if (!DRY) {
  for (const [from, to] of assets) {
    copyFile(from, to);
    assetCopied++;
  }
} else {
  assetCopied = assets.length;
}
const assetDirs = {};
for (const [from] of assets) {
  const r = rel(from, WEB);
  const key = r.startsWith("src/locales")
    ? "src/locales"
    : r.startsWith("public/")
      ? "public/" + r.split("/")[1]
      : r;
  assetDirs[key] = (assetDirs[key] || 0) + 1;
}
log(`资源复制: ${assetCopied} 个文件`);
for (const [k, v] of Object.entries(assetDirs)) log(`  ${k}: ${v}`);

/* ---------------- 汇总 ---------------- */
log("");
log("=== 汇总 ===");
const pkgTotal = Object.values(pkgStats).reduce((a, b) => a + b.copied, 0);
log(
  `四包 ${pkgTotal} + 闭包 ${webCopied} + 资源 ${assetCopied} = ${pkgTotal + webCopied + assetCopied} 次写入${DRY ? " (dry-run 预估)" : ""}（闭包内 json 与 locales 若重叠为同一路径重复写入）`,
);
log(`闭包 ts/tsx 计数 vs 规划预期: ${closureTs.length} / ~594`);

if (!DRY) {
  fs.writeFileSync(path.join(SCRIPT_DIR, "copy-report.txt"), report.join("\n") + "\n");
  console.log(`\n报告已写入 ${path.join(SCRIPT_DIR, "copy-report.txt")}`);
}
