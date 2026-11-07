# Nano Banana 插件

> 集成 Google Gemini 原生图像生成能力（Nano Banana）：文生图、图片编辑、多参考图融合、多轮编辑、视频转图、Google 搜索 Grounding、Thinking 模式，最高 4K 分辨率。

## 简介

**Nano Banana** 是 Gemini 原生图像生成能力的统称，对应三个模型：

| 别称 | 模型 ID | 定位 |
| --- | --- | --- |
| **Nano Banana 2** | `gemini-3.1-flash-image` | 速度 / 成本 / 智能的最佳平衡（默认） |
| **Nano Banana Pro** | `gemini-3-pro-image` | 专业资产生产，复杂指令、高保真文字 |
| **Nano Banana** | `gemini-2.5-flash-image` | 高吞吐、低延迟 |

插件基于 Gemini `generateContent` REST API 封装 3 个节点。生成的图片会经服务端落盘后以可访问的 URL 返回。

插件类型：`server`。

## 前置准备

1. 在 [Google AI Studio](https://aistudio.google.com/apikey) 申请 **Gemini API Key**
2. 在 Agent Spaces 插件中心安装并启用本插件，填入 API Key

## 配置说明

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `apiKey` | 是 | — | Google Gemini API Key |
| `baseUrl` | 否 | `https://generativelanguage.googleapis.com` | API 基础地址，支持代理 |

## 节点清单

| 节点 | 用途 |
| --- | --- |
| `nano_banana_create_image` | 文生图（含 Grounding / Thinking） |
| `nano_banana_edit_image` | 图片编辑 / 多参考图融合 / 多轮编辑 / 视频转图 |
| `nano_banana_models` | 列出可用 Gemini 模型（仅工作流节点） |

## 节点字段速查

### nano_banana_create_image

- `prompt`：图像描述（必填）。**叙事性段落优于关键词堆砌**
- `model`：`gemini-3.1-flash-image`（默认） / `gemini-3-pro-image` / `gemini-2.5-flash-image`
- `responseModalities`：`auto`（文本 + 图片，默认） / `image`（仅图片）
- `aspectRatio`：`auto` / `1:1` / `16:9` / `9:16` / `3:4` / `4:3` / `3:2` / `2:3` / `4:5` / `5:4` / `21:9`，3.1 Flash 额外支持 `1:4` / `4:1` / `1:8` / `8:1`
- `imageSize`：`default`（1K，默认） / `512`（仅 3.1 Flash） / `1K` / `2K` / `4K`。**注意大写 K，512 无 K**
- `googleSearch`：开启 Google 搜索 Grounding（基于天气 / 新闻 / 股价等实时信息生图）
- `imageSearch`：图片搜索（**仅 3.1 Flash**，不能搜索人物）
- `thinkingLevel`：思考级别（**仅 flash-image**）：`minimal`（最低延迟） / `high`
- `includeThoughts`：在响应中返回思考过程
- 出参 `data`：`images[]`、`text`、`thoughts`、`model`、`groundingMetadata`

### nano_banana_edit_image

- `prompt`：编辑指令（必填）
- `image`：参考图，支持 URL / 本地路径 / data URI / JSON 数组，**Gemini 3 最多 14 张**（高保真 / 角色一致性数量另有上限，见官方文档）
- `videoUrl`：视频 URL（**仅 3.1 Flash**），YouTube URL 或 Files API URI，用于视频转图
- `history`：多轮编辑历史（Gemini `contents` 数组 JSON），用于迭代编辑
- 其他字段同 `nano_banana_create_image`
- 出参同上

### nano_banana_models

- 无入参，列出当前账号可用的全部 Gemini 模型（含 `supportedGenerationMethods`）

## 使用示例

**示例 1：基础文生图**

```
model = gemini-3.1-flash-image
prompt = 一只可爱的柴犬图标，白色背景，3D 立体卡通风
aspectRatio = 1:1
imageSize = 2K
```

**示例 2：Google 搜索 Grounding（实时天气图）**

```
model = gemini-3.1-flash-image
prompt = 用简洁现代的图表可视化旧金山未来 5 天的天气预报，并附上每天该穿什么
googleSearch = true
aspectRatio = 16:9
```

**示例 3：图片编辑（加帽子）**

```
model = gemini-3.1-flash-image
prompt = 给这只猫戴上一顶针织小巫师帽，保持照片原本的柔和光线
image = https://example.com/cat.jpg
```

**示例 4：多参考图融合（团队合影）**

```
model = gemini-3.1-flash-image
prompt = 这些人的办公室合影，他们正在做鬼脸
image = ["https://.../p1.png","https://.../p2.png","https://.../p3.png"]
aspectRatio = 5:4
imageSize = 2K
```

**示例 5：多轮迭代编辑（先生成后改语言）**

第二轮把 `history` 填入第一轮的 contents，再发新指令：

```
model = gemini-3.1-flash-image
prompt = 把这张信息图改成西班牙语，不要改动其他元素
history = [{"role":"user","parts":[{"text":"生成光合作用的儿童食谱风信息图"}]},{"role":"model","parts":[{"inline_data":{"mime_type":"image/png","data":"<上一轮 base64>"}}]}]
googleSearch = true
```

> 多轮编辑时建议回传 `thought_signature`（若响应包含），以保证上下文一致性。

## 模型能力对照

| 能力 | 3.1 Flash | 3 Pro | 2.5 Flash |
| --- | :-: | :-: | :-: |
| 最高分辨率 | 4K（含 512） | 4K | 1K（1024） |
| Google 搜索 Grounding | ✅（含 Image Search） | ✅ | ❌ |
| Thinking 级别控制 | ✅ | ✅（默认，不可关） | ❌ |
| 多参考图上限 | 10 对象 + 4 角色 | 6 对象 + 5 角色 | ≤ 3 |
| 视频转图 | ✅ | ❌ | ❌ |
| 额外宽高比（1:4 等） | ✅ | ❌ | ❌ |

## 常见问题

- **400 INVALID_ARGUMENT**：宽高比 / 分辨率与模型不匹配（如 512 用在非 3.1 Flash、`1:4` 用在 Pro）；参考图数量超限。
- **401 / 403**：API Key 无效或无对应模型权限。
- **`imageSize` 拼写**：必须大写 `K`（`1K`/`2K`/`4K`），小写 `1k` 会被拒绝；`512` 不带 K。
- **图片输入**：URL / 本地路径 / `data:image/...;base64,...` 均可；多图传 JSON 数组字符串。
- **Image Search 不能搜人物**：Gemini 3.1 Flash 的图片搜索明确不支持搜索真实人物。
- **透明背景不支持**：模型无法生成透明背景，请改用白色背景。
- **SynthID 水印**：所有生成图片均含 SynthID 水印。

## 依赖

- 无外部依赖，直接调用 Gemini REST API（`generativelanguage.googleapis.com`）。
