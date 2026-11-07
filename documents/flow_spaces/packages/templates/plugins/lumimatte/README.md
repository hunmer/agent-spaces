# LumiMatte 图像处理插件

基于 [LumiMatte Server](G:\LumiMatte-main\lumi-matte-server)（FastAPI + 进程内离线推理，无授权限制）的图像处理插件。

对接服务：`http://127.0.0.1:8317`（可通过插件配置修改）。服务启动方式见 `G:\LumiMatte-main\lumi-matte-server\API.md`（`start.bat` 或 `uvicorn app.main:app --port 8317`）。

---

## 能力概览

| 节点 | 说明 | 关键参数 |
|------|------|----------|
| **AI 智能抠图** `lumimatte_matting` | ISNet 高精度抠图，输出透明 PNG | `image` |
| **批量 AI 抠图** `lumimatte_batch_matting` | 批量处理多张图片（服务端串行推理） | `images` (JSON 数组) |
| **智能局部消除** `lumimatte_inpaint` | LaMa 无痕擦除遮罩区域（路人/水印/瑕疵） | `image` + `mask` |
| **画质超分放大** `lumimatte_super_res` | 2x/4x 零色偏超分 + 面部增强 | `scale` / `denoiseLevel` / `faceEnhance` / `tileSize` |
| **导出 PSD** `lumimatte_export_psd` | 原生 8BPS 分层 PSD，图层可带真实像素 | `width` / `height` / `layers` / `filename` |
| **服务健康检查** `lumimatte_status` | 版本 / 加速器 / 平台 | — |
| **模型清单** `lumimatte_models` | 已安装离线模型列表 | — |

---

## 配置

在插件设置面板配置（2 项）：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| **LumiMatte Base URL** | `http://127.0.0.1:8317` | LumiMatte HTTP 服务地址 |
| **Timeout (ms) / 超时(ms)** | `300000` | 单次请求超时 |

> 首次调用某引擎会加载模型（约 10~30s），4x 超分可达 30s+，超时不宜设小。推理全局串行化，避免并发提交大图。

---

## 输入格式

图片字段（`image` / `mask`）自动识别三种形式：

- **URL**：`https://example.com/input.png`
- **本地路径**：`G:/images/photo.jpg`
- **data URI**：`data:image/png;base64,iVBOR...`

`mask` 要求：**白色 = 待消除区域，黑色 = 保留**，且与原图同尺寸。

批量抠图输入为 JSON 数组：

```json
["https://example.com/a.png", "G:/images/b.jpg"]
```

`layers` 为 JSON 数组（自下而上），每项字段均可省略。**带 `imageData` 的图层写入真实 RGBA 像素**（`imageData` 支持 URL / 本地路径 / data URI，由插件解析后上传）；`rect` 缺省时取图像原始尺寸锚定左上角，显式指定则缩放到该边界；未提供 `imageData` 的图层保持全白占位：

```json
[
  { "name": "背景照片", "imageData": "G:/images/bg.png" },
  { "name": "人物", "imageData": "G:/images/person.png", "top": 0, "left": 100, "bottom": 800, "right": 700, "opacity": 0.9 },
  { "name": "占位层", "opacity": 0.5 }
]
```

> 需要 LumiMatte Server 支持 `layers[].imageData`（`psd.py` 带 Pillow 解码的版本）；旧版服务端会忽略该字段，图层保持全白。

---

## 输出

图片类节点结果由宿主 `savePublicFile` 落盘，返回 `imageUrl`（httpPath），可在工作流中被下游节点直接引用。

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | 是否成功 |
| `message` | string | 结果描述（含大小/耗时） |
| `data.imageUrl` / `data.fileUrl` | string | 结果文件 URL |
| `data.size` / `data.sizeBytes` | number | 文件字节数 |
| `data.model` | string | 实际使用的模型 |
| `data.durationMs` | number | 服务端推理耗时 |

批量抠图节点额外输出 `data.total`、`data.successCount`、`data.results[]`（每项含 `input`/`success`/`imageUrl`/`error`），单张失败不影响其余图片。

---

## 故障排查

| 报错 | 原因 / 解决 |
|------|-------------|
| `fetch failed` / 连接拒绝 | LumiMatte 服务未启动，或 Base URL / 端口不对 |
| `LumiMatte request timeout after ...ms` | 首次加载模型慢或图过大，调大超时配置 |
| `LumiMatte HTTP 500: 缺失输入图像数据` | 图片字段为空或解析失败 |
| 下载图片失败 HTTP xxx | URL 输入无法访问（本插件由客户端下载后转 base64 上传） |
| 请求体超 100MB 被 413 | 输入图片过大，先压缩或降分辨率 |

---

## 多语言

`lang.json` 维护中英双语，覆盖节点 label / category / 字段提示 / 执行结果 message。`info.json` 的 `name`/`description`/`tags` 带 `_zh`/`_en`。

---

## 参考

- API 文档：`G:\LumiMatte-main\lumi-matte-server\API.md`
- 交互式文档：http://127.0.0.1:8317/docs
- 环境变量：`PORT`（默认 8317）、`HOST`（默认 127.0.0.1）、`LUMIMATTE_MODELS_DIR`
