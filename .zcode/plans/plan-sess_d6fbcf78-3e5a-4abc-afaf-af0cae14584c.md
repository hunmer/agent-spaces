# 新增「导出/导入工作区」

## 目标
在【文件】→【导出…】【导入…】子菜单各加一项「工作区」：
- **导出工作区**：把当前工作区 3 个 json（canvas/history/asset-library）+ 所有后端图片打 zip，json 内后端 url 全部相对化为指向 `static/` 的占位符，外链 https 忽略。
- **导入工作区**：选 zip → 把 `static/` 内文件重新上传后端拿 http url → 按映射回填所有 json 的占位符 → 全部回填完，新建工作区写入数据（ReactFlow 自动回流加载）。

## 用户决策（已确认）
- 导出范围：3 个核心 json（canvas/history/asset-library）
- 后端图片：全部后端路由（data/file + src/file + local-file）都下载，外链 https 忽略
- 导入：新建工作区（不覆盖当前）
- url 相对化：指向 zip 内 `static/`（去净 origin/token/path，用占位符协议）

## 相对化字符串协议（核心设计）
json 里的后端 url（`http://host/api/.../data/file?path=xxx&token=`）替换为占位符：
```
{{zip:static/<hash>.<ext>}}
```
- 双花括号 + `zip:` 前缀，**绝对不与真实 URL 冲突**（`normalizeImageUrl` 见到非 http/data/相对路径会原样返回，不会误补 origin）
- `<hash>` 用 url 派生的稳定 hash（sha1 截断 / 或 url 原始 path 末段），同 url 同名 → 多处引用共享同一文件，zip 不重复存
- 导入时正则 `/\{\{zip:([^}]+)\}\}/g` 找回占位符，查映射表换回新 http url

## 改动文件（4 个，全在 mini-app src，刷新即生效，无需重启 web）

### 1. `utils/export.js` — 新增工作区导出/导入工具函数
新增 `collectBackendUrls(value)`：递归遍历任意 json（对象/数组/字符串），收集所有匹配 `isBackendUrl` 的字符串 url（用 `BACKEND_IMAGE_PATH_RE` + 同源判定，排除 data:/blob:/外链）。返回去重 url 列表。

新增 `relativizeUrls(value, urlToPlaceholder)`：深度递归克隆 json，把命中的 url 字符串替换为占位符 `{{zip:...}}`。

新增 `exportWorkspaceZip({ canvasState, historyList, assetLib, workspaceName })`：
- 收集三个数据里所有后端 url（`collectBackendUrls` 三个数据合并去重）
- 逐个 `fetch(url)` → blob → 按 hash 命名存 `zip.static(hash.ext, blob)`；失败跳过
- 构造 `urlToPlaceholder` 映射（url → `{{zip:static/hash.ext}}`）
- `relativizeUrls` 处理三个数据，得到纯净 json（占位符替换）
- zip 内写：`canvas.json` / `generation-history.json` / `asset-library.json`（三个相对化后的 json）+ `static/` 目录（图片）
- `generateAsync` → downloadBlob，文件名 `工作区-<name>-<时间戳>.zip`
- 返回统计 `{ assets, jsons }`；带 `onProgress(done,total)`

新增 `pickWorkspaceZipFile()`：选 zip（复用 pickAssetLibraryZipFile 模式，accept .zip）

新增 `importWorkspaceZip(file, { onProgress })`：
- `JSZip.loadAsync` 解析
- 读 `canvas.json` / `generation-history.json` / `asset-library.json`（缺失则该项为 null）
- 正则扫三个 json 里所有 `{{zip:static/xxx}}` 占位符，去重
- 逐个从 zip 取 `static/xxx` blob → `new File` → `uploadFile` → 拿新 url，建 `placeholderToUrl` 映射；带 onProgress
- 反向替换：把占位符替换回新 http url（还原成完整 json）
- 返回 `{ canvasState, historyList, assetLib, stats }` 供 Canvas 写入

### 2. `components/Canvas.jsx` — 接入工作区导出/导入 handler
新增 `handleExportWorkspace(onProgress)`：
- 用 `getConfig` 同步读三个 path（canvasConfigPath/historyConfigPath/assetLibraryConfigPath，传 activeId）
- 调 `exportWorkspaceZip({ canvasState, historyList, assetLib, workspaceName })`
新增 `handleImportWorkspace(onProgress)`：
- `pickWorkspaceZipFile()` 选 zip（取消返回 null）
- `importWorkspaceZip` 还原数据
- `createWorkspace(activeWorkspace?.name + '-导入')` 拿新 workspaceId
- 写入：`saveCanvas(newId, canvasState)`（走 save_canvas 广播自动回流）；history 逐条 `invokeService('add_history', {workspaceId:newId, item})`；asset 用 `invokeService('save_asset_library', {workspaceId:newId, lib})` **新增一个整库写入 service**（见下，避免逐条 add 慢且 assetLib 结构是整库覆盖语义）
- `switchWorkspace(newId)` 切换到新工作区
- 返回 stats

### 3. `services/canvas.js` — 新增 `save_asset_library` service
asset-library.json 当前只能逐条 `add_asset`（会触发 N 次广播），导入整库低效。新增：
```js
save_asset_library: ({ workspaceId, lib }, ctx) => {
  const data = lib && Array.isArray(lib.categories) ? { categories: lib.categories } : { categories: [] };
  ctx.writeConfig(assetLibPath(workspaceId), data);
  return data;
},
```
供导入一次性写入整库（前端 useAssetLibrary 会经 onAnyConfigChanged 自动回流）。

### 4. `components/Toolbar.jsx` — 子菜单加「工作区」项 + toast 进度
【导出…】子菜单加 `<MenubarItem>导出工作区</MenubarItem>`；
【导入…】子菜单加 `<MenubarItem>导入工作区</MenubarItem>`；
复用现有 toast.loading/success/error + onProgress 模式；加 `workspaceBusy` state 防重入。
Canvas 传 `onExportWorkspace` / `onImportWorkspace`。

## 不改动
- 不改宿主层（react-renderer/ui-exports）→ 无需重启 web
- 不改素材库/历史数据结构
- 外链 https 图（如节点 params 里贴的外网图）不下载、不相对化（保持原样）

## 边界处理
- **占位符文件不存在于 zip**（导出时 fetch 失败跳过的）：导入时该占位符无映射 → 保留原占位符字符串（不崩，前端 img 加载失败显示破图，但不阻断导入）
- **三个 json 缺失某项**：导入时该项为 null，跳过写入（如 zip 只有 canvas.json）
- **data:/blob: url**：不下载、不相对化（内联数据，随 json 带走）
- **local-file 绝对路径**：导出时正常 fetch 下载（在导出机器能读到）；导入时重传拿新 url，不再指向原绝对路径（天然解决跨机器不可移植）

## 验收步骤
1. 刷新 mini-app（无需重启 web）
2. 当前工作区有节点产出图 + 素材库 + 生成记录 → 点【文件】→【导出…】→【导出工作区】→ toast 进度 → 下载 `工作区-<name>-<时间戳>.zip`
3. 解压 zip：见 `canvas.json` / `generation-history.json` / `asset-library.json` + `static/` 目录（图片）。打开 json，所有后端 url 已变成 `{{zip:static/xxx.png}}`，外链 url 保持原样
4. 切到一个空工作区 → 点【文件】→【导入…】→【导入工作区】→ 选刚才的 zip → toast 显示「上传图片 (5/20)」→ 完成后自动新建工作区并切换，画布/素材库/生成记录全部还原，图片正常显示
5. 跨机器测试：把 zip 拷到另一台机器导入，local-file 绝对路径的图也能正常显示（已重传为当前机器的 url）

## 后续优化
- zip 内加 `manifest.json`（记录工作区名/导出时间/统计）便于校验
- 导入前预览 zip 内容 + 选择性导入（只导画布/只导素材库）
- 大图并发上传（当前串行）
- 占位符替换失败时 toast 汇总「N 张图片缺失」