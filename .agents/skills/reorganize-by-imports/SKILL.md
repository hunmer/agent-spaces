---
name: reorganize-by-imports
description: 扫描目录下文件的引用关系，按依赖分组移动文件到新文件夹，自动更新所有 import 路径。Use when user wants to reorganize, refactor file structure, move files, group by dependencies, or clean up directory layout.
---

# 基于引用关系的文件重组

将相关文件按 import 依赖关系分组，移动到新文件夹，并自动更新所有引用路径。

## 工具脚本

```
node .Codex/skills/reorganize-by-imports/scripts/reorganize.mjs <command> [options]
```

支持三个命令：

| 命令 | 作用 |
|------|------|
| `analyze <dir>` | 扫描文件，展示引用关系和被引用排名 |
| `group <dir>` | BFS 连通分量分组，建议移动方案 |
| `move <dir> -f <files> -t <target>` | 执行移动 + 更新所有 import |

## 典型工作流

### 1. 分析引用关系

```bash
node .Codex/skills/reorganize-by-imports/scripts/reorganize.mjs analyze ./src/components/sidebar
```

输出每个文件的被引用次数、引用者列表，生成 `.reorganize-analysis.json`。

### 2. 查看自动分组建议

```bash
node .Codex/skills/reorganize-by-imports/scripts/reorganize.mjs group ./src/components/sidebar
```

用 BFS 找出引用连通分量，按内部引用密度排序，给出移动建议和命令。生成 `.reorganize-groups.json`。

### 3. 执行移动

```bash
node .Codex/skills/reorganize-by-imports/scripts/reorganize.mjs move ./src/components/sidebar \
  -f "user-card.tsx,user-avatar.tsx,user-info.tsx" \
  -t ./src/components/sidebar/user
```

移动文件并自动更新：
- 被移动文件内部的相对 import（位置变了，路径跟着变）
- 未移动文件中引用被移动文件的 import
- 生成移动报告

## 处理范围

- **文件类型**: `.ts` `.tsx` `.js` `.jsx` `.mjs` `.cjs`
- **import 类型**: `import/from`、`export/from`、`require()`、动态 `import()`、`import type`
- **仅处理相对路径**: `.` / `..` 开头的 import，不碰 bare module（`react` 等）
- **自动排除**: `node_modules`、`dist`、`.git`、`.next`

## 注意事项

- 移动前先 `analyze` 或 `group` 确认引用关系
- 脚本会原地修改文件，建议先 git commit 或在 worktree 中操作
- `-f` 参数用逗号分隔文件名（相对于指定目录）
- 目标目录不存在会自动创建
- 移动后旧文件会被删除（内容已写入新位置）
