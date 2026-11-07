# OpenAI 插件

> 集成 OpenAI 官方 API：Chat Completions、Image Generation / Edit、Embeddings、Audio TTS / STT、Models 列表。本插件兼容 OpenAI 兼容协议（可换 `baseUrl` 指向代理 / 其他服务）。

## 简介

基于官方 [`openai`](https://www.npmjs.com/package/openai) Node SDK，封装 7 个常用能力。Agent / 工作流可在不写代码的前提下调用 GPT、DALL·E、Whisper、Embeddings、TTS 等模型。

插件类型：`server`。

## 前置准备

1. 注册 [OpenAI](https://platform.openai.com) 账号并创建 **API Key**
2. 确认账户有对应模型的访问权限（部分模型需要单独申请）
3. 在 Agent Spaces 插件中心安装并启用本插件

> 通过 `baseUrl` 切换到代理 / Azure / 其他 OpenAI 兼容服务。

## 配置说明

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `apiKey` | 是 | — | OpenAI API Key |
| `baseUrl` | 否 | `https://api.openai.com` | API 基础地址，支持代理 |

## 节点清单

| 节点 | 用途 |
| --- | --- |
| `openai_chat` | Chat Completions（多轮对话、JSON 输出） |
| `openai_create_image` | 文生图（gpt-image-1 / dall-e-3 等） |
| `openai_edit_image` | 图编辑（输入图片 + 描述） |
| `openai_embeddings` | 文本向量化 |
| `openai_tts` | 文字转语音 |
| `openai_stt` | 语音转文字（Whisper） |
| `openai_models` | 列出可用模型 |

## 节点字段速查

### openai_chat

- `messages`：消息数组（`role` + `content`，`role` 支持 `system` / `user` / `assistant` / `developer`）
- `system`：系统提示词（会作为首条 system 消息插入）
- `model`：`gpt-4o`（默认） / `gpt-4o-mini` / `gpt-4.1` / `gpt-4.1-mini` / `gpt-4.1-nano` / `o3` / `o4-mini` / `gpt-5*` 等
- `temperature`：0~2，默认 1
- `max_tokens`：最大输出 token
- `response_format`：`text`（默认） / `json_object`
- 出参 `data`：`content`、`thinking`（o 系列推理内容）、`finish_reason`、`usage`、`model`

### openai_create_image

- `prompt`：图片描述（必填）
- `model`：`gpt-image-2` / `gpt-image-1`（默认） / `gpt-image-1.5` / `gpt-image-1-mini` / `dall-e-3` / `dall-e-2`
- `size`：`auto`（默认） / `1024x1024` / `1536x1024` / `1024x1536` / `256x256` / `512x512` / `1792x1024` / `1024x1792`
- `quality`：`auto` / `high` / `medium` / `low` / `hd` / `standard`
- `n`：1~10（`dall-e-3` 只支持 1）
- `output_format`：`png`（默认） / `jpeg` / `webp`
- `background`：`auto` / `transparent` / `opaque`
- 出参 `data.images[]`：可访问的图片 URL 列表

### openai_edit_image

- `prompt`：编辑方向描述（必填）
- `images`：输入图片数组，例：`[{"image_url":"https://..."}]`
- 其他字段同 `openai_create_image`（`output_format` 仅 `png` / `jpeg` / `webp`）

### openai_embeddings

- `input`：单个文本或文本数组（JSON）
- `model`：`text-embedding-3-small`（默认） / `text-embedding-3-large` / `text-embedding-ada-002`
- `dimensions`：输出维度（可选）
- 出参 `data.embeddings[]`：含 `{ index, embedding }`

### openai_tts

- `input`：要转换的文本（必填）
- `model`：`tts-1`（默认） / `tts-1-hd` / `gpt-4o-mini-tts`
- `voice`：`alloy` / `ash` / `coral` / `echo` / `fable` / `onyx` / `nova` / `sage` / `shimmer`
- `speed`：0.25~4.0，默认 1.0
- `response_format`：`mp3`（默认） / `wav` / `opus` / `aac` / `flac`
- 出参 `data.audio_base64`：Base64 编码音频，可配合 `data:audio/...;base64,...` 在前端播放

### openai_stt

- `file_url`：公网可访问的音频 URL（必填）
- `model`：`whisper-1`
- `language`：`zh` / `en` / `ja` / `ko` / 自动检测
- `response_format`：`json`（默认） / `text` / `srt` / `vtt` / `verbose_json`

### openai_models

- 无入参，列出当前账号可用的全部模型

## 使用示例

**示例 1：多轮对话 + JSON 输出**

```
system   = 你只输出 JSON，不要解释
messages = [{"role":"user","content":"给我一个示例用户画像"}]
response_format = json_object
```

**示例 2：透明 PNG**

```
model     = gpt-image-1
prompt    = 一只可爱的柴犬图标，简洁设计
size      = 1024x1024
background = transparent
output_format = png
```

**示例 3：Whisper 转写**

```
file_url  = https://example.com/clip.mp3
language  = zh
response_format = srt
```

## 常见问题

- **401 / 403**：API Key 无效、未开通对应模型或地区受限。
- **`dall-e-3` 一次只能生成 1 张**：`n > 1` 会被自动降级。
- **TTS 文本超长**：单次 4096 字符上限；长文本请分批。
- **STT 下载不到音频**：确保 `file_url` 是公网可访问且无防盗链。
- **代理 / 自建服务**：修改 `baseUrl` 即可，无需改其它字段。
- **`response_format=json_object`**：提示词中必须明确要求输出 JSON，否则会报 `400`。

## 依赖

- 运行时依赖：`openai` ^6.34.0
