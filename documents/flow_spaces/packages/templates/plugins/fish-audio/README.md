# FishAudio 语音合成 插件

> 集成 [FishAudio](https://fish.audio) 的 TTS（文字转语音）和 STT（语音转文字）能力，支持自定义音色模型、采样率、语速、音量等参数。

## 简介

FishAudio 提供高质量的语音合成与识别 API。本插件将其封装为 Workflow 动作节点，方便 Agent / 工作流直接调用：

- **TTS**：将文本转为自然语音，支持多种音色模型、采样率、格式
- **STT**：将音频文件转写为文字，支持自动语种检测

插件类型：`server`。

## 前置准备

1. 注册 [fish.audio](https://fish.audio) 账号，获取 **API Key**
2. （可选）在模型市场挑选并复制一个 **音色模型 ID（referenceId）**
3. 在 Agent Spaces 插件中心安装并启用本插件

## 配置说明

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `apiKey` | 是 | — | FishAudio API Key |
| `referenceId` | 否 | — | 默认音色模型 ID（可在模型市场获取） |
| `model` | 否 | `s2-pro` | TTS 模型：`s2-pro`（推荐）/ `s1` |
| `baseUrl` | 否 | `https://api.fish.audio` | API 基础地址 |
| `httpProxy` | 否 | — | HTTP 代理地址（如 `http://127.0.0.1:7890`） |

## 节点清单

| 节点 | 用途 |
| --- | --- |
| `fish_audio_tts` | TTS：文字转语音 |
| `fish_audio_stt` | STT：语音转文字 |

## 节点字段

### fish_audio_tts

**入参**：

- `text`：要合成的文本（必填）
- `apiKey`、`referenceId`、`baseUrl`、`proxy`：可从插件配置继承
- `model`：`s2-pro`（推荐） / `s1`
- `format`：`mp3`（默认） / `wav` / `pcm` / `opus`
- `sampleRate`：`16000` / `24000` / `32000` / `44100`（默认） / `48000`（Opus 推荐）
- `speed`：0.5 ~ 2.0，默认 1.0
- `volume`：dB，默认 0
- `temperature`：表现力 0~1，默认 0.7
- `latency`：`normal`（最佳质量） / `balanced` / `low`

**出参 `data`**：

- `filePath`：保存到公共目录的本地路径
- `httpPath`：可访问的 HTTP 路径
- `format`、`size`、`mimeType`

### fish_audio_stt

**入参**：

- `filePath`：本地音频文件绝对路径，支持 WAV / MP3 / FLAC（必填）
- `apiKey`、`baseUrl`、`proxy`：可从插件配置继承
- `language`：`auto`（默认）/ `zh` / `en` / `ja` / `ko` / `fr` / `de` / `es`

**出参 `data`**：

- `text`：转写文本
- `duration`：音频时长（秒）
- `segments`：分段信息（含时间戳）

## 使用示例

**示例 1：合成一段播报**

1. 拖入「AI Text to Speech」节点
2. `text` 填写要播报的内容
3. `referenceId` 填好你喜欢的音色
4. 运行后会从 `data.httpPath` 拿到可访问的音频 URL

**示例 2：转写一段录音**

1. 拖入「AI Speech to Text」节点
2. `filePath` 选择录音文件
3. 运行后从 `data.text` 拿到识别结果

**示例 3：TTS → 桌面通知**

1. 先用「AI Text to Speech」生成音频
2. 再用「桌面原生」插件的「Send Notification」发送通知
3. 配合 `data.filePath` 即可在桌面上播放

## 常见问题

- **401 Unauthorized**：检查 `apiKey` 是否正确。
- **音色无效**：`referenceId` 必须是模型市场公开 / 你拥有的模型 ID。
- **Opus 播放异常**：使用 `sampleRate = 48000` 效果最佳。
- **TTS 超时**：单次合成默认超时 120 秒；长文本请配合 `chunkLength`（100-300）分片。
- **STT 中文识别不准**：把 `language` 显式设为 `zh`。

## 依赖

- 运行时依赖：FishAudio API 账号
- API 基础地址：`https://api.fish.audio`
