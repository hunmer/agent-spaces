/**
 * postbuild：给 tsc 产物的相对 ESM import 补 .js 后缀。
 *
 * 原因：tsconfig 用 moduleResolution=bundler，tsc 不会给输出补扩展名；
 * 但浏览器原生 ESM、Node ESM 都强制要求相对 import 带完整扩展名，
 * 否则 demo 直接引用 dist 时浏览器请求 '/dist/modules/avatar'（无 .js）→ 404。
 *
 * 只处理 from / import 位置的相对路径说明符（./ 或 ../），
 * 跳过已带扩展名的与 bare import。幂等，可重复运行。
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

// 捕获 from "..." / import("...") / import "..." 位置的相对说明符（开闭引号须配对）
const SPEC = /((?:\bfrom|\bimport)\s*[(]?\s*)(['"])(\.\.?\/[^'"]+?)\2/g;

let total = 0;
for (const file of await walk(root)) {
  const src = await readFile(file, 'utf8');
  let n = 0;
  const out = src.replace(SPEC, (m, prefix, q, path) => {
    if (extname(path)) return m; // 已带扩展名，跳过
    n++;
    return `${prefix}${q}${path}.js${q}`;
  });
  if (n > 0) {
    await writeFile(file, out, 'utf8');
    total += n;
    console.log(`  ${file.replace(root, '')}  (+${n})`);
  }
}
console.log(`fix-esm-extensions: patched ${total} import path(s)`);
