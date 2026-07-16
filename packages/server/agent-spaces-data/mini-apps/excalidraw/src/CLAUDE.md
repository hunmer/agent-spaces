# Excalidraw Miniapp

## 架构

这是一个 **HTML 类型** 的 miniapp，但加载方式与普通 HTML 项目不同：它依赖一个**沙箱 iframe 分支**。

普通 HTML 项目由 `mini-app-renderer.tsx` 的 `renderHtml` 用 `innerHTML + new Function` 执行脚本，
不支持 `<script type="module">`、`<script type="importmap">`、`<link rel="stylesheet">` 原生加载。

Excalidraw 是 ESM 多 chunk + react/jotai/roughjs 全 external 的产物，必须用浏览器原生 ESM 加载，
所以渲染器在检测到 `index.html` 含 `type="module"` 或 `type="importmap"` 时，会改用
`<iframe srcdoc sandbox="allow-scripts allow-same-origin ...">` 加载，让浏览器原生解析 import map + ESM。

## 关键文件

- `index.html` —— 沙箱入口。含 import map（28 个裸依赖映射到 esm.sh）+ 本地资源相对引用。
- `excalidraw/` —— Excalidraw 0.18.0 完整 prod 产物（本地化）。
  - `index.js` —— ESM 主入口（≈490KB）。
  - `chunk-*.js` —— 5 个静态 chunk + 1 个动态 chunk（字体子集化引擎，1.74MB）。
  - `subset-shared.chunk.js` / `subset-worker.chunk.js` —— 字体子集化运行时。
  - `index.css` —— 样式（≈141KB）。
  - `fonts/` —— 8 套英文/拉丁字体（不含 Xiaolai 中文 CJK，省 12.1MB）。
  - `locales/en.js` + `locales/zh-CN.js` + `locales/percentages.js` —— 界面语言（非字体）。

## 资源加载机制

`index.html` 里所有相对路径（`./excalidraw/xxx`）在加载前由渲染器
`rewriteRelativePathsToSrcFile` 重写为绝对 URL：

```
./excalidraw/index.js
  → http://<host>/api/mini-apps/<projectId>/src/file/excalidraw/index.js
```

服务端有两个对等路由：
- `GET /api/mini-apps/:id/src/file?path=<relPath>`（query 形式，需 `?token=` 鉴权）
- `GET /api/mini-apps/:id/src/file/<relPath>`（path 段形式，直接放行）

**path 段形式是 Excalidraw 字体加载的关键**：Excalidraw 用
`new URL("./fonts/x.woff2", window.EXCALIDRAW_ASSET_PATH)` 拼接字体 URL，
`new URL` 会丢弃 base 中的 query string，所以 query 形式行不通。
`index.html` 里的 `__MINIAPP_SRC_FILE_BASE__` 占位符在加载时被替换为
`http://<host>/api/mini-apps/<projectId>/src/file/`（path 段 base，末尾带 `/`）。

## import map

Excalidraw prod 的 28 个裸依赖（react、react-dom、jotai、roughjs、@radix-ui/* 等）全部映射到 esm.sh。
非 react 包用 `?external=react,react-dom,react/jsx-runtime` 让它们复用同一个 React 实例，
避免 "Invalid hook call" / 双 React 报错。

react/react-dom 用 19.0.0（Excalidraw 官方 esm.sh 示例验证版本）。

## 更新 Excalidraw 版本

1. 改 `index.html` import map 里的版本号。
2. 重新下载 prod 产物到 `excalidraw/`：
   ```bash
   BASE="https://cdn.jsdelivr.net/npm/@excalidraw/excalidraw@<ver>/dist/prod"
   curl -fsSL "$BASE/index.js" -o excalidraw/index.js
   # ... 其余 chunk、css、字体
   ```
3. 重新扫描裸 import 补全 import map（见本仓库构建脚本/历史 commit）。

## 已知限制

- **中文手写文字渲染**：未含 Xiaolai CJK 字体（12.1MB），中文需走字体子集化引擎（subset-worker），
  会从 `EXCALIDRAW_ASSET_PATH` 兜底回 esm.sh 加载 CJK 子集（首次有网络延迟）。
  如需完全离线中文，把 `fonts/Xiaolai/*.woff2`（209 个子集，约 12.1MB）下载到 `excalidraw/fonts/Xiaolai/`。
- **首次加载**：28 个裸依赖的 esm.sh 请求有网络开销，冷启动较慢。
- **沙箱权限**：iframe sandbox 开启了 `allow-same-origin`（为同源访问 src/file 路由）、
  `allow-scripts`、`allow-popups`、`allow-forms`、`allow-modals`、`allow-downloads`。
