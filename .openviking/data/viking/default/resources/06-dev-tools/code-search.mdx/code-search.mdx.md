
# 代码搜索

Agent Spaces 内置代码搜索功能，支持在编辑器中快速搜索代码内容和文件名。

## 搜索能力

### 代码内容搜索

基于 ripgrep（优先）+ Node.js（回退）的**文本级**搜索（非 AST 符号搜索）：

- **正则表达式** — 支持正则匹配模式
- **文件模式过滤** — 按文件名 glob 模式（如 `*.ts`、`*.md`）过滤搜索范围
- **大小写敏感** — 可选择区分或不区分大小写
- **结果数量限制** — 可设置最大返回结果数

> 说明：语义级符号导航（定义/引用/实现）由 [TypeScript LSP](/docs/features/code-editor#typescript-lsp) 提供，不属于代码搜索面板的能力。

### 文件名搜索

快速查找工作空间内的文件：

- 按文件名或路径模糊匹配
- 返回结果包含 `path`、`name`、`type`（`file` 或 `directory`）
- 与代码搜索共用 `.gitignore` 与忽略目录过滤

### .gitignore 支持

代码搜索在 ripgrep 和 Node.js 两条路径下都会解析 `.gitignore`，并额外内置忽略目录集合（`.git`、`node_modules`、`.next`、`__pycache__`、`.turbo`、`dist`、`build`、`.cache`）以及跳过二进制文件扩展名（图片/字体/音视频/压缩包/wasm 等）和超过 1MB 的文件，确保搜索结果的相关性。

## 使用方式

1. 在编辑器区域点击搜索图标或使用快捷键打开搜索面板
2. 输入搜索关键词
3. 可选：勾选正则模式、大小写敏感等选项
4. 搜索结果实时展示，点击即可跳转到对应文件和行

## API 参考

代码搜索提供两个 REST API 端点：

```
GET /api/workspaces/:id/search/code?query=<query>&regex=true&caseSensitive=false&filePattern=*.ts
GET /api/workspaces/:id/search/files?query=<filename>
```

### 搜索选项参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `query` | string | 搜索关键词（必填） |
| `regex` | boolean | 启用正则模式 |
| `caseSensitive` | boolean | 区分大小写 |
| `filePattern` | string | 文件模式过滤 |
| `maxResults` | number | 最大结果数 |

### 代码搜索结果

```json
{
  "results": [
    {
      "file": "src/app.ts",
      "line": 42,
      "column": 10,
      "text": "匹配的文本行",
      "matchStart": 10,
      "matchLength": 5
    }
  ]
}
```

## 搜索引擎选择

系统优先使用系统安装的 ripgrep（`rg` 命令），因为它的搜索速度更快。如果系统未安装 ripgrep，自动回退到 Node.js 实现。
