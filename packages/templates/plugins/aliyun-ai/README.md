# 阿里云百炼 AI 插件

> 一站式调用阿里云百炼（DashScope）平台的图片生成、视频生成、图像编辑与语音识别能力，覆盖千问（Qwen）、万相（Wan）、可灵（Kling）等模型。

## 简介

阿里云百炼是阿里云推出的一站式大模型服务平台，本插件把以下能力封装为 Workflow 动作节点，Agent 编排时可直接拖拽使用：

- **图片生成与编辑**：千问文生图 / 图像编辑、万相文生图、可灵生图、图像扩图
- **视频生成**：万相文生视频、图生视频（2.7 / Legacy）、首尾帧生视频、参考生视频、视频编辑、图生动作、声动人像
- **语音识别（ASR）**：FunASR、Paraformer（v1/v2）、千问 ASR（实时 / 文件转写），支持说话人分离与多语种
- **临时文件上传**：把本地文件上传到百炼临时存储并返回 `oss://` URL

插件类型：`server`。

## 前置准备

1. 拥有阿里云账号，开通 [百炼](https://bailian.console.aliyun.com/) 服务
2. 在控制台创建并复制 **DashScope API Key**（北京地域）
3. 在 Agent Spaces 插件中心安装并启用本插件
4. 若要处理本地文件，建议在调用前先用「上传文件到百炼」节点拿到 `oss://` URL

## 配置说明

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `apiKey` | 是 | 阿里云百炼 DashScope API Key（北京地域） |

> 北京地域的 Key 才能调用本插件全部能力；国际地域部分模型不可用。

## 动作节点一览

### 图片类（同步返回）

| 节点 | 说明 |
| --- | --- |
| `aliyun_text_to_image` | 千问 / 万相文生图（同步），支持 qwen-image-2.0-pro、wan2.7-image-pro 等 |
| `aliyun_image_edit` | 千问 / 万相图像编辑，1~9 张输入图，文字描述编辑方向 |
| `aliyun_wan_text_to_image_legacy` | 万相 2.5 及更早版本的文生图（异步），wan2.5 / 2.2 / 2.1 |
| `aliyun_image_out_painting` | 图像扩图，支持按比例 / 缩放 / 方向扩图，可旋转 |
| `aliyun_kling_image_generation` | 可灵生图，支持参考图、单图 / 组图模式 |

### 视频类（异步，节点内部轮询）

| 节点 | 说明 |
| --- | --- |
| `aliyun_text_to_video` | 万相 2.7 文生视频，支持多镜头叙事 |
| `aliyun_image_to_video_v27` | 万相 2.7 图生视频，支持首帧 / 首尾帧 / 视频续接 / 音频驱动 |
| `aliyun_image_to_video_legacy` | 万相 2.6 及更早版本图生视频 |
| `aliyun_first_last_frame_video` | 首尾帧生视频，平滑过渡 |
| `aliyun_reference_video` | 参考生视频（wan2.7-r2v），多角色互动 |
| `aliyun_video_editing` | 万相视频编辑，指令式或参考图局部替换 |
| `aliyun_animate_move` | 万相图生动作，把参考视频的动作迁移到人物图 |
| `aliyun_videoretalk` | 声动人像，由人物视频 + 人声音频生成对口型视频 |

### 语音识别（ASR）

| 节点 | 说明 |
| --- | --- |
| `asr_file_recognition` | 录音文件异步转写，支持 FunASR / Paraformer / 千问长音频，最多 100 个 URL |
| `asr_qwen_flash` | 千问实时语音识别（同步），返回文本、语种、情感、时长 |

### 工具

| 节点 | 说明 |
| --- | --- |
| `aliyun_upload_file` | 上传本地文件到百炼临时存储，返回 `oss://` URL（48 小时有效） |

## 通用输入参数

图片类与视频类节点都包含以下通用字段：

- `apiKey`：可从插件配置继承，或在节点上单独覆盖
- `prompt`：文本描述（必填）
- `negativePrompt`：反向提示词
- `seed`：随机种子，固定后可复现结果
- `promptExtend`：是否开启智能改写（默认开启）
- `watermark`：是否添加水印（默认否）

视频类另含 `resolution`（`480P` / `720P` / `1080P`）、`duration`（秒）、`ratio`（宽高比）等。

## 使用示例

**示例 1：用千问文生图**

1. 拖入「AI Text to Image」节点
2. 填写 `prompt`：「一只在樱花树下散步的柴犬，写实风格」
3. 选择 `model` = `qwen-image-2.0-pro`、`size` = `2048*2048`
4. 运行后从 `data.images[0]` 得到图片 URL

**示例 2：本地图片生成视频**

1. 拖入「Upload File (Bailian)」节点，`model` 填 `wan2.7-i2v`，上传本地图片得到 `oss://` URL
2. 把 URL 传给「Wan Image to Video (2.7)」节点的 `media[0].url`
3. 填写 `prompt` 与 `duration`（如 5 秒），运行后从 `data.videoUrl` 拿到视频

**示例 3：批量转写录音**

1. 拖入「Audio File Transcription」节点
2. 选 `model` = `paraformer-v2`
3. 在 `fileUrls` 填入 `["https://.../a.mp3", "https://.../b.mp3"]`
4. 节点内部会自动轮询，返回 `data.text` 合并后的文本与 `data.details` 每段详情

## 常见问题

- **提示 `InvalidParameter` / 模型不存在**：检查 API Key 是否北京地域，以及 `model` 名称是否拼写正确。
- **图片 / 视频生成超时**：图片类单次最长 10 分钟；视频类内部最多轮询 20 分钟，超时请在控制台查看任务状态。
- **`oss://` URL 过期**：百炼临时存储仅 48 小时有效，建议尽快把成品下载到自己的 OSS（可结合「阿里云 OSS 插件」）。
- **ASR 报错 `fileUrls required`**：FunASR / Paraformer 必须传 `fileUrls` 数组，千问长音频必须传 `fileUrl` 单个 URL，二选一。
- **声动人像效果差**：保证人物视频为正面镜头、音频清晰无背景音。

## 依赖

- 运行时依赖：阿里云百炼 DashScope 平台账号
- API 基础地址：`https://dashscope.aliyuncs.com`
