# 千音语音合成 插件

> 集成 [千音开放平台](https://open.qianyin123.com) 的 TTS 语音合成能力，支持多种发音人、语速 / 音量 / 音调调节。

## 简介

千音提供了多种中文 / 英文发音人和细致的韵律参数控制。本插件将其封装为 Workflow 动作节点，Agent / 工作流可以直接生成高质量语音文件。

插件类型：`server`。

## 前置准备

1. 注册千音开放平台账号，开通 TTS 服务
2. 在控制台获取 **AppKey** 与 **Secret**
3. 在 Agent Spaces 插件中心安装并启用本插件

## 配置说明

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `appkey` | 是 | — | 千音 AppKey |
| `secret` | 是 | — | 千音 Secret |
| `baseUrl` | 否 | `https://open.qianyin123.com` | API 基础地址 |

## 节点清单

| 节点 | 用途 |
| --- | --- |
| `qianyin_tts` | 文字转语音 |
| `qianyin_speakers` | 拉取平台可用发音人列表 |

## 节点字段

### qianyin_tts

**入参**：

- `text`：要合成的文本（必填）
- `appkey`、`secret`、`baseUrl`：可从插件配置继承
- `speakerId`：发音人 ID，默认 `521`（默认女声），常用 `1051`（晓晓 Ultra）
- `format`：`mp3`（默认） / `wav`
- `speed`：语速倍率，默认 `1.0`
- `volume`：0~100，默认 `100`
- `pitch`：音调调节，默认 `0`

**出参 `data`**：

- `filePath`：保存到本地的路径
- `fileUrl`：千音返回的原始音频 URL
- `format`、`size`

### qianyin_speakers

**入参**：

- `baseUrl`：可从插件配置继承

**出参 `data`**：

- `speakers[]`：每项含 `id`、`name`、`gender`（male/female）、`language`、`description`、`avatar`、`auditionUrl`、`price`
- `total`：发音人总数

## 使用示例

**示例 1：合成一段播报**

```
text      = 今天的天气晴，最高温度 28 度
speakerId = 521
format    = mp3
```

**示例 2：调整语速 + 音调**

```
text   = 欢迎收听本期节目
speed  = 1.2
pitch  = 2
```

**示例 3：选择特定发音人**

1. 先用「Get Speaker List」拿到平台发音人列表
2. 选中喜欢的 ID（如 `1051`），填入 `qianyin_tts` 的 `speakerId`

## 常见问题

- **401 / 鉴权失败**：检查 `appkey` / `secret` 是否正确，是否有 TTS 服务权限。
- **文本过长**：单次合成有字数上限，长文本请分批合成。
- **找不到合适发音人**：用「Get Speaker List」拉取当前账号可见的全部发音人；部分音色需要单独购买或申请。
- **下载的音频无法播放**：先确认 `format` 与播放环境一致（`mp3` 兼容性最好）。
- **`pitch` 调整范围**：本插件的 `pitch` 字段是「0=不变、正数升调、负数降调」，最终会换算为千音 API 的倍率。

## 依赖

- 运行时依赖：千音开放平台账号
- API 基础地址：`https://open.qianyin123.com`
