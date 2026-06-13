# 电子书转播客

> This file is auto-generated. Keep it up-to-date as the project evolves.

## Project Overview

上传 EPUB 电子书，解析出章节目录，选中某一章节后用 AI 把正文改编成**双人播客对话脚本**（主持人 + 嘉宾）。

界面三栏：左栏章节目录 / 中栏章节正文 / 右栏 AI 生成的播客脚本（对话气泡）。

## File Structure

```
src/
  index.jsx                 # 入口：usePodcast() + 三栏布局组合
  components/
    Toolbar.jsx             # 顶部工具栏（上传、模型选择、错误/提示）
    ChapterList.jsx         # 左栏：章节目录
    ChapterView.jsx         # 中栏：章节正文 + 生成按钮
    PodcastPanel.jsx        # 右栏：AI 播客脚本（对话气泡）
  hooks/
    usePodcast.js           # 集中状态：上传/解析/选章/生成 + 持久化恢复
  utils/
    constants.js            # 插件 ID、截断阈值、SETTING_KEYS
    epub.js                 # deriveChapters / htmlToText / toc→spine label
    script.js               # parseScript / truncate
    styles.js               # 布局样式 + roleBubbleStyle
manifest.json              # enabledPlugins: ["workflow.epub-parser"]
```

子组件纯展示（props 驱动，无内部 state）；状态全在 `usePodcast`。

## 能力链 / 外部依赖

| 能力 | 调用方式 |
|------|----------|
| 上传 EPUB | `window.AgentSpaces.uploadFile(file)` → `{ path }`（绝对路径） |
| 解析元信息+目录 | `callPluginTool('workflow.epub-parser', 'epub_info', { filePath })` |
| 取章节正文 | `callPluginTool('workflow.epub-parser', 'epub_chapters', { filePath, start, count })` |
| 列出 AI 预设 | `callPluginTool('@agent-spaces/builtin', 'list_agent_presets', {})` |
| 生成播客 | `callPluginTool('@agent-spaces/builtin', 'agent_run', { prompt, agentConfigId, systemPrompt, permissionMode })` |

`@agent-spaces/builtin` 是宿主内置虚拟插件（`packages/server/src/services/builtin-tools/mini-app-tools.ts` 的 `BUILTIN_PLUGIN_ID`），经 `packages/server/src/routes/plugin.ts` 的 execute 路由识别后走 `executeMiniAppBuiltinTool`。`agent_run` 即 mini-app-tools.ts line 320-391 的内置工具。

## Key Design Decisions

- **章节列表来自 spine**：epub `toc`（树）用于反查 `label`，`spine`（线性阅读顺序）决定章节顺序与 index。`deriveChapters()` 按 `href`（去锚点）把 toc label 映射到 spine，匹配不到回退「第 N 章」。加载正文用 spine 的 `index` 调 `epub_chapters`。
- **HTML→纯文本**：`htmlToText()` 剥 style/script、块级标签转换行、去标签、`textarea` 解码实体。中间栏只展示纯文本，避免 epub 内联 CSS 污染。
- **AI 输出契约**：prompt 强制每行 `角色：内容`（中文冒号），`parseScript()` 按 `：` 切分，未知行归为「旁白」。正文超 `MAX_CONTENT_CHARS`(12000) 截断并在 prompt 注明。
- **任务编排**：`agent_run` 调用带 `options: { taskId, meta }`，登记为 WS 频道任务，独立预览页/其他标签可见进度；发起方同时 `await` 拿结果。
- **权限模式 `bypassPermissions`**：播客生成是纯文本任务，避免 agent runtime 卡在权限确认。

## 状态持久化与恢复

用 User Settings API（`window.AgentSpaces.getUserSetting / setUserSetting / saveUserSettings`，`use-mini-app-host-api.ts:397-459`）：localStorage、per-project（key `workflow_setting_<projectId>`）、同步、不跨端。

持久化项（`utils/constants.js` 的 `SETTING_KEYS`）：`filePath`、`bookMeta`、`selectedIndex`、`agentConfigId`、`podcast`。

- **恢复**：useState 初始化器同步读取（首屏即见上次的 epub 书名/选中/脚本）；mount useEffect 里若有 `filePath` 则 `parseBook` 重建章节列表 + `loadChapter(selectedIndex)` 重载正文。文件已删/移动时 catch 提示重新上传。
- **写入**：上传后存 `filePath/bookMeta`、选章存 `selectedIndex`、切模型存 `agentConfigId`、生成完成存 `podcast`，均经 `saveUserSettings` 浅合并。

## Notes

- 未选 AI 模型预设时，「生成本章播客」按钮禁用；预设来自 `list_agent_presets`，默认取第一个。
- `agent_run` 会创建真实 agent runtime（可能是 Claude Code/Codex 等），开销大于单次 chat；systemPrompt 明确「不使用工具、不执行命令、只输出对话」收敛行为。
