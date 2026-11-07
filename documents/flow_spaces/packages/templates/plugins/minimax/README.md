# MiniMax AI 插件

> 集成 [MiniMax（海螺 AI）](https://api.minimaxi.com) 平台的多种生成能力：文本合成、角色对话、语音合成、音乐生成、视频生成、歌词生成。

## 简介

本插件对接 MiniMax AI 的 OpenAI 兼容 API，把以下能力封装为 Workflow 动作节点：

- **文本**：M2.x 系列大模型对话、M2-her 角色对话
- **音频**：TTS 语音合成（含情绪 / 音色 / 语速控制）、音乐生成、歌词生成
- **视频**：文生视频、图生视频、首尾帧视频、人物主体参考视频

插件类型：`server`。

## 前置准备

1. 注册 [MiniMax 开放平台](https://api.minimaxi.com) 账号
2. 在「账户管理 → 接口密钥」中创建 **API Key**
3. 在 Agent Spaces 插件中心安装并启用本插件

## 配置说明

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `apiKey` | 是 | — | MiniMax API Key |
| `baseUrl` | 否 | `https://api.minimaxi.com` | API 服务地址 |

## 节点清单

### 文本

| 节点 | 用途 |
| --- | --- |
| `minimax_chat` | 文本合成（多轮对话、图像理解、Function Call） |
| `minimax_chat_her` | 角色对话（自定义人设、世界观、示例对话） |

### 音频

| 节点 | 用途 |
| --- | --- |
| `minimax_tts` | TTS 同步语音合成 |
| `minimax_music_generation` | 音乐生成（含翻唱模式） |
| `minimax_lyrics_generation` | 歌词生成（写全歌 / 续写） |

### 视频（节点内部自动轮询至完成）

| 节点 | 用途 |
| --- | --- |
| `minimax_text_to_video` | 文生视频（支持运镜指令） |
| `minimax_image_to_video` | 图生视频 |
| `minimax_start_end_to_video` | 首尾帧生视频 |
| `minimax_subject_to_video` | 主体参考视频（保持人物一致性） |
| `minimax_video_download` | 拿到 `fileId` 后获取 1 小时有效的下载链接 |

## 节点字段速查

### minimax_chat

- `model`：`MiniMax-M2.7`（推荐） / M2.7-highspeed / M2.5 / M2.5-highspeed / M2.1 / M2.1-highspeed / M2
- `systemPrompt`、`messages`（支持文本 / `image_url`）
- `temperature`（0~1，默认 0.7）、`topP`、`maxCompletionTokens`
- 出参 `data.content`、`data.reasoningContent`、`data.toolCalls`、`data.totalTokens`

### minimax_chat_her

- `systemPrompt`：AI 角色人设
- `userSystem`：用户角色设定（`user_system`）
- `group`：世界观 / 场景（`group`）
- `sampleMessages`：示例对话（`sample_message_user` / `sample_message_ai`）
- `messages`：实际对话（`user` / `assistant`）
- 模型固定为 `M2-her`，`temperature` 默认 1.0，`maxCompletionTokens` 上限 2048

### minimax_tts

- `model`：`speech-2.8-hd`（推荐） / 2.8-turbo / 2.6-hd / 2.6-turbo / 02-hd / 02-turbo
- `voiceId`：音色 ID，默认 `Chinese (Mandarin)_Lyrical_Voice`
- `speed`（0.5~2.0）、`vol`（0~10）、`pitch`（-12~12）、`emotion`
- `audioFormat`：`mp3`（默认） / `wav` / `flac` / `pcm`
- `sampleRate`：`8000` / `16000` / `22050` / `24000` / `32000`（默认） / `44100`
- `outputFormat`：`url`（默认） / `hex`

### minimax_music_generation

- `model`：`music-2.6`（推荐） / `music-cover` / `music-2.6-free` / `music-cover-free`
- `prompt`：风格描述（必填）
- `lyrics`：歌词（用 `\n` 分行，支持 `[Verse]` `[Chorus]` 结构）
- `isInstrumental`：是否纯音乐
- `lyricsOptimizer`：是否根据描述自动生成歌词
- `audioUrl`：翻唱模式专用参考音频 URL（6s ~ 6min，≤ 50MB）

### minimax_lyrics_generation

- `mode`：`write_full_song`（默认） / `edit`
- `prompt`：歌曲主题 / 风格描述
- `lyrics`（edit 模式）、`title`

### 视频类（minimax_text_to_video / image_to_video / start_end_to_video / subject_to_video）

- 生成节点**内部自动轮询**至任务完成，直接返回 `downloadUrl`（不再暴露 `taskId`）
- 模型 `MiniMax-Hailuo-2.3`（推荐） / Hailuo-02 / I2V-01-Director / I2V-01-live / S2V-01 等
- `duration`：`6`（默认） / `10` 秒
- `resolution`：`720P` / `768P`（默认） / `1080P`
- `promptOptimizer`：是否自动优化提示词
- `timeout` / `pollInterval`（可选，默认 600s / 10s）：轮询超时与间隔，可在节点 JSON 中手动添加

**视频工作流**：

1. 拖入生成节点 → 节点内部自动轮询 → 从 `data.downloadUrl` 拿到 1 小时有效的下载链接
2. 下载链接过期后，可用 `data.fileId` 调 `minimax_video_download` 重新获取

## 使用示例

**示例 1：多轮对话**

1. 拖入「Text Completion」节点
2. `systemPrompt = 你是一名专业翻译`，`messages` 填 `[{role:"user", content:"将下面句子翻译成英文：今天天气真好"}]`
3. 从 `data.content` 拿到翻译结果

**示例 2：带情绪的 TTS**

```
model   = speech-2.8-hd
text    = 今天真开心啊！
emotion = happy
voiceId = Chinese (Mandarin)_Lyrical_Voice
```

**示例 3：文生视频**

1. 拖入「Text to Video」节点，填写 prompt / 模型 / 时长 / 分辨率
2. 节点会内部轮询直到生成完成（默认超时 10 分钟）
3. 从 `data.downloadUrl` 拿到 1 小时有效的下载链接

**示例 4：人物主体参考**

```
prompt       = 镜头跟随人物在樱花大道散步
subjectImage = https://example.com/portrait.jpg
```

## 常见问题

- **401 / 鉴权失败**：API Key 错误或账号未开通对应模型。
- **TTS 文本超长**：单次合成上限 10000 字符，超长请分批。
- **TTS 音色找不到**：`voiceId` 必须使用系统音色 ID（参考官方音色列表）。
- **视频任务一直 Queueing**：高峰期排队较久，可在节点 JSON 中调大 `timeout`（默认 600s）；轮询间隔 `pollInterval` 默认 10s。
- **下载链接过期**：`downloadUrl` 1 小时内有效；过期后可用 `fileId` 调 `minimax_video_download` 重新获取。
- **M2-her 风格跑偏**：调高 `sampleMessages` 示例对话条数，让模型「看清」人设。

## 依赖

- 运行时依赖：MiniMax AI 平台账号
- API 基础地址：`https://api.minimaxi.com`
