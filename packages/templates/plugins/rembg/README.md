# Rembg 抠图插件

基于 [Rembg](https://github.com/danielgatis/rembg) HTTP 服务的一键去背景/抠图插件。

对接服务：`http://localhost:7000`（可通过插件配置修改）。服务启动方式见 `D:\rembg\API.md`，本机通过 `start_gpu.bat` / `start_cpu.bat` 启动。

## 能力

| 动作 | 说明 |
|------|------|
| 去除背景 (`rembg_remove`) | 自适应输入（URL / 本地路径 / data URI），输出透明 PNG |
| 生成掩码 (`rembg_mask`) | 输出黑白掩码（前景为白色） |
| 精细抠图 (`rembg_alpha_matting`) | 启用 Alpha Matting，边缘更精细，支持阈值参数 |
| SAM 提示分割 (`rembg_sam_segment`) | 用 SAM 模型 + 点/框 prompt 精准分割指定目标 |
| 批量去背景 (`rembg_batch_remove`) | 批量处理多张图片，JSON 数组输入 |

支持的所有通用参数：`model`、`a/af/ab/ae`(Alpha Matting)、`om`(仅掩码)、`ppm`(掩码后处理)、`bgc`(纯色背景)、`extras`(SAM prompt 等)。

## 配置

在插件设置中配置：

- **Rembg Base URL**：服务地址，默认 `http://localhost:7000`
- **默认模型**：默认分割模型，如 `u2net` / `birefnet-general` / `isnet-anime` / `sam`
- **请求超时(ms)**：单张图片处理超时

## 支持的模型

`u2net` / `u2netp` / `u2net_human_seg` / `u2net_cloth_seg` / `silueta` / `isnet-general-use` / `isnet-anime` / `birefnet-general` / `birefnet-general-lite` / `birefnet-portrait` / `birefnet-dis` / `birefnet-hrsod` / `birefnet-cod` / `birefnet-massive` / `bria-rmbg` / `sam`

## 输入格式

图片输入字段接受三种形式（插件自动识别）：

- **URL**：`https://example.com/input.png`
- **本地路径**：`G:/images/photo.jpg`
- **data URI**：`data:image/png;base64,iVBOR...`

批量处理输入为 JSON 数组：`["https://...", "/path/to/img.png"]`

## 输出

所有动作返回结果图片的 `imageUrl`（公网可访问 httpPath，由宿主 `savePublicFile` 落盘），可在工作流中直接被下游节点引用展示。
