# 给【文件】→【导出】加二级子菜单：【导出JSON】+【导出素材库】

## 目标
Toolbar【文件】菜单的【导出】改为展开子菜单，含两项：
- **导出 JSON**：现有画布导出（保持原行为）
- **导出素材库**：把当前工作区素材库的分类转成文件夹，fetch 每张图打包成 zip 下载

## 改动文件（3 个，全在 mini-app src 内，刷新即生效，无需重启 web）

### 1. `utils/export.js` — 新增打包工具函数
新增 `sanitizeFolderName(name)`：把 `/ : * ? " < > | \` 及控制字符替换为 `_`，trim，空则回退 `'未分类'`。
新增 `exportAssetLibraryZip(categories, { workspaceName })`：
- 调 `getJSZip()`（复用 `spine/runtime.js`，已用 `(0,eval)` 加载 `vendor/spine/jszip-3.10.1.min.js` 到 `window.JSZip`）
- 遍历 categories → `sanitizeFolderName(cat.name)` 作文件夹 → 遍历 `cat.assets`：
  - `fetch(asset.url)` → `blob` → `zip.folder(folderName).file(asset.name, blob)`
  - 同名文件加 `_2/_3` 后缀去重
  - 单张 fetch 失败跳过（不中断整批）
- `zip.generateAsync({type:'blob'})` → Blob + `<a download>` 下载（复用 downloadJson 的下载模式）
- 文件名：`素材库-{workspaceName或game-asset-canvas}-{YYYYMMDD-HHmm}.zip`
- 返回统计 `{total, ok, failed}` 供调用方提示
- 空库（无分类或所有分类无素材）抛 Error，由调用方 alert

### 2. `components/Toolbar.jsx` — 改子菜单 + loading 状态
- import 加 `MenubarSub, MenubarSubTrigger, MenubarSubContent`（已 import）
- props 加 `onExportAssetLibrary`（async 函数）
- 内部加 `const [exporting, setExporting] = useState(false)`
- 把 `<MenubarItem onClick={onExport}>导出</MenubarItem>` 替换为：
  ```
  <MenubarSub>
    <MenubarSubTrigger>导出…</MenubarSubTrigger>
    <MenubarSubContent>
      <MenubarItem onClick={onExport}>导出 JSON</MenubarItem>
      <MenubarItem disabled={exporting} onClick={handleExportAssetLibrary}>
        {exporting ? '导出素材库中…' : '导出素材库'}
      </MenubarItem>
    </MenubarSubContent>
  </MenubarSub>
  ```
- 加 `handleExportAssetLibrary`：setExporting(true) → try await onExportAssetLibrary() → catch alert(e.message) → finally setExporting(false)

### 3. `components/Canvas.jsx` — 传新 callback
- 在 line 343 附近 `useAssetLibrary(activeId)` 解构出已有，但导出时直接调 service 拿最新数据更稳：
  ```
  const handleExportAssetLibrary = useCallback(async () => {
    const lib = await window.AgentSpaces?.invokeService?.('list_assets', { workspaceId: activeId });
    const categories = lib?.categories || [];
    return exportAssetLibraryZip(categories, { workspaceName: activeWorkspace?.name });
  }, [activeId, activeWorkspace]);
  ```
- Toolbar 传 `onExportAssetLibrary={handleExportAssetLibrary}`

## 用户决策（已确认）
- 空库 → alert 提示，不下载
- 非法文件夹名字符 → 替换为 `_`
- 范围 → 仅当前工作区
- 需要 loading 状态 → Toolbar 内部 state 控制

## 不改动
- 不新增依赖（复用 `vendor/spine/jszip-3.10.1.min.js`）
- 不改宿主层（react-renderer/ui-exports）→ 无需重启 web
- 不改素材库数据结构

## 验收步骤
1. 刷新 mini-app
2. 【文件】→【导出】应展开二级菜单，见【导出 JSON】【导出素材库】
3. 点【导出 JSON】→ 行为与原来一致（下载 game-asset-canvas.json）
4. 当前工作区素材库有素材时，点【导出素材库】→ 按钮变「导出素材库中…」→ 浏览器下载 zip → 解压后结构为「分类名/原图文件名」
5. 素材库为空时点【导出素材库】→ 弹「素材库为空」提示，不下载
6. 分类名含 `/` 等字符 → 对应文件夹名用 `_` 替换

## 后续优化
- 全工作区批量导出（当前仅单工作区）
- 导出进度条（当前只有 loading 文案）
- zip 内附带 manifest.json（记录分类/原始 url/上传时间）