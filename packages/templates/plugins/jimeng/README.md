# 即梦 AI 生图 插件

> 通过 [即梦 AI](https://jimeng.jianying.com) 的 API 进行图片与视频生成，支持文生图、图生图、文生视频 / 图生视频 / 首尾帧视频。

## 简介

即梦是字节跳动旗下的 AI 创作平台，本插件对接其 OpenAI 兼容 API 协议，让 Workflow / Agent 直接驱动图片和视频生成。

插件类型：`server`。

> 注意：本插件需要搭配即梦 API 网关服务（默认 `http://localhost:5100`）使用，请先部署即梦 API 代理。

## 前置准备

1. 部署即梦 API 网关（参考即梦官方文档）
2. 获取 **Session ID**：
   - 中国站直接使用
   - 国际站需要加前缀：`us-` / `hk-` / `jp-` / `sg-`
3. 在 Agent Spaces 插件中心安装并启用本插件

## 配置说明

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `sessionId` | 是 | — | 即梦 Session ID |
| `baseUrl` | 否 | `http://localhost:5100` | 即梦 API 服务地址 |

## 节点清单

| 节点 | 用途 |
| --- | --- |
| `jimeng_text_to_image` | 文字 → 图片 |
| `jimeng_image_to_image` | 图片 + 文字 → 图片（风格迁移 / 图像融合） |
| `jimeng_text_to_video` | 文字 / 图片 → 视频（图生视频、首尾帧视频） |

## 节点字段

### jimeng_text_to_image

- 入参：
  - `prompt`：图片描述（必填）
  - `model`：`jimeng-4.5`（默认） / `5.0` / `4.6` / `4.1` / `4.0` / `3.1` / `3.0`
  - `ratio`：`1:1` / `4:3` / `3:4` / `16:9` / `9:16` / `3:2` / `2:3` / `21:9`
  - `resolution`：`1k` / `2k`（默认） / `4k`
  - `negativePrompt`：反向提示词
- 出参 `data.images[]`：图片 URL 列表

### jimeng_image_to_image

- 入参：
  - `prompt`：生成方向描述（必填）
  - `images`：输入图片 URL 数组（必填）
  - `model`：`jimeng-4.5` / `5.0` / `4.6` / `4.1` / `4.0`
  - `ratio`、`resolution`：同上图
  - `sampleStrength`：0.0 ~ 1.0，参考原图的强度
- 出参 `data.images[]`、`data.inputImages[]`

### jimeng_text_to_video

- 入参：
  - `prompt`：视频描述（必填）
  - `model`：`jimeng-video-3.5-pro`（默认） / `3.0` / `3.0-pro` / `3.0-fast` / `2.0` / `2.0-pro`
  - `ratio`：`1:1` / `4:3` / `3:4` / `16:9` / `9:16` / `21:9`
  - `duration`：5 或 10（秒）
  - `filePaths`：可选图片数组
    - 传 1 张 = 图生视频
    - 传 2 张 = 首尾帧视频
    - 不传 = 文生视频
- 出参 `data.videos[]`：视频 URL 列表

## 使用示例

**示例 1：文生图**

```
prompt     = 一只在樱花树下散步的柴犬
model      = jimeng-4.5
ratio      = 1:1
resolution = 2k
```

**示例 2：把图改成水彩风格**

```
prompt   = 转换为水彩画风格
images   = ["https://example.com/photo.jpg"]
ratio    = 1:1
sampleStrength = 0.6
```

**示例 3：图生视频**

```
prompt     = 镜头缓慢拉远，云层流动
model      = jimeng-video-3.5-pro
ratio      = 16:9
duration   = 5
filePaths  = ["https://example.com/cover.jpg"]
```

## 常见问题

- **401 / 403 未授权**：`sessionId` 过期或错误，重新登录即梦并复制新 Session。
- **国际站模型不可用**：检查 `sessionId` 是否加了正确前缀。
- **生成失败 / 超时**：单次最长 10 分钟；可在 API 网关侧调整超时。
- **`jimeng-3.1` 仅中国站**：国际站账号请选其他模型。
- **首尾帧视频只有 1 张图**：必须传恰好 2 张图，否则会回退为图生视频。

## 依赖

- 即梦 API 网关服务（自部署或第三方）
- 网络访问权限
