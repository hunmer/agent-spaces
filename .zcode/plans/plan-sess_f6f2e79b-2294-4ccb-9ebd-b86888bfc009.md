## 实现计划：工作流产出图片统一保存到后端

### 策略：单一收口点 + 通用过滤器

所有远程工作流产出（节点内生成 / 表单队列 / 抠图放大）最终都经过 `utils/workflow.js` 的 `generateImages`，在此处统一过滤替换即可零侵入覆盖三条路径。本地图像处理节点产出已走 `uploadFile`，天然是后端地址，无需处理。

### 改动清单（3 个文件，最小改动）

#### 1. `utils/workflow.js`（核心）
- 新增 `isBackendUrl(url)`：判定是否后端地址
  - `data:`/`blob:`/非 http(s) → true（无需下载）
  - 同源 + 路径匹配 `/api/mini-apps/<id>/(data\/file|src\/file|local-file|proxy-image)` → true
  - 否则 false
- 新增 `persistImagesToBackend(urls)`：对非后端 URL 调 `window.AgentSpaces.downloadImage(url)`，返回 httpUrl；**单张失败保留原地址**（不阻塞整体）
- 修改 `generateImages`：`normalizeImageUrls` 后追加 `persistImagesToBackend`

#### 2. `hooks/useWorkflow.js`（清理失效逻辑）
- 删除已失效的 `downloadImages` 调用（产出已变后端地址，`downloadImages` 用 `downloadFile` 只落地不返 URL，是死代码）
- 简化为 `const urls = await generateImages(...); return { urls }`
- `nodeId` 参数移除（无调用方依赖；Canvas.jsx 仍传多余参数也兼容）

#### 3. `utils/storage.js`
- 删除 `downloadImages` 和 `matchExt`（被 useWorkflow 移除后无引用）

### 影响范围
| 产出路径 | 覆盖 | 说明 |
|---|---|---|
| handleGenerate（节点内生成） | ✅ | 经 generateImages |
| useExecutionQueue submit（表单队列） | ✅ | 经 generateImages |
| handleProcessImage（抠图/放大） | ✅ | 经 generateImages |
| handleProcessLocal（本地算法） | ✅ 天然 | 产出已走 uploadFile 返回后端 URL，isBackendUrl 判定通过跳过 |

### 验收
- 任一工作流生成后，产出图 src 为 `/api/mini-apps/<projectId>/data/file?...` 形式
- 断网/下载失败时保留外链展示，不阻塞

### 不改的
- host 层（use-mini-app-host-api.tsx）：`downloadImage` 已存在，无需改
- Canvas.jsx / useExecutionQueue.js：产出更新逻辑不动
- services/canvas.js：不动