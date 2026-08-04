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

## Tiptap 变量引用与边联动

- 用户明确要求变量从弹窗 token 升级为编辑器内可交互高亮引用。
- 最新变更：变量交互从点击 Popover 改为悬停 HoverCard；不再注册 click handler。
- 全量测试更新为 249 项中 246 通过；剩余仍为既有 resolveReskinnedImage 与两项 FFmpeg 失败，本任务相关失败为 0。

## HoverCard 定位修复

- Tippy 6.3.7 `delegate` 源码确认子实例 reference 是命中的变量 span，排除锚定编辑器根节点的假设。
- 根因判断：focus 触发 ProseMirror transaction 后 Decoration span 可能被替换，Tippy reference 脱离 DOM并返回零矩形，表现为左上角。
- 修复策略：`onTrigger` 快照变量 span 的 `getBoundingClientRect()`；在线时读实时 rect，脱离时回退快照。
- 当前无受管 Web/浏览器反馈回路，无法执行真实布局自动化；以用户稳定复现 + Tippy delegate 源码验证 + 结构回归测试作为反馈信号。
- 高亮颜色必须与对应 edge 一致，并且不同 edge 使用不同稳定颜色。
- Popover 状态分两类：变量已连线时隐藏输入框并提供删除连线；未连线时允许手动输入文本。
- 第一次文本字段复合搜索因 PowerShell/JSON 正则转义失败，后续拆成简单搜索条件。
- 宿主 `PromptTextEditor` 位于 `packages/web/src/components/common/editors/prompt-text-editor.tsx`，通过 `@agent-spaces/ui` 暴露。
- Mini-app 当前只有 `EditImageNode` 使用 PromptTextEditor；TextToImage/TextToVoice/VideoGenerator/WorkflowRunner 及 NodeFormDialog/NodeExecuteDialog 仍使用 AutoResizeTextarea。
- 要覆盖目标字段，需提供统一变量编辑器封装并接入生成类节点与表单字段；NoteNode 不属于 params 文本连接目标，可排除。
- Windows `rg` 不接受路径参数中的 `packages/*/package.json` 通配符，依赖版本改从根 package.json/锁文件查询。
- PromptTextEditor 内部使用 `useEditor + StarterKit + Mention + Placeholder`，并以 HTML 受控同步；当前未提供自定义 extension、变量 node view 或点击回调 props。
- 宿主已有 `tippy.js` 浮层和 Base UI Popover；变量节点若在编辑器内部处理，tippy 更适合直接锚定 ProseMirror DOM，外部 Base UI Popover 需要额外 virtual anchor 状态。
- 根 package.json/锁文件搜索未直接命中 Tiptap 字符串，需继续定位实际 workspace package 文件。
- 实际依赖位于 `packages/web/package.json`：Tiptap core/react/starter-kit/mention 版本为 `^3.22.5`，tippy.js 为 `^6.3.7`。
- 推荐使用 ProseMirror Decoration 高亮字面量 `{变量}`，不把变量转成持久化 HTML node：颜色/连接状态可动态变化，HTML/纯文本模板兼容，断线无需重写文档。
- 手动变量值需要独立保存为 `data.textVariableValues[field][variable]`；否则把输入写回模板会删除 `{变量}`，无法继续作为可连接引用。
- `useDecoratedNodes` 可按节点注入变量绑定与删边回调；目前 `computeInputTexts(nodes, edges)` 只处理边，需要扩展为同时合并手动变量值。
- 2026-08-04 网络核对：Tiptap 官方 custom extension 文档与 ProseMirror Decoration API 均返回 200，支持 `addProseMirrorPlugins`/Decoration 方案。
- 仓库已有 `packages/web/src/components/workflow/workflow-variable-input.tsx` 使用 `@tiptap/pm/view` 的 Decoration/DecorationSet，应优先复用其解析和装饰模式。
- WorkflowVariableInput 使用 `Extension.create + Plugin + Decoration.inline` 扫描文本 token，并通过 transaction meta 刷新动态装饰；可直接借鉴到 PromptTextEditor。
- 同一变量当前允许多条来源边（多选连接也会产生），单 token 需支持多个 connection：Popover 列出每条边；存在任一连接时隐藏手动输入，全部删除后显示 fallback 输入。
- 变量高亮单边使用该 edge 颜色；多边绑定同一变量时使用多色线性渐变/边框表达全部连接，避免任意丢弃颜色。
- `FloatingEdge` 已使用 `data.highlightColor` 绘制标签，path/marker 颜色由 `decorateEdgesForSelection` 提供；可在 edge-display 中集中切换为每边稳定颜色。
- `useDecoratedNodes` 的 callbacks 注入链可新增 `onDeleteEdge`，并按 edges 构造 `textVariableBindings[field][variable]` 传给节点编辑器。
- 手动 fallback 数据结构确定为 `node.data.textVariableValues[field][variable]`；执行时优先级：整字段边 > 变量边 > 手动 fallback > 原 `{变量}`。
- JSX 属性引号搜索已连续两次转义失败，后续直接读取已知节点文件相关区段。
- 接入范围确定：生成类节点内 params 文本字段；WorkflowRunner 的 JSON/Monaco 与 NoteNode 不迁移。
- 变量 token 规则将收紧为字母、数字、下划线、点、短横线或中文，避免 `{\"foo\":\"bar\"}` 被误识别。
- 边颜色应抽到共享 `edge-colors.js`，由 edge-display 与变量绑定构造共同使用，避免颜色算法重复漂移。
- 最终可直接从 `edge-display.js` 导出 `getEdgeColor(edge,index)`；floatingEdges 与 bindings 使用相同 edges 顺序，旧边无需迁移即可颜色一致。
- 节点内接入字段：TextToImage(prompt/fileName)、EditImage(prompt/fileName)、TextToVoice(prompt/voiceId)、VideoGenerator(prompt)；WorkflowRunner JSON 保持 Monaco/textarea。
- `ensureEdgeIds` 在画布加载与 RPC 合并时执行，但颜色不必写盘；按当前 edges 顺序的共享函数足以保证同一渲染周期内边与 token 一致。
- 图生图编辑器继续保存 HTML 模板，执行时使用已解析的 `params.prompt` 再 `promptToText`；其他生成节点使用 PromptTextEditor `valueFormat='text'`。
- TextVariableEditor 在模板含变量时固定显示原模板；无变量时仍显示现有整字段连线派生值，兼容旧行为。
- Web 全量 TSC 当前有多项既有 API 类型错误；PromptTextEditor 另有 4 项 Mention v3 类型签名错误（renderLabel 参数、attrs 自定义字段），需在本次触及文件内修正。
