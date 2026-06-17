# AI 图片生成与编辑 插件

> 对接 OpenAI 兼容的**异步**图像 API（如 closeai.fans 等 DALL·E 格式中转），支持文生图、参考图编辑（多图融合 / 局部重绘 / 蒙版编辑）与任务查询。

## 简介

本插件面向兼容 OpenAI `/v1/images/generations` + `/v1/images/edits` 协议、并采用**异步任务**模式的服务（提交即返回 `task_id`，随后轮询 `/v1/images/tasks/{task_id}` 取结果）。可对接 gpt-image-1、sora_image、nano-banana、dall-e-3、flux-kontext 等模型。

插件类型：`server`。

## 接口约定

| 能力 | 方法 & 路径 | Body | 返回 |
| --- | --- | --- | --- |
| 文生图 | `POST /v1/images/generations?async=true` | `application/json` `{ prompt, model, size?, n? }` | `{ code, message, data: <task_id> }` |
| 图片编辑 | `POST /v1/images/edits?async=true` | `multipart/form-data` `image`(文件，支持多图) `prompt` `model` | `{ code, message, data: <task_id> }` |
| 查询任务 | `GET /v1/images/tasks/{task_id}` | — | `{ data: { status, progress, fail_reason, data: { data: [{ url, b64_json }], model, created, usage } } }` |

- `status`：`IN_PROGRESS` / `SUCCESS` / `FAILURE`
- 鉴权：`Authorization: Bearer <apiKey>`

## 前置准备

1. 拥有一个 OpenAI 兼容的异步图像服务（自建或第三方中转）
2. 获取服务的 **API Key**（Bearer Token）
3. 在 Agent Spaces 插件中心安装并启用本插件，填入 API Key 与 API 地址

## 配置说明

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `apiKey` | 是 | — | Bearer Token |
| `baseUrl` | 否 | `https://api.closeai.fans` | OpenAI 兼容图像 API 基础地址，按你的服务填写 |

## 节点清单

| 节点 | 用途 |
| --- | --- |
| `ai_image_generate` | 文字 → 图片（异步轮询） |
| `ai_image_edit` | 参考图 + 指令 → 图片（多图融合 / 局部重绘 / 蒙版编辑） |
| `ai_image_query_task` | 按 task_id 查询一次任务状态（不轮询，适合长任务拆分 / 续查） |

## 节点字段

### ai_image_generate

- `prompt`（必填）：图片描述
- `model`：`sora_image`（默认） / `nano-banana` / `gpt-image-1` / `dall-e-3` / `flux-pro-1.1` / `flux-kontext-pro`
- `size`：`1024x1024`（默认） / `1024x1792` / `1792x1024` / `auto`
- `n`：生成数量，默认 1
- 出参 `data.images[]`：图片 URL 列表

### ai_image_edit

- `image`（必填）：参考图，支持多张，接受 URL / data URI / 本地路径；可填 JSON 数组
- `prompt`（必填）：编辑指令，如「戴上墨镜」「换成水彩风格」
- `model`：`gpt-image-1`（默认） / `flux-kontext-pro` / `flux-kontext-max` / `nano-banana`
- `mask`（可选）：PNG 蒙版，透明区域（alpha=0）为要编辑的区域，需与首张图同尺寸（仅 gpt-image-1）
- `size`：`auto`（默认） / `1024x1024` / `1024x1536` / `1536x1024`
- `n`：生成数量，默认 1
- 出参 `data.images[]`：图片 URL 列表

> 多图时按 OpenAI / gpt-image-1 多参考图约定以 `image[]` 字段上传。

### ai_image_query_task

- `taskId`（必填）：由 generate / edit 返回的 `task_id`
- 出参：`status` / `progress` / `images[]`（任务成功时）

## 使用示例

**示例 1：文生图**

```
prompt = 一只在樱花树下散步的柴犬，吉卜力风格
model  = sora_image
size   = 1024x1024
n      = 1
```

**示例 2：给人物戴上墨镜（图片编辑）**

```
image  = ["https://example.com/portrait.jpg"]
prompt = 戴上墨镜
model  = gpt-image-1
```

**示例 3：多图融合 + 风格改写**

```
image  = ["https://example.com/scene.jpg", "https://example.com/style.jpg"]
prompt = 按第二张图的风格重绘第一张场景
model  = flux-kontext-pro
```

**示例 4：局部重绘（蒙版编辑）**

```
image  = ["https://example.com/photo.png"]
mask   = ["https://example.com/mask.png"]   # 透明区域=要重绘的位置
prompt = 把蒙版区域改成一片花海
model  = gpt-image-1
```

## 常见问题

- **401 / 403 未授权**：`apiKey` 错误或过期，检查 Bearer Token。
- **提交失败但无 task_id**：服务返回了错误，查看节点日志中的 `code` / `message`。
- **轮询超时**：单任务最长约 10 分钟（120 次 × 5s），超时会报错；可用 `ai_image_query_task` 续查。
- **返回 b64_json 而非 url**：插件会自动将 base64 落盘为公开图片，返回可访问的 URL。
- **模型不可用**：不同服务支持的模型不同，请以你的服务商文档为准。
- **多图编辑字段名**：单图走 `image`，多图走 `image[]`，插件已自动处理。

## 依赖

- OpenAI 兼容的异步图像服务（自建或第三方中转）
- 服务需可被后端网络访问
