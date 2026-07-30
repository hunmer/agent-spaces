# Mini App 工作流插件配置 Handoff

## 目标

为 Mini App 建立工作流选择、配置持久化和执行注入闭环：

- Mini App 通过 Host API 打开工作流列表并取得完整工作流对象。
- 选中工作流后，在对应 Mini App 的 `data` 目录创建工作流配置 JSON。
- Mini App 预览界面可查看已配置工作流，并为工作流启用的插件设置单独配置。
- Mini App 执行工作流时自动读取专属配置并传入工作流执行入口。
- 工作流执行入口接受插件名或插件 ID 为键、配置方案名或配置对象为值的参数。
- Mini App 源码不再直接渲染宿主的 `WorkflowListDialog`。

## 架构结论

- 多配置方案属于插件基础能力，不应由 Workflow 单独维护。
- 插件层负责命名配置方案 CRUD。
- Workflow 和 Mini App 只保存各自对插件配置方案的选择或独立覆盖对象。
- 工作流本次执行参数统一使用：

```ts
Record<string, string | Record<string, unknown>>
```

- 键支持插件 ID、中文名或英文名。
- 字符串值表示插件命名配置方案；对象值表示本次执行使用的完整配置覆盖。
- 最终优先级：调用方显式参数 > Mini App 工作流配置 > Workflow 配置方案 > 插件默认配置。

## Mini App 配置文件约定

配置文件位于 Mini App 项目的 `data` 目录：

```text
data/workflow-configs/index.json
data/workflow-configs/{workflowId}.json
```

单个工作流配置示例：

```json
{
  "workflowId": "workflow-id",
  "workflowName": "工作流名称",
  "pluginConfigs": {
    "workflow.ai-image": "生产环境",
    "workflow.openai": {
      "apiKey": "...",
      "baseUrl": "..."
    }
  }
}
```

实现集中在：

- `packages/web/src/lib/mini-app-workflow-config.ts`
- `packages/sdk/src/modules/mini-apps.ts`
- `packages/server/src/routes/mini-apps.ts`

新增 SDK 接口：

```ts
sdk.miniApp.readDataFile(projectId, filePath)
```

服务端读取继续使用 `safeProjectSubdirPath(projectId, 'data', filePath)`，路径不能越过 Mini App 的 `data` 目录。

## Host API 与执行注入

主要文件：

- `packages/web/src/components/mini-apps/use-mini-app-host-api.tsx`

新增 Mini App API：

```js
const workflow = await window.AgentSpaces.openWorkflowListDialog();
```

行为：

1. 使用 `sdk.workflow.list()` 获取完整 `WorkflowTemplate[]`。
2. 用户选择后调用 `ensureMiniAppWorkflowConfig()` 创建或更新配置文件。
3. 返回完整工作流；取消、重复打开导致前一个请求失效、组件卸载时返回 `null`。
4. Mini App 调用 `@agent-spaces/builtin / execute_workflow_sync` 时，Host API 根据 `workflow_id` 或 `workflowId` 读取配置。
5. 保存配置与调用方传入的 `plugin_configs` 或 `pluginConfigs` 合并，调用方显式值优先。

## 配置界面

相关文件：

- `packages/web/src/components/mini-apps/mini-app-preview.tsx`
- `packages/web/src/components/mini-apps/mini-app-workflow-config-dialog.tsx`
- `packages/web/src/components/workflow/workflow-list-dialog.tsx`
- `packages/web/src/components/plugins/plugin-config-dialog.tsx`
- `packages/web/src/components/plugins/plugin-config-scheme-control.tsx`
- `packages/web/src/locales/zh/mini-apps.json`
- `packages/web/src/locales/en/mini-apps.json`

行为：

- Mini App 预览工具栏增加工作流图标。
- 点击后列出 `workflow-configs/index.json` 中已经建立配置的工作流。
- `WorkflowListDialog` 新增 `selectionDisabled` 与 `onConfigure`。
- 禁用选择模式下，行点击、键盘选择和复选框选择全部禁用，但配置按钮仍可用。
- 配置弹窗只展示工作流 `enabledPlugins` 中的插件。
- 可选择插件命名方案；不设置覆盖时显示“使用工作流配置”。
- 点击插件配置图标可保存 Mini App + Workflow 专属的独立配置对象。

## 已迁移 Mini App

以下 Mini App 已改为调用 `window.AgentSpaces.openWorkflowListDialog()`，不再直接获取和渲染 `WorkflowListDialog`：

- `cover-generator/src/index.jsx`
- `fitting-room/src/components/GalleryPage.jsx`
- `galgenai/src/components/SettingsPanel.jsx`
- `game-asset-canvas/src/components/SettingsDialog.jsx`
- `game-asset-canvas/src/components/nodes/WorkflowRunnerNode.jsx`
- `stickerGenerator/src/components/SettingsDialog.jsx`
- `国之脊梁音乐生成/src/index.jsx`
- `文案转分镜/src/components/Dialogs.jsx`

迁移保留了原有业务行为：

- `WorkflowRunnerNode` 仍会从 start 节点 `inputFields` 生成 JSON 输入模板。
- `fitting-room/GalleryPage` 选中工作流后仍调用 `save_shared_config`。
- 其余 Mini App 仍按各自原有方式保存工作流 ID 和名称。

残留检查命令：

```bash
rg -n "<WorkflowListDialog|WorkflowListDialog\\s*[,}]" \
  "packages/server/agent-spaces-data/mini-apps" -g '*.jsx' -g '*.js'
```

当前结果为空。

## 工作流执行入口

工作流执行核心已经支持 `pluginConfigs`，并覆盖以下入口：

- REST
- WebSocket
- Webhook
- SDK
- Agent 工具
- Mini App builtin 工具
- 子工作流执行

兼容两种字段名：

```json
{
  "pluginConfigs": {
    "插件名": "配置方案名"
  }
}
```

```json
{
  "plugin_configs": {
    "插件名": {
      "key": "value"
    }
  }
}
```

## 验证结果

已通过：

```bash
pnpm --filter @agent-spaces/shared build
pnpm --filter @agent-spaces/sdk build
pnpm --filter @agent-spaces/server build
```

Web 本次文件针对性 ESLint 为 0 errors，仅存在文件原有 warnings。

8 个迁移后的 Mini App JSX 均通过 esbuild 语法编译。

以下检查通过：

```bash
git diff --check
```

中英文 Mini App locale JSON 均可正常解析。

Web 全量 `tsc --noEmit` 仍被仓库既有错误阻塞，错误集中在 dropzone、tiptap、图表和若干隐式 `any` 文件，本次修改文件没有出现在错误列表。

## 手工验收

现有 Web 开发服务：`http://localhost:3000`。

1. 打开任意已迁移 Mini App，触发选择工作流，确认宿主工作流列表打开并能返回工作流。
2. 检查对应 Mini App 的 `data/workflow-configs/{workflowId}.json` 已生成。
3. 点击 Mini App 预览工具栏的工作流图标。
4. 点击工作流行右侧配置图标，确认能看到该工作流启用的插件。
5. 为插件选择命名方案，重新打开确认选择已持久化。
6. 点击插件配置图标，保存独立配置对象，检查 JSON 内容。
7. 从 Mini App 执行工作流，确认插件使用该配置。
8. 调用时显式传入同一插件的 `plugin_configs`，确认显式配置覆盖 Mini App 保存值。

## 已知限制与后续建议

- 当前没有配置文件删除和失效工作流自动清理入口。
- 工作流或插件被删除后，`workflow-configs/index.json` 可能保留旧 ID。
- Host API 创建配置失败时会返回 `null` 并记录控制台错误，尚无用户可见错误提示。
- `PluginConfigDialog` 保存的表单字段沿用插件现有配置格式，主要为字符串；对象字段以 JSON 字符串输入并校验。
- 后续建议为配置文件读写和执行合并优先级补充自动化测试。

## 工作区注意事项

接手时不要回滚以下用户已有修改，它们不是本轮功能实现产生的配置变更：

- `packages/server/agent-spaces-data/mini-apps/game-asset-canvas/configs/panel-layout.json`
- `packages/server/agent-spaces-data/mini-apps/game-asset-canvas/manifest.json`
- `packages/server/agent-spaces-data/mini-apps/index.json`

项目根目录的 `task_plan.md`、`findings.md`、`progress.md` 记录了本次调查过程、架构结论和完整验证信息。
