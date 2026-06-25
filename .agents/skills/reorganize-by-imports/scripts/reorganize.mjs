#!/usr/bin/env node
/**
 * reorganize.mjs — 基于引用关系的文件重组工具
 *
 * 用法:
 *   node reorganize.mjs analyze <dir>              # 分析目录下文件的引用关系
 *   node reorganize.mjs move <dir> -f <files> -t <target>  # 移动文件并更新引用
 *   node reorganize.mjs group <dir>                # 按引用密度自动分组
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join, relative, dirname, extname, resolve } from 'node:path'

// ─── 配置 ───

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const EXTENSIONS_TO_TRY = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']

// 匹配各种 import/require/export...from 语句中的路径
const IMPORT_RE = /(?:import\s+(?:type\s+)?(?:[\w$*,{}\s]+)\s+from|import\s+(?:type\s+)?|export\s+(?:type\s+)?(?:[\w$*,{}\s]+)\s+from|export\s+\*\s+from|require\()\s*['"]([^'"]+)['"]/g
const DYNAMIC_IMPORT_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/g

// ─── 文件扫描 ───

function scanFiles(dir, root = dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.next') continue
      files.push(...scanFiles(full, root))
    } else if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
      files.push(full)
    }
  }
  return files
}

// ─── 路径解析 ───

function stripJsExt(p) {
  // .js/.mjs/.cjs -> 对应的 TS 源文件可能同名
  return p.replace(/\.(js|mjs|cjs)$/, '')
}

function resolveImportPath(fromFile, importPath) {
  if (!importPath.startsWith('.')) return null // 只处理相对路径
  const dir = dirname(fromFile)
  const stripped = stripJsExt(importPath)
  let abs = resolve(dir, stripped)

  // 精确匹配（无扩展名时补全）
  if (!existsSync(abs)) {
    for (const ext of EXTENSIONS_TO_TRY) {
      if (existsSync(abs + ext)) return abs + ext
    }
    // 尝试 index
    for (const ext of EXTENSIONS_TO_TRY) {
      const idx = join(abs, 'index' + ext)
      if (existsSync(idx)) return idx
    }
    return null
  }
  // 如果是目录，找 index
  if (statSync(abs).isDirectory()) {
    for (const ext of EXTENSIONS_TO_TRY) {
      const idx = join(abs, 'index' + ext)
      if (existsSync(idx)) return idx
    }
  }
  return abs
}

// ─── Import 解析 ───

function parseImports(filePath) {
  const content = readFileSync(filePath, 'utf-8')
  const imports = []
  let m

  // 重置 regex 并匹配
  const re1 = new RegExp(IMPORT_RE.source, IMPORT_RE.flags)
  while ((m = re1.exec(content)) !== null) {
    imports.push({ raw: m[1], index: m.index, fullMatch: m[0] })
  }
  const re2 = new RegExp(DYNAMIC_IMPORT_RE.source, DYNAMIC_IMPORT_RE.flags)
  while ((m = re2.exec(content)) !== null) {
    imports.push({ raw: m[1], index: m.index, fullMatch: m[0] })
  }

  return imports.filter(imp => imp.raw.startsWith('.')).map(imp => {
    const resolved = resolveImportPath(filePath, imp.raw)
    return { ...imp, resolved }
  })
}

// ─── 依赖图构建 ───

function buildDependencyGraph(files) {
  const fileSet = new Set(files)
  const graph = new Map() // file -> { imports: Set, importedBy: Set }

  for (const f of files) {
    graph.set(f, { imports: new Set(), importedBy: new Set() })
  }

  for (const f of files) {
    const imports = parseImports(f)
    const node = graph.get(f)
    for (const imp of imports) {
      if (imp.resolved && fileSet.has(imp.resolved)) {
        node.imports.add(imp.resolved)
        graph.get(imp.resolved).importedBy.add(f)
      }
    }
  }
  return graph
}

// ─── 分析命令 ───

function cmdAnalyze(dir) {
  const absDir = resolve(dir)
  if (!existsSync(absDir)) {
    console.error(`目录不存在: ${absDir}`)
    process.exit(1)
  }

  const files = scanFiles(absDir)
  if (files.length === 0) {
    console.log('没有找到源文件 (.ts/.tsx/.js/.jsx)')
    return
  }

  const graph = buildDependencyGraph(files)

  console.log(`\n📁 目录: ${absDir}`)
  console.log(`📄 文件数: ${files.length}\n`)

  // 按被引用次数排序
  const sorted = files.slice().sort((a, b) =>
    graph.get(b).importedBy.size - graph.get(a).importedBy.size
  )

  for (const f of sorted) {
    const rel = relative(absDir, f).replace(/\\/g, '/')
    const node = graph.get(f)
    const inCount = node.imports.size
    const outCount = node.importedBy.size
    const bar = '█'.repeat(Math.min(outCount, 20))
    console.log(`  ${rel}`)
    console.log(`    被引用: ${outCount} 次 ${bar} | 引用: ${inCount} 个文件`)

    if (outCount > 0) {
      const importers = [...node.importedBy].map(x => '  <- ' + relative(absDir, x).replace(/\\/g, '/'))
      console.log(importers.join('\n'))
    }
    console.log()
  }

  // 输出 JSON 供程序消费
  const jsonOutput = {
    directory: absDir,
    files: sorted.map(f => {
      const node = graph.get(f)
      return {
        path: relative(absDir, f).replace(/\\/g, '/'),
        imports: [...node.imports].map(x => relative(absDir, x).replace(/\\/g, '/')),
        importedBy: [...node.importedBy].map(x => relative(absDir, x).replace(/\\/g, '/')),
        importCount: node.imports.size,
        importedByCount: node.importedBy.size,
      }
    })
  }

  const jsonPath = join(absDir, '.reorganize-analysis.json')
  writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2))
  console.log(`\n📊 分析结果已保存: ${jsonPath}`)
}

// ─── 分组命令 ───

function cmdGroup(dir) {
  const absDir = resolve(dir)
  const files = scanFiles(absDir)
  if (files.length === 0) {
    console.log('没有找到源文件')
    return
  }

  const graph = buildDependencyGraph(files)
  const visited = new Set()
  const groups = []

  // BFS 找连通分量
  for (const f of files) {
    if (visited.has(f)) continue
    const group = []
    const queue = [f]
    while (queue.length > 0) {
      const curr = queue.shift()
      if (visited.has(curr)) continue
      visited.add(curr)
      group.push(curr)
      const node = graph.get(curr)
      for (const imp of node.imports) {
        if (!visited.has(imp)) queue.push(imp)
      }
      for (const imp of node.importedBy) {
        if (!visited.has(imp)) queue.push(imp)
      }
    }
    if (group.length > 0) {
      groups.push(group)
    }
  }

  // 按组大小降序
  groups.sort((a, b) => b.length - a.length)

  console.log(`\n📁 目录: ${absDir}`)
  console.log(`🔗 发现 ${groups.length} 个引用组\n`)

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]
    const totalRefs = g.reduce((sum, f) => {
      const node = graph.get(f)
      // 只计算组内引用
      return sum + [...node.imports].filter(x => g.includes(x)).length
    }, 0)
    const density = g.length > 1 ? (totalRefs / (g.length * (g.length - 1)) * 100).toFixed(1) : 0
    console.log(`  ── 组 ${i + 1} (${g.length} 文件, 内部引用 ${totalRefs}, 密度 ${density}%) ──`)
    for (const f of g) {
      const rel = relative(absDir, f).replace(/\\/g, '/')
      const node = graph.get(f)
      const internalRefs = [...node.importedBy].filter(x => g.includes(x)).length
      console.log(`    ${rel} (被组内引用 ${internalRefs} 次)`)
    }
    console.log()

    if (g.length >= 3) {
      // 建议目录名：取公共前缀或最常见的子目录
      const dirs = g.map(f => dirname(relative(absDir, f)))
      const commonPrefix = longestCommonPrefix(dirs.map(d => d.replace(/\\/g, '/')))
      const suggestedName = commonPrefix || `group-${i + 1}`
      console.log(`  💡 建议移动到: ${suggestedName}/`)
      console.log(`     node reorganize.mjs move "${absDir}" -f "${g.map(f => relative(absDir, f)).join(',')}" -t "${join(absDir, suggestedName)}"`)
      console.log()
    }
  }

  // 保存分组结果
  const jsonOutput = {
    directory: absDir,
    groups: groups.map((g, i) => ({
      id: i + 1,
      files: g.map(f => relative(absDir, f).replace(/\\/g, '/')),
      size: g.length,
      internalRefs: g.reduce((sum, f) =>
        sum + [...graph.get(f).imports].filter(x => g.includes(x)).length, 0
      ),
    }))
  }
  const jsonPath = join(absDir, '.reorganize-groups.json')
  writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2))
  console.log(`📊 分组结果已保存: ${jsonPath}`)
}

function longestCommonPrefix(strs) {
  if (strs.length === 0) return ''
  if (strs.length === 1) return strs[0]
  let prefix = strs[0]
  for (let i = 1; i < strs.length; i++) {
    while (!strs[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1)
      if (prefix === '') return ''
    }
  }
  return prefix
}

// ─── 移动命令 ───

function cmdMove(dir, fileList, target) {
  const absDir = resolve(dir)
  const absTarget = resolve(target)

  if (!existsSync(absDir)) {
    console.error(`源目录不存在: ${absDir}`)
    process.exit(1)
  }

  // 解析文件列表
  const filesToMove = fileList.split(',').map(f => resolve(absDir, f.trim())).filter(existsSync)
  if (filesToMove.length === 0) {
    console.error('没有找到要移动的文件')
    process.exit(1)
  }

  // 扫描所有文件（包括移动范围外的，因为它们可能引用被移动的文件）
  const allFiles = scanFiles(absDir)
  const moveMap = new Map() // oldAbs -> newAbs

  for (const f of filesToMove) {
    const newName = join(absTarget, relative(absDir, f).replace(/\\/g, '/').split('/').pop())
    moveMap.set(f, newName)
  }

  // 创建目标目录
  for (const newPath of moveMap.values()) {
    const dir = dirname(newPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }

  // 更新所有文件的 import 路径
  let totalUpdates = 0
  for (const f of allFiles) {
    const content = readFileSync(f, 'utf-8')
    const imports = parseImports(f)
    if (imports.length === 0) continue

    // 当前文件是否被移动
    const fileMoved = moveMap.has(f)
    const currentLocation = fileMoved ? moveMap.get(f) : f

    let newContent = content
    // 从后往前替换，避免 index 偏移
    const sortedImports = imports.sort((a, b) => b.index - a.index)

    for (const imp of sortedImports) {
      if (!imp.resolved) continue

      // 被引用的文件是否被移动
      const importedMoved = moveMap.has(imp.resolved)
      if (!fileMoved && !importedMoved) continue

      // 计算新的相对路径
      const importedNewLocation = importedMoved ? moveMap.get(imp.resolved) : imp.resolved
      const newRelPath = computeRelativeImport(currentLocation, importedNewLocation)

      if (newRelPath && newRelPath !== imp.raw) {
        // 替换 import 路径
        const oldLiteral = imp.raw
        // 需要在 fullMatch 中找到 oldLiteral 并替换
        const escapedOld = oldLiteral.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const re = new RegExp(escapedOld)
        newContent = newContent.replace(re, newRelPath)
        totalUpdates++
      }
    }

    if (newContent !== content) {
      writeFileSync(f, newContent)
      const rel = relative(absDir, f).replace(/\\/g, '/')
      console.log(`  ✏️  更新引用: ${rel}`)
    }
  }

  // 移动文件
  for (const [oldPath, newPath] of moveMap) {
    // 先把内容写到新位置
    const content = readFileSync(oldPath, 'utf-8')
    writeFileSync(newPath, content)
    // 删除旧文件
    unlinkSync(oldPath)
    const relOld = relative(absDir, oldPath).replace(/\\/g, '/')
    const relNew = relative(absDir, newPath).replace(/\\/g, '/')
    console.log(`  📦 移动: ${relOld} -> ${relNew}`)
  }

  console.log(`\n✅ 完成: 移动 ${filesToMove.length} 个文件, 更新 ${totalUpdates} 处引用`)
}

function computeRelativeImport(fromFile, toFile) {
  let rel = relative(dirname(fromFile), toFile).replace(/\\/g, '/')
  if (!rel.startsWith('.')) rel = './' + rel
  // 去掉扩展名 (TypeScript/JavaScript import 通常不含扩展名，除非用户显式写了)
  // 保留扩展名，让用户决定是否去掉
  return rel
}

// ─── CLI 入口 ───

const args = process.argv.slice(2)
const command = args[0]

if (!command) {
  console.log(`用法:
  node reorganize.mjs analyze <dir>
  node reorganize.mjs move <dir> -f <files> -t <target>
  node reorganize.mjs group <dir>
`)
  process.exit(0)
}

switch (command) {
  case 'analyze': {
    const dir = args[1]
    if (!dir) { console.error('请指定目录'); process.exit(1) }
    cmdAnalyze(dir)
    break
  }
  case 'group': {
    const dir = args[1]
    if (!dir) { console.error('请指定目录'); process.exit(1) }
    cmdGroup(dir)
    break
  }
  case 'move': {
    const dir = args[1]
    let files = '', target = ''
    for (let i = 2; i < args.length; i++) {
      if (args[i] === '-f' || args[i] === '--files') files = args[++i]
      if (args[i] === '-t' || args[i] === '--target') target = args[++i]
    }
    if (!dir || !files || !target) {
      console.error('用法: node reorganize.mjs move <dir> -f <files> -t <target>')
      process.exit(1)
    }
    cmdMove(dir, files, target)
    break
  }
  default:
    console.error(`未知命令: ${command}`)
    process.exit(1)
}
