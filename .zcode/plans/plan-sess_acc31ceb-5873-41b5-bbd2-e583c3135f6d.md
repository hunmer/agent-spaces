## 方案概述

给「新建工作区」对话框加可选的「数据保存目录」字段（用 FolderPicker），目录存到 workspace 对象上；节点产出图片后，除了原有的「存后端 data/ 保证画布展示」，再复制一份写到用户选的宿主机目录。**属宿主层改动，需重启 web 一次**（之后目录变更刷新即生效）。

## 改动清单（按依赖顺序）

### A. 服务端：新增「写文件到任意绝对路径」路由（宿主层）

**文件**：`packages/server/src/routes/mini-apps.ts`
- 新增 `POST /api/mini-apps/:id/data/write-absolute`
- 入参：`{ directory, filename, content, encoding }`（encoding='base64' 时 content 视为 base64）
- 实现：校验 directory 是绝对路径（正则 `^[A-Za-z]:[\\/]|^\/|^\\\\`，与现有 local-file 路由一致）→ `mkdirSync(directory, {recursive:true})` → `writeFileSync(join(directory, filename), buf)`
- 返回 `{ ok, path: <绝对路径> }`
- 复用现有 `Buffer.from(content, encoding)` 模式（参照 L176-184 的 data/content 路由）

### B. 宿主层：新增 `saveImageToDir` host 能力（宿主层）

**文件**：`packages/web/src/components/mini-apps/use-mini-app-host-api.tsx`
- 在 `downloadImage`（L540-554）附近新增 `saveImageToDir(url, directory, filename?)`：
  - fetch 图片 URL → blob → base64（复用 `blobToBase64`）
  - 调上面新增的 `/data/write-absolute` 路由
  - filename 兜底用 `inferDownloadFileName(url)`
  - 失败抛错（不阻塞主流程，由调用方 try/catch）
- 在 L972 和 L992 的 `window.AgentSpaces` / `window.AgentSpacesAPI` 对象字面量里加 `saveImageToDir,`

### C. mini-app：workspace 增加 directory 字段

**文件 1**：`src/services/canvas.js`
- `create_workspace`（L158-165）：入参加 `directory`，ws 对象加 `directory: directory || undefined`（留空则不存该键）
- 注释 L32 的结构说明同步更新

**文件 2**：`src/hooks/useWorkspaces.js`
- `createWorkspace(name)` → `createWorkspace(name, directory)`，透传给 `invokeService('create_workspace', { name, directory })`
- `FALLBACK` 默认工作区不加 directory（保持原行为）

### D. mini-app：CreateWorkspaceDialog 加 FolderPicker

**文件**：`src/components/CreateWorkspaceDialog.jsx`
- 顶部 import 加 `FolderPicker`（从 `@agent-spaces/ui`，已导出无需改 allowlist）
- 新增 `directory` state，`open` 时重置
- 名称 input 下方加 `<FolderPicker value={directory} onChange={setDirectory} placeholder="留空则不保存到本地目录（可选）" />` + 一行说明文字
- `handleConfirm` 改为 `onConfirm(name, directory)`

**文件**：`src/components/WorkspaceSwitcher.jsx`
- `onCreate={onCreate}` 的 prop 类型从 `(name)=>void` 改为 `(name, directory)=>void`，透传

**文件**：`src/components/Canvas.jsx`
- `handleCreate(name)` → `handleCreate(name, directory)`，调 `createWorkspace(name, directory)`

### E. mini-app：产图后写到用户目录（核心）

**文件 1**：`src/components/Canvas.jsx`
- L63 后加：`const activeWorkspace = workspaces.find((ws) => ws.id === activeId);`
- 抽出 `persistToWorkspaceDir(urls)` 工具函数：遍历 urls，对每张调 `window.AgentSpaces.saveImageToDir(url, activeWorkspace.directory)`，失败单张 warn 不阻塞（与 `persistImagesToBackend` 风格一致）
- 注入到两处产图回调：
  1. `useNodeExecutions` 入参（L169）加 `onImagesPersisted: persistToWorkspaceDir`，在 `handleGenerate` 写完 output.images 后调用（L87 后）
  2. queue `onComplete`（L119）里，在 `addHistory` 前调用

**文件 2**：`src/hooks/useNodeExecutions.js`
- 入参加 `onImagesPersisted`
- `handleGenerate`（L87 updateNodeData done 之后）和 `handleGenerateMedia` 对应位置：`if (onImagesPersisted) onImagesPersisted(urls).catch(()=>{})`（失败不阻塞，已有 console.warn）

**文件 3**：`src/hooks/useExecutionQueue.js`
- 不改 hook 本身；在 Canvas.jsx 的 `onComplete` 回调里直接调 `persistToWorkspaceDir(images)`（该回调已在 Canvas 内，能拿到 activeWorkspace）

## 关键设计决策

1. **双写而非单写**：图片先存后端 data/（保证画布能展示 + history 记录），再异步复制到用户目录。避免「只写用户目录」导致画布加载依赖宿主机文件系统反向服务（改动过大）。
2. **失败容错**：写用户目录失败只 warn，不影响节点状态和画布展示（用户目录可能无写权限/被删）。
3. **directory 留空 = 原行为**：不创建目录字段的工作区，`activeWorkspace.directory` 为 undefined，`persistToWorkspaceDir` 直接 return，零行为变化。
4. **文件名**：复用 `inferDownloadFileName(url)` 从 URL 推断，保留原扩展名。
5. **媒体节点（音频/视频）**：本计划只覆盖图片（用户需求是「图片」）。媒体产出结构不同，暂不扩展。

## 影响面与验证

- **宿主层改动**（A、B）：需重启 web。重启后所有 workspace 的 directory 功能可用。
- **mini-app 改动**（C、D、E）：刷新即生效。
- **向后兼容**：原有工作区无 directory 字段，行为完全不变。
- **安全**：write-absolute 路由校验绝对路径格式，与现有 local-file 路由同一套正则；不做路径遍历防护以外的限制（用户主动选的目录，信任用户选择，与 FolderPicker 语义一致）。

## 验收路径

1. 重启 web。
2. 点「新建工作区」→ 看到名称 + 目录选择器 → 选一个目录（如 `~/Desktop/test-ws`）→ 创建。
3. 切到该工作区，建一个文生图节点，生成图片。
4. 到 `~/Desktop/test-ws` 目录看是否出现图片文件。
5. 再建一个不选目录的工作区，生成图片，确认行为与原来一致（不报错、不写文件）。