# ComfyUI 插件

> 对接 [ComfyUI](https://github.com/comfyanonymous/ComfyUI) 的 HTTP API，支持提交工作流并轮询取输出、上传图片、查询系统状态/队列/历史、列出模型、中断任务。

## 简介

ComfyUI 是基于节点的 Stable Diffusion 图像生成 GUI 与后端服务。本插件通过其原生 REST API（`/prompt`、`/history`、`/view`、`/upload/image`、`/system_stats` 等）驱动图像生成，无需引入第三方 SDK 依赖。

插件类型：`server`。

> 注意：需要先部署并启动 ComfyUI 服务（默认 `http://127.0.0.1:8188`），并在 ComfyUI 中开启 `--enable-cors-header` 或本插件与服务同机部署。

## 前置准备

1. 启动 ComfyUI（默认端口 8188）
2. 在 ComfyUI 中加载工作流，点击 **Save (API Format)** 导出 `workflow_api.json`
3. 在 Agent Spaces 插件中心启用本插件

## 配置说明

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `baseUrl` | 是 | `http://127.0.0.1:8188` | ComfyUI 服务地址 |
| `timeout` | 否 | `600000` | 单个任务最长轮询时间（毫秒） |
| `auth`（节点级） | 否 | — | 反向代理鉴权，JSON：`{"type":"bearer","token":"..."}` 或 `{"type":"basic","username":"...","password":"..."}` |

## 节点清单

| 节点 | 用途 |
| --- | --- |
| `comfy_run_workflow` | 提交 API 格式工作流 → 轮询 → 取输出文件 / 图片 URL |
| `comfy_upload_image` | 上传本地图片到 input/temp/output 目录 |
| `comfy_system_stats` | 系统状态（CPU/GPU/设备） |
| `comfy_get_queue` | 当前队列（运行中 + 待执行） |
| `comfy_interrupt` | 中断当前任务（仅 workflow，不暴露为 Agent tool） |
| `comfy_list_models` | 列出模型文件或全部节点类 |
| `comfy_get_history` | 查询历史（指定 prompt_id 或最近记录） |

## 节点字段

### comfy_run_workflow

- 入参：
  - `prompt`：ComfyUI **API 格式**工作流 JSON（必填，对象或字符串）
  - `overrides`：可选，对象，形如 `{"6.inputs.text":"...","3.inputs.seed":42}`，提交前覆盖对应节点输入
- 出参 `data.images[]`：图片 URL 列表（图片/动图）
- 出参 `data.files[]`：全部输出文件清单 `{ nodeId, kind, filename, subfolder, type, url }`
- 出参 `data.promptId` / `data.status`

### comfy_upload_image

- 入参：
  - `filePath`：本地图片路径（必填）
  - `type`：`input`（默认） / `temp` / `output`
  - `subfolder`：可选子目录
  - `overwrite`：是否覆盖同名
- 出参 `data`：ComfyUI 返回的 `{ name, subfolder, type }`

### comfy_list_models

- 入参：
  - `nodeClass`：节点类名，如 `CheckpointLoaderSimple` / `LoraLoader` / `VAELoader`；留空返回所有节点类名
  - `inputKey`：要读取的输入名，默认 `ckpt_name`
- 出参 `data.models[]`

### comfy_get_history

- 入参：
  - `promptId`：可选，指定任务
  - `maxItems`：`promptId` 为空时返回最近条目数，默认 10
- 出参 `data`：ComfyUI `/history` 原始响应

## 使用示例

**示例 1：文生图**

```
prompt = { "3": { "class_type": "KSampler", "inputs": { ... } }, "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "a cinematic landscape", ... } } }
overrides = { "6.inputs.text": "a cat sitting on a chair" }
```

**示例 2：上传图片后做图生图**

先 `comfy_upload_image`（`filePath=/path/to/img.png`），拿到返回的 `name`，再在工作流的 `LoadImage.inputs.image` 中通过 `overrides` 填入。

## 常见问题

- **提交后一直不进 history**：检查 `system_stats` 是否可达、模型是否缺失（`node_errors` 会在错误信息中体现）。
- **取不到图**：确认输出节点（`SaveImage`）存在；`data.files` 列出所有输出，`data.images` 只含图片。
- **超时**：调大插件配置 `timeout`，或用 `comfy_get_queue` / `comfy_get_history` 手动跟进长任务。
- **CORS / 跨域**：本插件由后端发起请求，不涉及浏览器 CORS；若服务在远端需带鉴权，在节点 `auth` 字段填入凭证。

## 依赖

- ComfyUI 服务（自部署）
- 网络访问权限（后端 → ComfyUI `baseUrl`）
