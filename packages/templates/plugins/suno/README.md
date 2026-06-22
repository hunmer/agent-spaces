# Suno AI 音乐生成 插件

> 集成 [Suno API](https://docs.sunoapi.org) 的 AI 音乐创作能力，覆盖音乐生成、歌词生成、音频扩展、上传翻唱、人声分离、WAV 转换、MV 生成、任务查询与额度查询。

## 简介

Suno API 提供高质量的 AI 音乐与音频处理服务。本插件将其封装为 Workflow 动作节点，方便 Agent / 工作流直接调用。

- **生成音乐**：根据文本描述生成完整歌曲，支持自定义模式、纯音乐、多模型
- **歌词生成**：根据主题生成 AI 歌词
- **音频扩展**：在已有音频上继续扩展
- **上传翻唱**：上传音频 URL 改造成新风格
- **人声分离**：分离人声与伴奏
- **WAV 转换**：转换为高质量 WAV
- **MV 生成**：由音频生成可视化音乐视频
- **任务查询 / 额度查询**：查询异步任务状态与账户剩余额度

插件类型：`server`。

Suno 大多数接口是**异步任务模式**：提交后返回 `taskId`，再通过 `record-info` 轮询或 `callBackUrl` 回调拿结果。每个生成类节点都提供 `wait` 开关：

- `wait=关`（默认）：立即返回 `taskId`，后续用「查询任务状态」节点拿结果
- `wait=开`：节点内部按 `pollInterval` 轮询，直到 `SUCCESS`/`FAILED`，超时由 `maxWait` 控制

## 前置准备

1. 在 [sunoapi.org/api-key](https://sunoapi.org/api-key) 获取 **API Key**
2. 在 Agent Spaces 插件中心安装并启用本插件
3. 把 API Key 填入插件配置

## 配置说明

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `apiKey` | 是 | — | Suno API Key |
| `baseUrl` | 否 | `https://api.sunoapi.org` | API 基础地址 |
| `defaultModel` | 否 | `V4_5` | 默认模型：`V4` / `V4_5` / `V4_5PLUS` / `V4_5ALL` / `V5` / `V5_5` |
| `callBackUrl` | 否 | — | 任务完成回调 URL（留空则使用轮询） |
| `httpProxy` | 否 | — | HTTP 代理地址（如 `http://127.0.0.1:7890`） |

## 节点清单

| 节点 | 用途 |
| --- | --- |
| `suno_generate` | 生成音乐 |
| `suno_lyrics` | 生成歌词 |
| `suno_extend` | 扩展音乐 |
| `suno_upload_cover` | 上传并翻唱 |
| `suno_vocal_removal` | 人声分离 |
| `suno_convert_wav` | 转换为 WAV |
| `suno_music_video` | 生成音乐视频 |
| `suno_record_info` | 查询任务状态 |
| `suno_credits` | 查询剩余额度 |

## 模型版本

| 模型 | 特点 |
| --- | --- |
| `V4` | 最高音质，最长 4 分钟 |
| `V4_5` | 进阶，最长 8 分钟（默认） |
| `V4_5PLUS` | 更丰富音色，最长 8 分钟 |
| `V4_5ALL` | 更强歌曲结构，最长 8 分钟 |
| `V5` | 更快、更出色，最长 8 分钟 |
| `V5_5` | 自定义音色 |

## 使用示例

**示例 1：生成一首歌并拿到音频**

1. 拖入「生成音乐」节点
2. `prompt` 填音乐描述，开启 `wait`
3. 运行后从 `data.response.data[].audio_url` 拿到音频

**示例 2：先生成 taskId，稍后查询**

1. 拖入「生成音乐」节点，`wait` 保持关闭，运行后拿到 `taskId`
2. 拖入「查询任务状态」节点，`taskId` 接上一步输出
3. 重复执行直到 `status = SUCCESS`

**示例 3：生成 → 分离人声**

1. 用「生成音乐」生成并 `wait` 拿到 `data.response.data[0].id`
2. 用「人声分离」传入源 `taskId` 与 `audioId`，开启 `wait`
3. 从 `data.vocal_removal_info.instrumental_url` / `vocal_url` 取结果

## 常见问题

- **401 Unauthorized**：检查 `apiKey` 是否正确。
- **402 Payment Required**：账户额度不足，用「查询剩余额度」节点核对。
- **轮询超时**：增大 `maxWait`，或关闭 `wait` 改用「查询任务状态」手动轮询。
- **文件过期**：生成的音频文件保留约 15 天，请及时下载保存。
- **自定义模式报错**：`customMode=true` 时必须提供 `style` 和 `title`。

## 依赖

- 运行时依赖：Suno API 账号
- API 基础地址：`https://api.sunoapi.org`
- 文档：[docs.sunoapi.org](https://docs.sunoapi.org)
