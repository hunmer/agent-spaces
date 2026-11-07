# Flow Spaces 冒烟证据（2026-11-08 00:15:38）

## 1. server 直连 (127.0.0.1:3110)
- /api/auth/check → `{"authenticated":true,"secretSet":false}`（免鉴权模式生效）
- /api/workflows → 200
- /api/mini-apps  → 200
- workflows 响应体: []

## 2. web dev (127.0.0.1:5173) 5 条路由
- /workflows → 200
- /workflows/share → 200
- /mini-apps → 200
- /mini-apps-preview → 200
- /login → 200

## 3. SDK 经 vite proxy → server 链路
- 5173/api/auth/check → {"authenticated":true,"secretSet":false}
- 5173/api/workflows → 200，响应体: []
- 5173/api/mini-apps → 200，响应体: []

## 4. 浏览器真实渲染验证（Chromium，2026-11-08 00:16，截图同目录 route-*.png）

| 路由 | 渲染结果（DOM 探测） | 截图 |
|---|---|---|
| /workflows | ✅ 标题 Flow Spaces；正文「工作流/管理 Workflow 模板/暂无工作流模板/创建第一个工作流」，8 按钮 | route-workflows.png |
| /workflows/share | ✅ 页面逻辑执行，无参时业务提示「缺少 workflow_id 参数」（未改动的原业务行为） | route-workflows-share.png |
| /mini-apps | ✅ 「创建并管理你的 Mini App…/暂无自定义页面/创建第一个页面」，11 按钮 | route-mini-apps.png |
| /mini-apps-preview | ✅ 组件挂载并以空 id 调 `/api/mini-apps//files` → 页面内展示 404（原业务行为，DB 为空无实例可预览） | route-mini-apps-preview.png |
| /login | ✅ 占位页「此环境为免鉴权模式，无需登录」 | route-login.png |

全部导航过程 console 无 error/warn。
