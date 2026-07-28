## 方案概述

把产出图片的「后端 data 落地」改为「工作区目录落地」：文件只产生**一份**，落在用户选的工作区目录下（`{historyId}/{index}.ext`），画布/历史/编辑节点共享指向该文件的 http URL（走 `/local-file` 路由）。工作区**没设目录**时，回退到原来的 data 落地（保证可用，不破坏默认行为）。

去掉上一轮加的 `persistToWorkspaceDir` 双写（不再产生第二份文件）。

## 关键设计

1. **historyId 前置**：在调用 `generateImages` 之前生成 historyId 并传入，作为落地子目录名。两个调用点（useWorkflow / useExecutionQueue）都改。
2. **`persistImagesToBackend` 增加 opts**：`{ directory, historyId }`。
   - 有 directory：调 `saveImageToDir(url, dir, '{historyId}/{index}')` 落到工作区目录 → 用 `localFileUrl(绝对路径)` 返回 http URL。
   - 无 directory：维持原 `downloadImage` 落 data 行为。
3. **URL 单一来源**：`localFileUrl` 产出的 URL 会被 `isBackendUrl` 判定为后端地址（workflow.js 的 `BACKEND_IMAGE_PATH_RE` 已含 `local-file`），下游节点/编辑节点复用此 URL 不会二次下载，也不怕外链过期（文件在本地）。
4. **去掉双写**：移除 Canvas 的 `persistToWorkspaceDir` 和 useNodeExecutions 的 `onImagesPersisted` 注入——落地点已收敛到 generateImages 内部。

## 改动清单（按依赖顺序）

### A. utils/workflow.js（核心）

**`persistImagesToBackend(urls, opts = {})`** — L54，签名加 opts `{ directory, historyId }`：
- 遍历 urls，对非后端地址的外链：
  - `opts.directory` 有值：`saveImageToDir(url, directory, '${historyId}/${index}')` → 返回 `localFileUrl(返回的绝对 path)`。
  - 无值：原 `downloadImage(url)` → `res.httpUrl`。
- 失败保留原 URL（不阻塞）。

**`generateImages(workflowId, input, opts = {})`** — L278，签名加 opts，透传给 persistImagesToBackend：
`return persistImagesToBackend(normalized, { directory: opts.directory, historyId: opts.historyId });`

> saveImageToDir 返回的 `{ path }` 是绝对路径（write-absolute 路由返回 fullPath），用 localFileUrl 包一下即可。需确认 saveImageToDir 返回绝对路径——是（write-absolute 返回 `join(dirAbs, rawName)`）。

### B. hooks/useWorkflow.js

`useWorkflow()` 改为收 `directory`，闭包进 generateImages 调用：
```js
export default function useWorkflow(directory) {
  return useCallback(async (workflowId, input, histId) => {
    const urls = await generateImages(workflowId, input, { directory, historyId: histId });
    return { urls };
  }, [directory]);
}
```
（第三参 histId 由调用方传入）

### C. hooks/useExecutionQueue.js

L66 `generateImages(task.workflowId, task.input)` 改为收 directory + histId。useExecutionQueue 需要从外部收 directory（Canvas 注入）+ 在 submit 时 genId histId。

由于 useExecutionQueue 的 onComplete 在 Canvas 内、directory 也在 Canvas 内，最小改动：让 `useExecutionQueue` 收 `directory`，submit 生成时 genId 并传给 generateImages，onComplete 传 histId 出来。

### D. components/Canvas.jsx

- `useWorkflow()` → `useWorkflow(activeWorkspace?.directory)`。
- 移除 `persistToWorkspaceDir` 及其注入（`onImagesPersisted`），落地点收敛到 generateImages 内。
- useNodeExecutions 入参移除 `onImagesPersisted`。
- queue onComplete 移除 persist 调用；histId 改由 useExecutionQueue 内部生成并传出（onComplete 第二参或 job 携带）。

### E. hooks/useNodeExecutions.js

- `handleGenerate`：去掉 `onImagesPersisted` 调用；historyId 仍需前置（传给 runWorkflow 第三参），addHistory 复用。
- 入参移除 `onImagesPersisted`。

### F. 不改：媒体节点（generateAudio/generateVideo）

用户需求是「图片」。媒体节点维持 data 落地（不改 generateAudio/generateVideo），不引入工作区目录逻辑。后续如需可再扩展。

## 时序与一致性

- handleGenerate：`const histId = genId('hist')` → `runWorkflow(wfId, input, histId)`（useWorkflow 把 histId+directory 传给 generateImages 落地）→ addHistory 用同一 histId。文件名 = `{histId}/{index}.ext`。
- queue submit → generateImages（同样传 directory + histId）→ onComplete 用同一 histId addHistory。
- 同一次产出的文件、节点 output.images、history.images 三处用同一组 localFileUrl，单一文件。

## 影响面与验证

- **宿主层无新增改动**（saveImageToDir / localFileUrl / write-absolute 路由均已具备，上一轮已加）。
- **纯 mini-app 改动** → 刷新即生效。
- **向后兼容**：工作区没设 directory → 走原 data 落地，行为不变。
- **媒体节点**：不受影响（仍走 data）。

## 验收路径

1. 刷新画布（无需重启 web）。
2. 工作区设了目录 → 文生图 count=4 → 工作区目录出现 `hist-xxx/0.png`～`3.png`（只一份文件）；画布节点 output、历史记录、下游编辑节点用的 URL 都指向这 4 个本地文件（`/api/.../local-file?path=<工作区目录>/hist-xxx/N.png`）。
3. 确认 **data/output/ 不再产生**该批图片文件。
4. 工作区没设目录 → 文生图 → 仍走 data 落地（`data/output/xxx.png`），画布正常。
5. 编辑图片节点（把上游产出图作为输入）→ 上游是工作区目录文件时，编辑能正常拉取。