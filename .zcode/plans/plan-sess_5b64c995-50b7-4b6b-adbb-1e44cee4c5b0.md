# Excalidraw Miniapp 实施计划

## 目标
在 Workflow UI 里制作一个 Excalidraw miniapp，把 Browser 版本（`@excalidraw/excalidraw@0.18.0`）的完整 prod 产物本地化到 miniapp 目录，通过独立沙箱 iframe 加载运行。

## 方案选型（已与用户确认）
- **范围**：最小可跑 —— 复用现有 `html` 类型 + 给 HTML 渲染器打 iframe 补丁（不新增 `'iframe-sandbox'` 类型，不改 SDK 类型契约、不动 16 处 UI 归一化点）。
- **字体**：不含 Xiaolai 中文字体（省 12.1MB），仅下载英文/拉丁字体集。

## 技术原理
Excalidraw prod 是 ESM 多 chunk + react/jotai/roughjs 全 external。当前 HTML 渲染器用 `new Function` 执行脚本，不支持 `<script type="module">` 和 `<script type="importmap">`。补丁思路：检测到这两种标签时改用 `<iframe srcdoc sandbox="allow-scripts">` 加载，让浏览器原生解析 import map + ESM。

## 实施步骤

### Step 1: 服务端新增 src 静态资源路由
**文件**：`packages/server/src/routes/mini-apps.ts`

在 `GET /:id/data/file` 路由旁新增 `GET /:id/src/file?path=xxx`：
- 复用 `svc.safeSrcPath`（通过 store 导出）做防穿越，锚定 `src/`
- 扩展 MIME 表 `LOCAL_FILE_MIME` 或新建 `SRC_FILE_MIME`，增加：
  - `.js → text/javascript; charset=utf-8`
  - `.mjs → text/javascript; charset=utf-8`
  - `.css → text/css; charset=utf-8`
  - `.woff2 → font/woff2`、`.woff → font/woff`、`.ttf → font/ttf`
  - `.html → text/html; charset=utf-8`（按需）
- 支持二进制流式返回（fonts/woff2）和文本返回（js/css）
- 需在 `mini-app-store.ts` 导出 `safeSrcPath`（当前是内部函数，检查是否已导出；若未导出则新增 export）

### Step 2: HTML 渲染器补丁 —— 沙箱 iframe 分支
**文件**：`packages/web/src/components/mini-apps/mini-app-renderer.tsx`

修改 `renderHtml`：
```ts
const renderHtml = useCallback((html: string) => {
  if (!containerRef.current) return;
  const container = containerRef.current;
  clearReactRenderer();

  // 新增：检测 module script 或 importmap，走沙箱 iframe
  const needsSandbox = /<script[^>]*type=["'](module|importmap)["'][^>]*>/i.test(html);
  if (needsSandbox) {
    renderHtmlInSandboxIframe(container, html);  // 新函数
    onError(null);
    return;
  }

  // 旧路径不变：正则抽 script + innerHTML + new Function
  ...
}, [...]);
```

新增 `renderHtmlInSandboxIframe(container, html)`：
- 创建 `<iframe>`，设 `sandbox="allow-scripts allow-same-origin"`（allow-same-origin 让 fetch 本地资源路由带 cookie/token；allow-scripts 执行脚本）
- 用 `srcdoc` 写入完整 HTML（浏览器原生解析 import map、module script、link）
- iframe 样式 `width:100%;height:100%;border:0`
- 旧 iframe 在重新渲染前移除
- 注入 base URL 处理：HTML 里的相对路径（`./excalidraw/...`）需要转成绝对服务端 URL，因为 srcdoc 的 baseURL 是 `about:srcdoc`。在 HTML 头部注入 `<base href="${window.location.origin}/">`，或在 srcdoc 里把相对路径预替换。采用注入 `<base>` 更简单。

### Step 3: 创建 Excalidraw miniapp 项目
**目录**：`packages/server/agent-spaces-data/mini-apps/excalidraw/`（数据目录，与其它 17 个示例同级）

> 注：实际运行时项目位于 `~/.agent-spaces-data/mini-apps/excalidraw/`；但仓库里的 `packages/server/agent-spaces-data/mini-apps/` 是种子目录（启动时复制到 dataDir，参考其它示例的存放方式）。需先确认种子目录的同步机制（参考 `ui-demo` 的存放与加载）。

#### 文件结构
```
excalidraw/
  manifest.json
  src/
    index.html                    # 沙箱入口
    excalidraw/                   # 本地化产物
      index.js                    # ESM 主入口（≈490KB）
      index.css                   # 样式（≈141KB）
      chunk-FX7ZIABN.js           # 主 chunk（≈429KB）
      chunk-6U3AYISY.js
      chunk-SQ5PDB2P.js
      chunk-SRAX5OIU.js
      chunk-Z3N5DIM6.js
      fonts/                      # 8 套英文字体（不含 Xiaolai CJK）
        Virgil/
        Cascadia/
        Excalifont/
        Nunito/
        Lilita/
        Liberation/
        Assistant/
        ComicShanns/
```

#### manifest.json
```json
{
  "id": "excalidraw",
  "name": "Excalidraw",
  "description": "手绘风格白板（本地化 Browser 版本）",
  "version": "1.0.0",
  "type": "html",
  "mainFile": "index.html",
  "tags": ["draw", "whiteboard"],
  "createdAt": "2026-07-16T00:00:00.000Z",
  "updatedAt": "2026-07-16T00:00:00.000Z"
}
```

#### src/index.html（沙箱模板核心）
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Excalidraw</title>
  <!-- 本地化字体与资源前缀：运行时由渲染器替换占位符 -->
  <script>
    // EXCALIDRAW_ASSET_PATH 指向本地服务端 src 静态路由
    window.EXCALIDRAW_ASSET_PATH = "__EXCALIDRAW_ASSET_PATH__";
  </script>
  <link rel="stylesheet" href="./excalidraw/index.css" />
  <script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@19.2.4",
      "react/jsx-runtime": "https://esm.sh/react@19.2.4/jsx-runtime",
      "react-dom": "https://esm.sh/react-dom@19.2.4",
      "react-dom/client": "https://esm.sh/react-dom@19.2.4/client"
    }
  }
  </script>
  <style>
    html, body { margin: 0; height: 100%; }
    #app { height: 100%; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module">
    import { Excalidraw } from "./excalidraw/index.js";
    import React from "react";
    import ReactDOM from "react-dom/client";
    const root = ReactDOM.createRoot(document.getElementById("app"));
    root.render(React.createElement(Excalidraw));
  </script>
</body>
</html>
```

`__EXCALIDRAW_ASSET_PATH__` 占位符由渲染器在加载时替换为 `{origin}/api/mini-apps/{projectId}/src/file?path=excalidraw/`。

### Step 4: 下载 Excalidraw 完整 prod 产物
通过 curl 从 jsDelivr/unpkg 下载（esm.sh 会重打包，**必须用 jsDelivr 或 unpkg 拿原始 npm 产物**）：

```bash
BASE="https://cdn.jsdelivr.net/npm/@excalidraw/excalidraw@0.18.0/dist/prod"
DEST="packages/server/agent-spaces-data/mini-apps/excalidraw/src/excalidraw"

# 核心 JS
curl -fLo "$DEST/index.js"           "$BASE/index.js"
curl -fLo "$DEST/chunk-FX7ZIABN.js"  "$BASE/chunk-FX7ZIABN.js"
curl -fLo "$DEST/chunk-6U3AYISY.js"  "$BASE/chunk-6U3AYISY.js"
curl -fLo "$DEST/chunk-SQ5PDB2P.js"  "$BASE/chunk-SQ5PDB2P.js"
curl -fLo "$DEST/chunk-SRAX5OIU.js"  "$BASE/chunk-SRAX5OIU.js"
curl -fLo "$DEST/chunk-Z3N5DIM6.js"  "$BASE/chunk-Z3N5DIM6.js"

# CSS
curl -fLo "$DEST/index.css"          "$BASE/index.css"

# 字体（8 套英文/拉丁，不含 Xiaolai）
for font in Virgil Cascadia Excalifont Nunito Lilita Liberation Assistant ComicShanns; do
  # 列出并下载每个字体族下所有 .woff2
done
```

体积：核心 JS+CSS ≈ 1.1MB，字体 ≈ 430KB，合计约 1.5MB。

### Step 5: 更新 src/CLAUDE.md
在 miniapp 项目内创建 `src/CLAUDE.md`，记录：
- 架构：html 类型 + 沙箱 iframe 补丁
- Excalidraw 产物本地化策略、版本、更新方式
- import map 依赖说明（react 走 esm.sh，chunk 自解析）
- 字体路径策略（不含 CJK，需要中文时如何补充）

## 关键风险与对策

| 风险 | 对策 |
|---|---|
| Excalidraw chunk 内还有未知的裸 import（如 jotai、roughjs）| Step 4 下载后用 grep 扫描 index.js + 所有 chunk 的 `from"xxx"` 裸导入，补全 import map |
| `srcdoc` iframe 里相对路径解析失败（baseURL=about:srcdoc）| 渲染器注入 `<base href="${origin}/api/mini-apps/${projectId}/src/file?path=/">` 或把所有 `./excalidraw/` 预替换为绝对 URL |
| 双 React 实例导致 hooks 报错 | import map 强制所有 react import 指向同一个 esm.sh URL |
| 服务端 `safeSrcPath` 未导出 | 实施时先检查 store 导出，未导出则加 export |
| 种子目录同步机制 | 先读 `ui-demo` 如何从仓库种子同步到 dataDir，按同样机制放置 |
| 字体仍可能从 esm.sh 兜底加载（EXCALIDRAW_ASSET_PATH 未覆盖某些路径）| 设置 ASSET_PATH 后用浏览器 Network 面板验证；可接受字体兜底走 CDN |

## 改动文件清单
1. `packages/server/src/routes/mini-apps.ts` — 新增 `GET /:id/src/file` 路由 + MIME 表
2. `packages/server/src/storage/mini-app-store.ts` — 导出 `safeSrcPath`（若未导出）
3. `packages/web/src/components/mini-apps/mini-app-renderer.tsx` — `renderHtml` 加沙箱 iframe 分支 + 新增 `renderHtmlInSandboxIframe`
4. `packages/server/agent-spaces-data/mini-apps/excalidraw/manifest.json` — 新建
5. `packages/server/agent-spaces-data/mini-apps/excalidraw/src/index.html` — 新建
6. `packages/server/agent-spaces-data/mini-apps/excalidraw/src/excalidraw/*` — 下载产物
7. `packages/server/agent-spaces-data/mini-apps/excalidraw/src/CLAUDE.md` — 新建

## 验收步骤指南
1. 启动服务后，在 miniapp 列表找到 "Excalidraw" 项目，打开编辑器
2. 预览区应加载出 Excalidraw 白板界面（顶部工具栏 + 空白画布）
3. 在画布上用鼠标拖拽绘制矩形/箭头/手写线条，确认渲染正常
4. 切换深色/浅色主题，Excalidraw 跟随主题
5. 打开浏览器 DevTools Network 面板，确认 `index.js`/chunks/`index.css`/fonts 都从本地 `/api/mini-apps/excalidraw/src/file?path=...` 加载（而非 esm.sh），仅 react/react-dom 从 esm.sh
6. 控制台无 "Invalid hook call" / "_dual React_ 之类的报错