# Depth Anything 深度估计插件

基于 [Depth Anything](https://github.com/DepthAnything/Depth-Anything-V2) HTTP 服务的单目深度估计插件。

对接服务：`http://localhost:7860`（可通过插件配置修改）。本机服务启动方式见 `G:\Depth-Anything\API.md`（`python server.py`）。

---

## 能力概览

| 节点 | 说明 | 关键参数 |
|------|------|----------|
| **单图深度估计** `depth_predict` | 自适应输入，输出深度图 PNG | `grayscale` / `pred_only` |
| **批量深度估计** `depth_batch_predict` | 调用 `/predict/batch` GPU 并行推理（每批 4 张），自动解 ZIP 落盘 | `images` / `grayscale` / `pred_only` |

> 批量节点原生调用服务端批量接口：最多 16 张图打包上传，服务端按 `MAX_BATCH=4` 分组 GPU 并行推理，结果以 ZIP 返回。插件自动按 16 张切片、解压并逐张落盘。

---

## 配置

在插件设置面板配置（2 项）：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| **Depth Anything Base URL** | `http://localhost:7860` | HTTP 服务地址 |
| **Timeout (ms) / 超时(ms)** | `120000` | 单张图片处理超时 |

> 服务端 encoder（`vits` / `vitb` / `vitl`）在 `server.py` 顶部配置，需重启服务生效，本插件不覆盖。

---

## 输入格式

图片输入字段自动识别三种形式：

- **URL**：`https://example.com/input.png`
- **本地路径**：`G:/images/photo.jpg`
- **data URI**：`data:image/png;base64,iVBOR...`

批量节点输入为 JSON 数组：

```json
["https://example.com/a.png", "G:/images/b.jpg"]
```

---

## 输出参数说明

| 参数 | 可选值 | 默认 | 说明 |
|------|--------|------|------|
| `grayscale` | `true` / `false` | `true` | `true`=灰度深度图；`false`=Inferno 彩色热力图 |
| `pred_only` | `true` / `false` | `true` | `true`=仅深度图；`false`=原图 + 深度图左右拼接 |

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
| `data.savedAs` | string | 服务端保存的文件名（`X-Saved-As` 响应头，可能为空） |

批量节点额外输出 `data.total`、`data.successCount`、`data.results[]`（每项含 `input`/`success`/`imageUrl`/`filename`/`error`）。

---

## 故障排查

| 报错 | 原因 / 解决 |
|------|-------------|
| `Failed to parse URL from {{ __config__... }}` | 配置占位符未替换 → 检查 actions.js 的 `CONFIG_PREFIX` 是否为 `{{ __config__["workflow.depth-anything"]` |
| `Depth Anything HTTP 400`（批量）| 文件数超 16 张 → 插件已自动按 16 张切片，若仍报错检查服务端 `MAX_FILES` 配置 |
| `Depth Anything HTTP 400/500` | 上传文件无效或服务端推理异常 → 确认图片格式（JPG/PNG/WEBP）|
| `Invalid zip: EOCD not found` | 批量响应不是合法 ZIP → 通常是服务端报错但返回了 JSON，检查 Base URL 是否指向支持 `/predict/batch` 的版本 |
| 连接超时 | 服务未启动，或 Base URL / 端口不对；首次加载 vitl 权重也会慢，可调大超时 |

---

## 多语言

`lang.json` 维护中英双语，覆盖节点 label / category / 字段提示 / 执行结果 message。`info.json` 的 `name`/`description`/`tags` 带 `_zh`/`_en`。

---

## 参考

- 项目仓库：https://github.com/DepthAnything/Depth-Anything-V2
- 本插件对接规范：`G:\Depth-Anything\API.md`
