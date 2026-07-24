## 目标
在 game-asset-canvas 右侧面板新增【素材库】tab（第 4 个），与当前工作区绑定；支持创建/重命名/删除分类，每个分类可上传图片（FileUpload 组件），且整个分类卡片是一个 Dropzone 拖拽接收区，拖文件到卡片任意位置即上传到该分类。

## 架构决策（基于你的选择 + handoff 约定）
- **Dropzone = 纯 UI 拖拽层**：`onFiles(files: File[])` 回调，上传逻辑由调用方实现。最通用。
- **Dropzone 包裹整个分类卡片**：拖到卡片任意位置都上传到该分类；卡片内的 FileUpload 作为「点击/拖拽上传 + 文件列表」入口，两者走同一上传逻辑，互不冲突（各自 dropzone 独立绑定）。
- **工作区隔离**：复用成熟的 `configs/workspaces/<id>/` 隔离模式 + service 单写者 + hook 三重读取（getConfig + onConfigReady + onAnyConfigChanged）。
- **上传能力**：复用 `window.AgentSpaces.uploadFile(file)`（返回 `{url, httpPath}`），handoff 约定 #7 已验证可用。

## 改动清单

### A. 宿主层（需重启 web 服务）
1. **新建 `packages/web/src/components/ui/dropzone.tsx`**
   - 基于 `react-dropzone`（FileUpload 已在用，依赖已存在）
   - Props：`onFiles: (files: File[]) => void`、`accept?`、`maxSize?`、`disabled?`、`className?`、`children?`、`placeholder?`
   - 行为：拖入高亮、点击不触发文件选择（noClick，由调用方决定；素材库场景 FileUpload 负责点击选择，Dropzone 只负责拖拽接收，避免嵌套点击冲突）
   - 默认渲染虚线边框占位，children 存在时作为 overlay 包裹（拖拽高亮态边框变化）

2. **`packages/web/src/lib/ui-exports.ts`** 末尾导出
   ```ts
   export { Dropzone } from '@/components/ui/dropzone';
   export type { DropzoneProps } from '@/components/ui/dropzone';
   ```
   （react-renderer 的 `@agent-spaces/ui` allowlist 是 `{__esModule:true, ...AgentSpacesUI}` 展开，自动包含新导出，**无需改 react-renderer.tsx**）

### B. mini-app 层（刷新即生效，service 热重载）
3. **`src/utils/constants.js`** 新增
   ```js
   export const ASSET_LIBRARY_CONFIG = 'asset-library.json';
   ```

4. **`src/utils/storage.js`** 新增路径助手 + config 订阅
   ```js
   export function assetLibraryConfigPath(workspaceId) {
     return workspaceId ? `workspaces/${workspaceId}/${ASSET_LIBRARY_CONFIG}` : ASSET_LIBRARY_CONFIG;
   }
   ```

5. **`src/services/canvas.js`** 新增 6 个 handler（热重载，无需重启）
   - `list_assets({workspaceId})` → `{ categories: [] }`（兜底空数组）
   - `create_category({workspaceId, name})` → 追加 `{id, name, createdAt, assets:[]}`
   - `rename_category({workspaceId, id, name})`
   - `delete_category({workspaceId, id})`
   - `add_asset({workspaceId, categoryId, asset})` → asset 含 `{id, url, name, size, uploadedAt}`，追加到对应 category.assets
   - `remove_asset({workspaceId, categoryId, assetId})`
   - 全部用 `ctx.updateConfig(wsPath(workspaceId, ASSET_LIBRARY_CONFIG), ...)` 原子更新
   - 数据结构：
     ```json
     { "categories": [ { "id": "cat-xxx", "name": "角色", "createdAt": 123, "assets": [ {"id":"ast-xxx","url":"http://...","name":"hero.png","uploadedAt":123} ] } ] }
     ```
   - `delete_workspace` 顺手清空该工作区的 asset-library.json（与 canvas/history 一致）

6. **`src/hooks/useAssetLibrary.js`**（新建，复用 useGenerationHistory 三重读取模式）
   - `useAssetLibrary(workspaceId)` → `{ categories, createCategory, renameCategory, deleteCategory, addAsset, removeAsset }`
   - addAsset 内部对每个 File 调 `window.AgentSpaces.uploadFile(file)` 拿 url，再调 service；返回 Promise 供 UI 显示上传中态

7. **`src/components/AssetLibrary.jsx`**（新建）
   - 顶部「＋ 新建分类」按钮（inline input，回车确认）
   - 分类卡片列表：每个卡片用 `<Dropzone onFiles={handleDropFiles(cat.id)}>` 包裹
     - 卡片头：分类名（双击 inline 重命名）+ ✕ 删除分类（确认）
     - 卡片内：`<FileUpload>`（点击/拖拽上传，maxFiles=0 不限，accept image/*）+ 已上传图片网格
     - 图片网格：缩略图 `aspect-square`，点击 `openMediaGallery`，hover ✕ 删除单图
     - 上传中态：FileUpload 自带进度；分类卡片右上角可加 spinner
   - 空状态：无分类时提示「点击上方新建分类」

8. **`src/components/RightPanel.jsx`** 改动
   - `grid-cols-3` → `grid-cols-4`，新增 `<TabsTrigger value="assets">素材库</TabsTrigger>`
   - 新增 `<TabsContent value="assets">` 渲染 `<AssetLibrary workspaceId={workspaceId} />`
   - RightPanel props 增加 `workspaceId`（Canvas 传入，已有 activeId）

9. **`src/components/Canvas.jsx`** 改动（1 行）
   - `<RightPanel>` 调用处加 `workspaceId={activeId}`

## 上传流程（时序）
1. 用户拖文件到分类卡片 → Dropzone `onFiles(files)` 
2. → 对每个 file 调 `uploadFile(file)` 拿 `{url}`
3. → 调 `addAsset({workspaceId, categoryId, asset:{url, name:file.name, ...}})`
4. → service 写 asset-library.json → 广播 configChanged → hook onAnyConfigChanged 回灌 → UI 自动刷新
5. FileUpload 路径同理（onChange 监听上传完成拿 url → addAsset）

## 不改动 / 复用
- 不改 react-renderer.tsx allowlist（`@agent-spaces/ui` 展开式自动含新导出）
- 不改 host API（uploadFile 已存在）
- 复用 FileUpload / openMediaGallery / 三重读取模式 / wsPath 隔离

## 验收步骤
1. 重启 web 服务（宿主层 dropzone.tsx + ui-exports 生效）
2. 打开 game-asset-canvas，右侧应见 4 个 tab，点【素材库】
3. 点「新建分类」→ 输入名 → 回车，分类卡片出现
4. 拖一张图片到分类卡片任意位置 → 上传完成 → 缩略图出现
5. 点 FileUpload 区域选图 → 同样上传成功
6. 切换工作区 → 素材库内容跟随切换（隔离生效）
7. 点缩略图 → openMediaGallery 大图；hover ✕ 删除单图
8. 双击分类名重命名；✕ 删除分类

## 风险 / 注意
- 嵌套 dropzone：外层 Dropzone（noClick）+ 内层 FileUpload（自带点击+拖拽）。拖到 FileUpload 区域时 FileUpload 优先处理（内层 stopPropagation），拖到其他区域外层处理。两者都走同一 addAsset，不冲突。
- uploadFile 串行（多文件时逐个上传），性能足够；后续可并发优化（handoff 已列）。
- 图片 URL 持久化：uploadFile 返回 http URL，存 asset.url，刷新不失效（符合约定 #7）。

## 后续优化（本次不做）
- 分类排序/拖拽移动图片到其他分类
- 素材库图片直接拖到画布生成节点（跨容器拖拽，复杂度高）
- 并发上传 / 缩略图生成（generateThumbnail 已有 host 能力）
