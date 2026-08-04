# Findings

- CodeGraph 当前不可用，已按项目规则回退到 `rg`。
- `useImageOutputs.buildImageNodes`、`useNodeCrud.addImageNodesAt`、`handleDropFiles` 都先按固定 `260x240` 创建节点。
- `ImageDisplayNode` 在 `<img onLoad>` 后调用 `handleAutoSize`，因此会先显示错误比例再跳变。
- 图片已有 `object-contain`，旋转时还需交换节点显示比例，才能避免大量留白。
- `RotateCw` 已由 `@agent-spaces/ui` 暴露，可直接用于 toolbar。

## 文本连线变量级替换

- 用户要求连接弹窗形成“目标属性 -> 可选 `{变量}`”两级选择。
- 兼容语义：未选变量时替换整个字段，选择变量时只替换指定占位符。
- 富文本编辑器仅可用于展示/编辑体验，节点数据与工作流输入必须继续使用纯文本。
- `manifest.json` 入口仍为 `src/index.jsx`，本次不涉及宿主层或插件配置。
- `src/CLAUDE.md` 要求改代码前读取 `claude/conventions.md`；本次需同步更新相关 `claude/*.md` 或 handoff 约束。
- 项目运行时由 Babel 编译，适合新增纯函数工具和 React UI；不需要也不应为变量高亮引入新第三方依赖。
- 首次 `rg` 未排除 `vendor/`，被压缩包内容污染；后续搜索显式使用 `--glob "!vendor/**"`。
- `ConnectionTargetDialog.jsx` 当前把每个目标属性渲染成一次性按钮，点击即 `onSelect(target.id, asset, inputType)`，没有二级状态。
- `Canvas.jsx` 的 `addConnections` 负责写入边数据；当前文本边仅持久化 `inputType` 和 `inputTarget`。
- `computeInputTexts` 当前返回 `{ [inputTarget]: string[] }`，消费者据此覆盖节点执行时的字段值；变量级替换应在此派生结果或统一合并层实现。
- 现有 `htmlToPlainText` 已将文本节点富文本产出转为纯文本，变量替换无需改变文本节点输出格式。
- `Canvas.onConnect` 仅在兼容目标超过一个时打开弹窗；单目标会直接连接。要支持变量选择，文本目标即使只有一个属性但包含 `{变量}` 也必须打开弹窗。
- `useNodeCrud` 也使用同一目标解析函数处理“拖线到空白处新增节点后自动连接”，该路径必须同步传递目标字段值和变量选择结果。
- 节点组件普遍以 `{ ...storedParams, ...textInputValues }` 合并引用值，因此 `computeInputTexts` 返回最终替换后的字段纯文本即可，不需要逐个修改节点组件。
- `getTextInputTargets` 只从 `PARAMS_SCHEMA` 暴露 `text/textarea` 字段，实际值统一位于目标节点 `data.params[field]`。
- 最小兼容数据结构：边的 `data.inputVariable` 可选保存变量名（不含 `{}`）；缺失时保持旧版整字段覆盖。
- 变量级派生以目标节点持久化 `data.params[field]` 为模板，只替换精确的 `{变量名}`；多个变量边可在同一模板上依次替换。
- 新节点自动连接在 `useNodeCrud.handleAddAtDrop` 中创建后立即决定是否弹窗，需要从同一套 `initialData + lastParams + dataPatch` 合并结果读取目标字段值。
- 图生图 `EditImageNode` 的提示词使用宿主 `PromptTextEditor`，保存 HTML、执行时 `promptToText` 转纯文本；文生图等节点仍用 textarea/input。
- 本功能无需统一替换所有编辑器：变量识别针对存储字符串，弹窗以高亮 token 选择；派生结果先转纯文本再替换即可兼容 HTML 与纯文本字段。
- 同一来源可能需要连接同一字段的不同变量，Canvas 的边去重 key 必须纳入 `inputVariable`。
- 冲突规则确定：字段存在整字段边时保持旧语义并优先整字段覆盖；仅存在变量边时才以目标持久化字段为模板逐变量替换。
- 工作区已有与本任务无关的未提交修改（manifest、api/tools、图像处理、文档等）；本次仅局部编辑目标文件，不回退既有内容。
- `ensureEdgeIds` 的稳定 ID 基础值也需包含 `inputVariable`，否则同字段不同变量边只能靠顺序后缀区分。
- 新增样式 `bg-primary/5`、`bg-primary/15`、`bg-muted/30`、`border-primary/40` 均可在宿主源码中确认，运行时 Tailwind 样式可用。
- 全量测试最终为 243 项中 240 通过；剩余 3 项是工作区既有 `resolveReskinnedImage` 与 FFmpeg PNG/crop 断言失败，本任务相关失败已清零。
