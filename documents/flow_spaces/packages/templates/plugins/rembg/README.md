# Rembg 抠图插件

基于 [Rembg](https://github.com/danielgatis/rembg) HTTP 服务的一键去背景 / 抠图插件。

对接服务：`http://localhost:7000`（可通过插件配置修改）。本机服务启动方式见 `D:\rembg\API.md`（`start_gpu.bat` / `start_cpu.bat`）。

---

## 能力概览

| 节点 | 说明 | 关键参数 |
|------|------|----------|
| **去除背景** `rembg_remove` | 自适应输入，输出透明 PNG | `backgroundColor` |
| **生成掩码** `rembg_mask` | 输出黑白掩码（前景为白色） | `postProcessMask` |
| **精细抠图** `rembg_alpha_matting` | Alpha Matting，边缘更精细 | `af` / `ab` / `ae` |
| **SAM 提示分割** `rembg_sam_segment` | SAM 模型 + 点/框 prompt 精准分割 | `extras` |
| **批量去背景** `rembg_batch_remove` | 批量处理多张图片 | `images` / `backgroundColor` |

> 各节点分工独立：高级参数（Alpha Matting 阈值、掩码、SAM prompt 等）只在对应专用节点暴露，主节点保持简洁。

---

## 配置

在插件设置面板配置（3 项）：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| **Rembg Base URL** | `http://localhost:7000` | Rembg HTTP 服务地址 |
| **Default Model / 默认模型** | `u2net` | 默认分割模型，如 `u2net` / `birefnet-general` / `isnet-anime` / `sam` |
| **Timeout (ms) / 超时(ms)** | `120000` | 单张图片处理超时 |

---

## 支持的模型

`u2net` · `u2netp` · `u2net_human_seg` · `u2net_cloth_seg` · `silueta` · `isnet-general-use` · `isnet-anime` · `birefnet-general` · `birefnet-general-lite` · `birefnet-portrait` · `birefnet-dis` · `birefnet-hrsod` · `birefnet-cod` · `birefnet-massive` · `bria-rmbg` · `sam`

首次使用某模型会自动下载到 `~/.u2net/`。

---

## 输入格式

图片输入字段自动识别三种形式：

- **URL**：`https://example.com/input.png` 或本地服务 `http://127.0.0.1:3000/...`
- **本地路径**：`G:/images/photo.jpg`
- **data URI**：`data:image/png;base64,iVBOR...`

批量节点输入为 JSON 数组：

```json
["https://example.com/a.png", "G:/images/b.jpg"]
```

### ⚠️ 关于本地 / 内网图片 URL

Rembg 服务端对 `GET /api/remove?url=` 有 **SSRF 防护**，会拒绝回环 / 内网地址（`127.0.0.1`、`192.168.x.x` 等）。

本插件**所有 URL 输入都改为「客户端先下载 + POST 上传」**，绕过该限制，因此 `http://127.0.0.1:3000/...` 这类本地图片可正常处理。

---

## 输出

所有节点返回结果图片的 `imageUrl`（公网可访问 httpPath，由宿主 `savePublicFile` 落盘），可在工作流中直接被下游节点引用展示。

单图节点输出字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | 是否成功 |
| `message` | string | 结果描述（含文件大小） |
| `data.imageUrl` | string | 结果图片 URL |
| `data.size` | number | 结果图片字节数 |
| `data.model` | string | 实际使用的模型 |

批量节点额外输出 `data.total`、`data.successCount`、`data.results[]`（每项含 `input`/`success`/`imageUrl`/`error`）。

---

## 高级参数说明

仅在对应专用节点出现，对应 Rembg API 通用参数：

| 参数 | 范围 | 默认 | 说明 |
|------|------|------|------|
| `af` | 0–255 | 240 | Alpha Matting 前景阈值 |
| `ab` | 0–255 | 10 | Alpha Matting 背景阈值 |
| `ae` | ≥0 | 10 | Alpha Matting 侵蚀尺寸 |
| `om` (maskOnly) | bool | false | 仅返回黑白掩码 |
| `ppm` (postProcessMask) | bool | false | 掩码后处理（平滑/细化） |
| `bgc` (backgroundColor) | `R,G,B,A` / `#RRGGBB` | 空 | 纯色背景（空=透明） |
| `extras` | JSON | — | 透传给 rembg 的额外参数（如 SAM prompt） |

### SAM prompt 示例

SAM 节点的 `extras` 字段：

```json
{
  "sam_prompt": [
    { "type": "point", "data": [724, 740], "label": 1 }
  ]
}
```

> `label`：`1` = 前景点，`0` = 背景点；也支持 `{ "type": "box", "data": [x1,y1,x2,y2] }`。

---

## 故障排查

| 报错 | 原因 / 解决 |
|------|-------------|
| `Failed to parse URL from {{ __config__... }}` | 配置占位符未替换 → 检查 actions.js 的 `CONFIG_PREFIX` 是否为 `{{ __config__["workflow.rembg"]`（注意 `]`） |
| `Requests to private/internal addresses are not allowed` | 不应再出现；插件已统一走 POST 上传。若仍出现说明运行时副本未同步，重新覆盖 `agent-spaces-data/plugins/rembg/` |
| `Rembg HTTP 422` | 模型名拼错 → 对照「支持的模型」列表 |
| 连接超时 | rembg 服务未启动，或 Base URL / 端口不对；首次加载大模型也会慢，可调大超时 |

---

## 多语言

`lang.json` 维护中英双语（41 个 key），覆盖节点 label / category / 字段提示 / 执行结果 message。`info.json` 的 `name`/`description`/`tags` 带 `_zh`/`_en`。

---

## 参考

- 项目仓库：https://github.com/danielgatis/rembg
- API 文档（运行时）：http://localhost:7000/api
- 本插件对接规范：`D:\rembg\API.md`
