# 图片展示节点比例与旋转

## 目标

- 带图片创建 `imageDisplay` 前先读取图片尺寸并按比例设置节点宽高。
- 工具栏增加顺时针旋转按钮，每次 90 度，状态持久化并同步节点比例。

## 阶段

1. [complete] 定位创建入口与现有自动尺寸逻辑。
2. [complete] 添加尺寸算法回归测试并实现公共工具。
3. [complete] 接入 URL、拖拽文件及节点旋转交互。
4. [complete] 运行测试与 JSX 语法检查。

## 约束

- 空图片展示节点继续使用默认尺寸。
- 不修改宿主层，不使用真实浏览器测试。
- 保留工作区现有未提交修改。

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| 测试找不到 `image-display-size.js` | 1 | 预期红灯；随后实现该模块 |
| 全量测试 2 项 FFmpeg PNG 断言失败 | 1 | 属于工作区既有插件改动，与本任务无关；未修改 |
| 并行验证中的 `rg` 无匹配返回 1 | 1 | 改为分别执行测试和 Babel 编译 |

---

# 文本连线支持变量级替换

## 目标

- 文本节点连接新节点时，目标属性下展示该字段现有文本中的 `{变量}`。
- 选择变量后仅替换该变量占位符；不选变量时保留整字段替换语义。
- 编辑态继续保存纯文本，变量仅做高亮展示。

## 阶段

1. [complete] 定位连接弹窗、文本输入派生和提示词编辑器实现。
2. [complete] 确定兼容旧边数据的最小数据结构与替换规则。
3. [complete] 实现弹窗交互和文本派生逻辑。
4. [complete] 添加回归测试并完成语法检查。

## 约束

- 仅修改 game-asset-canvas mini-app。
- 不使用真实浏览器测试。
- 不把存储格式改为富文本；输出和持久化仍为纯文本。
- 保留工作区现有未提交修改。

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| 全目录 `rg` 命中 vendor 压缩文件导致输出污染 | 1 | 后续搜索排除 `vendor/**` 并限定目标文件 |
| `node --test <src目录>` 被 Node 22 当成模块文件，报 `MODULE_NOT_FOUND` | 1 | 改由 PowerShell 枚举全部 `*.test.js` 后传参 |
| 全量 243 项中 4 项失败 | 1 | 1 项本任务断言已更新通过；3 项为工作区既有 reskin/FFmpeg 改动失败，不在本任务范围 |

---

# Tiptap 变量引用与边联动

## 目标

- Tiptap 文本字段把 `{变量}` 渲染成与对应 edge 同色的高亮引用。
- 每条 edge 使用稳定且彼此可区分的颜色。
- 悬停变量引用打开 HoverCard：已连线时可删除对应边；未连线时可编辑变量文本。
- 删除连线后保留变量位置并恢复手动输入能力。

## 阶段

1. [complete] 调查宿主 PromptTextEditor/Tiptap 扩展点、节点字段接入和边删除链路。
2. [complete] 确定纯文本存储、变量交互状态与稳定颜色映射。
3. [complete] 实现编辑器引用、HoverCard、边颜色及删除回调。
4. [complete] 添加回归测试、更新文档并完成语法/全量验证。

## 约束

- 保留 `{变量}` 纯文本模板语义和旧边兼容。
- 不复制完整 Tiptap 编辑器；优先扩展宿主现有 PromptTextEditor。
- 不使用真实浏览器测试，除非实现无法通过源码与单元测试验证。
- 保留工作区现有未提交修改。

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| 文本字段 `rg` 复合表达式转义后未闭合 | 1 | 改为多个简单 `-e` 条件，不再使用跨行 HTML 正则 |
| Windows 下 `rg packages/*/package.json` 路径通配符无效 | 1 | 改查实际 workspace package.json |
| 根 package.json/锁文件未直接命中 Tiptap 依赖字符串 | 1 | 用 `rg -l` 定位到 packages/web/package.json |
| JSX `type="text"` 搜索再次发生引号转义失败 | 2 | 停止使用该正则，改按已知行号直接读取 |
| Web 全量 TSC 失败 | 1 | PromptTextEditor 错误已清零；其余为工作区既有 API 类型错误 |
| 图生图测试仍断言旧 resolved prompt 结构 | 1 | 更新为 stored template + resolved execution 断言 |
| Tippy delegation 并行查询无有效输出 | 1 | 从 packages/web 运行时确认 delegate 导出 |

## HoverCard 定位修复

1. [complete] 核对 Tippy delegate reference 行为并排除根节点锚定假设。
2. [complete] 固定变量 span 的 reference rect，避免 Decoration DOM 替换后退化到左上角。
3. [complete] 更新回归测试并完成 TypeScript/相关测试验证。

### 根因与处理

- Tippy delegate 首次处理变量 span 的 `mouseover` 时，Tiptap 已替换 Decoration DOM；日志确认 `onTrigger` 阶段 reference 已断开且矩形为零。
- delegate 随后会继续命中新生成的 span 并创建实例，造成左上角 Popover 无限出现。
- 改用编辑器外的稳定 anchor 承载单个手动 Tippy 实例；变量 span 只在 `mouseover` 当下提供 key 和矩形，不再作为 Tippy reference。

## 变量展示值与提示词库误触修复

1. [complete] 追踪变量连线文本、Decoration 展示和提示词库点击事件链。
2. [complete] 让变量 binding 复用执行链的纯文本值并生成 `displayValue`。
3. [complete] 保持底层 `{变量}` 模板不变，仅在 Decoration 中展示替换文本。
4. [complete] 移除提示词字段对按钮和编辑器的隐式 label 包裹。
5. [complete] 添加回归测试并完成 TypeScript、Babel 与 diff 验证。

---

# 分组实例执行身份隔离

## 目标

- 每个素材实例中的模板节点拥有稳定且不重复的执行节点 ID。
- 请求开始时冻结实例 ID、模板节点 ID 和执行节点 ID。
- 请求完成后只更新该执行身份对应的实例节点数据，不读取当前激活实例决定归属。

## 阶段

1. [complete] 追踪队列请求、节点更新、实例切换和快照结构，建立失败回归测试。
2. [complete] 定义并实现稳定执行节点身份及定向结果写回。
3. [complete] 接入普通节点、选择节点和运行所有路径，移除 active-run 补偿逻辑。
4. [complete] 验证切换期间并发完成、缩略图/版本和旧数据兼容。

## 约束

- 实例执行 ID 必须全局唯一且稳定，不能只使用模板节点 ID。
- 结果归属不能依赖完成时的 `activeId`。
- 保留旧工作流数据兼容，不迁移画布拓扑节点 ID。
- 不使用真实浏览器测试，除非纯函数/集成测试无法覆盖身份路由。

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| 预期的 `src/utils/group-execution.test.js` 不存在 | 1 | 改用 `rg --files` 定位实际分组执行测试文件 |
| handoff 条目实际以内部序号 `37.` 开头，文档补丁上下文两次不匹配 | 2 | 按真实文本 `37.` 重新追加条目 |
| 跨文件 patch 的 hunk 分隔格式错误 | 1 | 拆成两个独立补丁应用 |
| 全量测试 3 项 reskin/FFmpeg 断言失败 | 1 | 与规划记录中的既有失败一致；本任务新增/相关测试全部通过 |
| 初次 background service 全仓搜索命中 vendor 大文件 | 1 | 收窄到 mini-app 与宿主相关目录并排除 vendor/node_modules |
| `rg -l` 组合搜索因第二个表达式无匹配返回 1 | 1 | 已获得首个搜索结果，后续按已知文件定点读取 |
| `workflow.js` 补丁未匹配实际函数声明 | 1 | 改为读取准确行段后定点修改 |
| handoff 约束编号与预期不一致导致文档组合补丁失败 | 1 | 按实际末尾章节分别追加文档 |
| 全量测试从 mini-app 目录运行导致宿主源码相对路径 ENOENT | 1 | 改从仓库根目录传入测试文件列表重跑；其余 3 项为既有基线失败 |

### 决策

- 连线文本优先于手动 fallback；两者都没有时显示原 `{变量名}`。
- 多条变量连线的展示值与执行值一致：去重后以两个换行连接。
- 不把替换文本写回 Tiptap 文档或节点 params，持久化仍保留纯文本变量模板。

---

# 外网图片后台下载队列

## 目标

- Toolbar 右侧增加“下载队列”入口并展示任务状态。
- 文生图、图生图等节点产生外网图片时自动加入 miniapp background service 队列。
- 后台下载完成后保存为本地资源，并把准确的节点输出字段替换成本地 HTTP 地址。
- 页面刷新不终止已提交的下载任务。

## 阶段

1. [complete] 调查 handoff、background service 协议、图片输出与节点定向写回链路。
2. [complete] 设计最小队列协议、持久任务状态与本地资源 URL 映射。
3. [complete] 实现后台下载服务、前端自动入队及 Toolbar 队列界面。
4. [complete] 添加回归测试并完成语法、定向与服务验证。

## 约束

- 仅修改 game-asset-canvas 及其既有宿主扩展边界。
- 下载必须在 miniapp background services 中运行，不能依赖页面生命周期。
- 写回必须沿用冻结执行身份，避免分组实例切换导致结果串写。
- 不使用真实浏览器测试，除非静态和服务级测试不足以验证。
- 保留工作区现有未提交修改。
