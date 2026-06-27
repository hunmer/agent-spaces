# eagle

> Eagle 资源库预览/管理 Mini-app。

## Project Overview

通过 `workflow.eagle` 插件（Eagle Web API v2）预览和管理本地 Eagle 资源库：

- 左侧多层级文件夹树（新建、重命名、逐层浏览）
- 顶部面包屑导航 + 祖先链回溯
- 右侧素材瀑布流（宿主 `Masonry` 组件，按宽高比自适应、懒加载）
- 上传素材（本地文件转 base64 / 图片 URL），删除素材（软删，移入 Eagle 回收站）

> 注：`workflow.eagle` 当前没有「删除文件夹」的 action，故文件夹仅支持新建/重命名。

## File Structure

- `index.jsx` — 入口；布局、文件夹/素材数据加载、面包屑、错误态
- `hooks/useEagle.js` — Eagle 插件调用封装；统一解包 `{ success, result }` → `result`
- `components/FolderTree.jsx` — 文件夹树侧边栏；基于宿主 `NestedTree` 公共组件渲染多级树，行内新建/重命名
- `components/ItemGallery.jsx` — 素材瀑布流 + 上传弹层 + 删除

## Key Design Decisions

- 所有插件调用走 `window.AgentSpaces.callPluginTool("workflow.eagle", toolName, args)`。
- execute 路由固定返回 `{ success: true, result }`，`result` 内是 action run 的返回值 `{ success, message, data }`。`useEagle` 已统一解包到 `result`，业务代码直接读 `result.data`。
- `useEagle.call()` 强制注入 `timeout: 60000`（number）覆盖插件配置里被序列化成字符串的 timeout，避免 `fetchJson/postJson` 类型报错。插件侧 `shared.js` 也已做 `Number(args.timeout)` 兜底（需服务进程重启生效）。
- 文件夹树用宿主 `NestedTree`（`window.AgentSpacesUI.NestedTree`，源码 `components/nested-tree.tsx`）。Eagle 返回扁平数组，`FolderTree` 先按 `parent` 组装成树再喂给 NestedTree。
- 删除素材用 `eagle_item_update({ isDeleted: true })`（Eagle 软删除，可从回收站恢复）。
- 上传本地文件用 `FileReader` 转 base64，再走 `eagle_item_add` 的 `base64` 字段。
- 瀑布流用宿主 `Masonry`，`getMeta` 按素材 `width/height` 推导 `aspect`，无尺寸信息时回退 `1:1`。
- 本地图片访问：Eagle 缩略图/原图位于资源库目录下（`{libraryPath}/images/{itemId}.info/{name}[_thumbnail].{ext}`），浏览器无法读 `file://`。启动时调 `eagle_library_info` 拿 `libraryPath`，再用 `window.AgentSpaces.localFileUrl(absPath)` 把绝对路径转成经服务端 `GET /api/mini-apps/:id/local-file` 代理的 HTTP URL，直接用于 `<img src>`。缩略图加载失败时 `onError` 回退到原图。
- 点击缩略图预览：用宿主 `openMediaGallery(items, startIndex)`（来自 `window.AgentSpacesUI`）打开全量图集，自动定位到点击项；视频素材按 video 类型传入。

## Dependencies

- 启用插件：`workflow.eagle`（需在 `manifest.enabledPlugins` 声明）。
- 运行时要求：Eagle 4.0 Build 21+，且 Eagle 应用处于运行状态（API 随应用启动）。
- 宿主组件来自 `window.AgentSpacesUI`（`Masonry`、`Breadcrumb`、`ScrollArea`、`Card`、`Button`、`Input` 等）；lucide 图标同样从该全局对象解构。

## Notes

- `useEagle` 通过 `window.__eagleApi` 暴露给子组件，避免逐层透传 props。
- Eagle item 缩略图优先用 `thumbnail` 字段，缺失时回退 `fileSource`。
- 文件夹重命名/新建后调用 `onRefresh()` 重新拉取文件夹列表以同步树结构。
