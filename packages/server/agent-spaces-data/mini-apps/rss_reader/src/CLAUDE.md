# RSS 订阅阅读器

> 本文件随项目演进保持更新。

## 项目概览

订阅 RSS/Atom/RDF/JSON Feed 源 → 拉取更新 → 浏览/收藏文章 → AI 一键总结单篇正文。

界面四栏，使用 `ResizablePanelGroup` 可拖拽分栏，布局持久化到 `configs/layout.json`（server-side 文件 API）：
- 左栏：订阅源列表（含「全部」、单源拉取、删除）
- 中栏：当前过滤后的文章列表（收藏过滤、已读/未读）
- 右栏：文章详情（元信息 + 收藏 + AI总结触发按钮 + 正文）
- 最右栏：独立的 AI 总结面板（生成/重新总结/复制 + 总结内容）

布局记忆：`ResizablePanelGroup` 的 `defaultLayout`/`onLayoutChange` 配 `readConfigJson`/`writeConfigJson`（`configs/layout.json`），值是 `{ [panelId]: 数字百分比 }`。各面板 `defaultSize`/`minSize`/`maxSize` 用字符串百分比（见 `docs/ui/react-resizable-panels-size-units.md`，数字会被当 px）。

## 文件结构

```
src/
  index.jsx              # 入口：useRss() + 三栏布局
  components/
    Toolbar.jsx          # 顶部：输入 URL 添加、拉取全部、收藏过滤、配置 AI、错误/提示
    FeedList.jsx         # 左栏：订阅源目录（全部/单源、刷新、删除）
    ArticleList.jsx      # 中栏：文章卡片（标题/预览/源/时间/收藏）
    ArticleView.jsx      # 右栏：详情元信息 + 收藏 + AI总结触发按钮 + 正文(HTML优先)
    SummaryPanel.jsx     # 最右栏：独立 AI 总结面板（生成/重新总结/复制 + 内容）
  hooks/
    useRss.js            # 集中状态：增删源、单/全拉取、收藏、已读、总结、Agent 配置
  utils/
    constants.js         # 插件 ID、上限阈值、CONFIG_FILES/LAYOUT_FILE、uid()
    feed.js              # normalizeItem / mergeArticles / htmlToText / articleKey
    format.js            # formatDate / timeAgo
manifest.json           # enabledPlugins: ["workflow.feed-parser"]
```

子组件纯展示（props 驱动）；状态全在 `useRss`。

## 能力链 / 外部依赖

| 能力 | 调用方式 |
|------|----------|
| 拉取订阅源 | `callPluginTool('workflow.feed-parser', 'feed_fetch', { url, limit })` → `data.data.feed.items[]` |
| 配置 AI 模型 | `openAgentEditor({ initialName, initialPrompt, agentId })` → `{ id, name, modelProvider }` |
| AI 总结 | `callPluginTool('@agent-spaces/builtin', 'agent_run', { prompt, agentConfigId, permissionMode: 'bypassPermissions' })` → `{ result }` |
| 持久化 | `readConfigJson` / `writeConfigJson`（server-side `configs/` 目录） |
| 布局记忆 | `readConfigJson` / `writeConfigJson`（`configs/layout.json`） |

**不使用 localStorage**。所有持久化走 mini-app 文件 API。

**关键：按源拆分文件**——每个订阅源的文章独立存 `configs/feed_<id>.json`，拉取某源只读写该源文件，物理隔离杜绝互相覆盖。
- `configs/feeds.json`：订阅源列表
- `configs/feed_<feedId>.json`：该源的文章（每个源一个文件）
- `configs/agent.json`：Agent 配置
- `configs/layout.json`：面板布局

feed_fetch 响应结构：`callPluginTool` 返回 `{ result: { success, data: { format, title, description, link, itemCount, feed: { items: [] }, content, url } } }`。
代码里取 `resp.result.data`（兼容 `resp.result` 直接是 data 的情形）。

## 关键设计

- **按源拆分文件（核心防覆盖设计）**：每个订阅源的文章独立存 `configs/feed_<feedId>.json`。`fetchOne(feedId)` 只读 `feed_<feedId>.json` → 单源内合并（`mergeFeedItems`，保留用户态）→ 只写回 `feed_<feedId>.json`。**绝不读写其他源文件**，从物理隔离上杜绝「刷新单源覆盖其他源」。这是用户指出的根本解法。
- **按文件串行写盘**：`writeQueues`（`{ [file]: Promise }`）保证同一文件的多次写串行；不同文件互不干扰，可并发。
- **内存聚合**：`articlesByFeed`（`{ [feedId]: Article[] }`）是 UI 数据源，mount 时并行读所有源文件填充；`allArticles`/`filteredArticles`/`counts` 由其派生。更新单篇文章（收藏/已读/总结）只改该源文件。
- **初始化异步**：mount 时 `Promise.all` 并行读 `feeds.json` + `agent.json` + 所有 `feed_*.json`，`ready=false` 期间显示 loading。
- **单源内合并**：`mergeFeedItems` 按 `articleKey`（guid→link→title）去重，本次 fresh 条目前置（重合的保留 favorite/readAt/summary 用户态），其余老文章保留。
- **正文渲染**：优先用源站 HTML（`dangerouslySetInnerHTML`），通过 Tailwind 任意值选择器给 a/img/code/blockquote 套主题安全样式；HTML 为空回退纯文本；都没有则提示打开原文。
- **AI 总结**：正文截断到 `MAX_SUMMARY_CHARS`(12000)，prompt 强制输出「一句话观点 + 3~5 条要点 + 阅读建议」，`permissionMode: bypassPermissions` 避免卡权限确认。总结写入文章并持久化，UI 同时展示。
- **任务跟踪**：`agent_run` 带 `{ taskId, meta }` 第 4 参，登记为 WS 任务频道，多端可见；发起方 `await` 拿结果直接落库（仅单端写，因为结果存的是文章级单字段，无并发覆盖问题）。
- **拉取全部**：顺序 `await` 避免并发把服务打满；任一失败记入该源 `error` 字段并在左栏标红，不中断后续源。
- **文章合并**（`mergeArticles`）：用独立 `seen` 集合跟踪已写入结果的文章 key，本次 fresh 条目前置（重合的保留老用户态），其余老文章（含其他订阅源）一律保留。**不要**复用承载 `oldList` 查询用的 map 作为去重集合——否则老文章的 key 永远命中 `map.has`，导致它们全被丢弃（曾导致「刷新一个源后其他源文章被清空」）。
- **可拖拽布局**：`ResizablePanelGroup` + 三个 `ResizableHandle`（`withHandle`），布局经 `onLayoutChange` 存 `configs/layout.json`，刷新恢复。面板根 div 用 `h-full w-full min-h-0`，滚动内容用 `ScrollArea`。

## 持久化项（configs/ 目录，按源拆分）

- `feeds.json`：订阅源列表（含 lastFetchAt/error）
- `feed_<feedId>.json`：该源文章（含 favorite/readAt/summary/summaryAt）
- `agent.json`：`{ agentConfigId, agentMeta }`
- `layout.json`：面板布局

mount 时并行读取，`ready=false` 期间显示 loading。

## 已知限制

- 无后台定时拉取，需用户手动点「拉取全部」或单源刷新。
- 同源老文章不会主动清理（可在后续加「仅保留最近 N 篇」）。
- 正文 HTML 直接渲染，依赖源站内容安全；如需更严格隔离可改 iframe sandbox。
