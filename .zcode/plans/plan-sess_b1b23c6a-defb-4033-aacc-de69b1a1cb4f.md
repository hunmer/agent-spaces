## 目标
节点表单提交时，把可复用参数（不含图片）保存到当前工作区；下次新增同类型节点自动预填上次提交的参数。

覆盖范围（用户已确认）：全部「可执行节点」—— 文生图/编辑图/视频/配音（prompt+model+aspect 等）、图像处理 12 种（processorParams）、抠图（mode+modeParams）。节点 toolbar 的「抠图/放大」快捷入口**不保存**（用户已确认）。

## 设计要点

### 持久化（复用 useGenerationHistory 模式）
- 新文件 `configs/workspaces/<id>/last-params.json`，结构 `{ [nodeType]: paramsSubset }`
- 按「工作区 + 节点类型」隔离，切换工作区各自记忆

### 数据流
- **写**：4 类执行回调 + 表单提交入口，在「执行时」提取参数子集（剥离 images/uploadedImages 等图片字段）→ saveLastParams
- **读**：createNodeAt 合并 params，优先级 `dataPatch.params（显式） > lastParams（上次） > initialData.params（默认）`。无 lastParams 时**零行为变化**（最小侵入）

### 参数子集（与 data.params 同构，只存可复用部分）
| nodeType | 存的字段 | 剥离 |
|---|---|---|
| textToImage/editImage | `{prompt, model, aspect, size}` | images/pickedPrompt/promptHtml/referenceImages |
| videoGenerator | `{prompt, model, aspect, quality, duration}` | images |
| textToVoice | `{prompt, model, voiceId}` | — |
| ip*/imageProcess | `{processorParams}` | processor(由type固定)/图片 |
| cutout | `{mode, modeParams}` | 图片 |

## 文件改动清单（7 处，均为最小改动/新增）

1. **`src/utils/constants.js`**（改）：`CANVAS_CONFIG/HISTORY_CONFIG` 旁加 `export const LAST_PARAMS_CONFIG = 'last-params.json';`

2. **`src/utils/storage.js`**（改）：照抄 `historyConfigPath` 加 `lastParamsConfigPath(workspaceId)`

3. **`src/hooks/useLastParams.js`**（新增，照抄 useGenerationHistory）：
   - 三重读取（getConfig + onConfigReady + onAnyConfigChanged）
   - `saveLastParams(nodeType, params)` → invokeService('save_last_params')
   - 用 ref 持有最新 lastParams + 暴露稳定的 `getLastParams(type)` 给 createNodeAt 读，避免 save 触发 createNodeAt 重建

4. **`src/services/canvas.js`**（改）：`export default {}` 加 `save_last_params` handler，用 `ctx.updateConfig` 做 nodeType 级 upsert（照抄 add_history 的 updateConfig 模式）

5. **`src/hooks/useNodeExecutions.js`**（改）：deps 加 `saveLastParams`；在 4 个 handler 执行体开头各加 1 行提取+保存：
   - handleGenerate → `saveLastParams(nodeType, {prompt, model, aspect, size} from input)`
   - handleGenerateMedia → 按 nodeType 存对应字段
   - handleProcessLocal → `saveLastParams(nodeType, {processorParams})`
   - handleCutout → `saveLastParams(NODE_TYPES.cutout, {mode, modeParams})`
   - handleProcessImage / handleCutoutCreate（toolbar 入口）**不加**（用户确认）

6. **`src/hooks/useNodeCrud.js`**（改）：
   - deps 加 `getLastParams` + `saveLastParams`
   - createNodeAt：读 `getLastParams(type)`，有则 `data.params = {...(data.params||{}), ...last, ...(dataPatch?.params||{})}`（无 last 时原逻辑不变）
   - handleFormSubmit：task.input 提取参数子集 → saveLastParams(task.nodeType, ...)

7. **`src/components/Canvas.jsx`**（改）：`const { saveLastParams, getLastParams } = useLastParams(activeId);` 装配；传 getLastParams + saveLastParams 给 useNodeCrud；传 saveLastParams 给 useNodeExecutions

## 不改 / 不影响
- 节点组件零改动（继续无状态读 data.params）
- useDecoratedNodes / nodeCallbacks 零改动（save 用 ref，不触发重建）
- 无 lastParams 时 createNodeAt 行为 100% 等于现状（最小侵入）
- toolbar 快捷抠图/放大、handlePromptReverse（无参数）不保存

## 验收
1. 改 `useLastParams`/`useNodeCrud`/service（mini-app src + services/，刷新即生效，无需重启 web）
2. 新建 textToImage 节点 → 改 prompt/model/aspect → 点生成 → 刷新页面
3. 再新建 textToImage 节点 → 表单应预填上次的 prompt/model/aspect（图片为空）
4. 切换工作区 → 新建同类型节点 → 应是另一工作区的上次参数（隔离生效）
5. 图像处理/抠图节点同样验证 processorParams/mode 预填
6. toolbar「抠图」按钮新建的 cutout 节点用 workflow 默认（不被上次覆盖，因 dataPatch.params 优先）
7. 控制台无报错；`configs/workspaces/<id>/last-params.json` 内容正确