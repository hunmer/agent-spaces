# workflow-miniapp

## Project Overview

`workflow-miniapp` 是给工作流内置节点 `show_miniapp` 使用的演示工程。
它包含 3 个路由：`/welcome`、`/approval`、`/survey`。
每个路由都从 `query.payload` 读取 JSON 参数，并通过 `window.parent.postMessage()` 把提交结果回传给工作流宿主。

## File Structure

- `index.jsx` - 入口，挂载内置 `Router`
- `components/AppShell.jsx` - 顶层布局、路由切换、payload 预览
- `components/WelcomeRoute.jsx` - `/welcome` 示例，展示概览并提交开始结果
- `components/ApprovalRoute.jsx` - `/approval` 示例，提交审批结果
- `components/SurveyRoute.jsx` - `/survey` 示例，提交问卷结果
- `utils/payload.js` - 从路由 query 读取并解析 `payload`
- `utils/host.js` - 统一向父窗口发送提交消息

## Key Design Decisions

- 路由参数统一通过 `query.payload` 传输，避免每个路由维护不同 query 结构。
- 与工作流恢复执行的通信统一使用 `postMessage`，消息源为 `agent-spaces:workflow-miniapp-submit`。
- 不依赖项目服务或配置写入，保持这个 demo 最小且纯前端。

## Dependencies

- `@agent-spaces/ui` 的 `Router` 和 `useRouter`
- `window.AgentSpacesUI` 提供的宿主 UI 组件

## Notes

- 如果工作流节点调整了 `payload` 的结构，这里只需要同步更新各路由的读取字段。
- 如果宿主消息协议变更，优先修改 `utils/host.js`，不要在各路由里散落 `postMessage` 细节。
