# 独立 SAM 插件调研发现

## 已确认服务契约
- 服务目录：`G:/spine-animation-ai-workspace/spine-animation-ai/reskin-app/sam_server`。
- 健康检查：`GET /health`。
- 分割接口：`POST /segment_with_boxes`。
- 请求：`{ image_base64, boxes: [{ slot_id, x_min, y_min, x_max, y_max }] }`。
- 响应：`{ masks: [{ slot_id, score, mask_b64 }] }`。
- 参考客户端：`reskin-app/app/backend/ai/sam_provider.py`。
- 参考实现明确说明：整图 embedding 只计算一次，然后批量处理 boxes。

## 当前 game-asset-canvas 状态
- `reskinPipeline.js` 的 SAM 分支目前通过 `workflow.rembg/rembg_sam_segment` 逐 region 调用。
- 当前 helper `samBoxPrompt()` 和 rembg prompt schema 都应由新插件契约替换，不应继续修补 rembg。
- `bg_components` 分支仍依赖 `workflow.rembg/rembg_remove`，因此 manifest 暂时仍需保留 `workflow.rembg`。

## 插件输出设计
- 不把 `mask_b64` 直接返回 mini-app；插件将每个 mask 保存为公共 PNG，返回 `maskUrl`。
- 推荐 action 输出：`{ success, message, data: { masks: [{ slotId, score, maskUrl }], total } }`。
- 原服务输出 PNG 是灰度 mask，不含生成图 RGB。mini-app 必须使用生成图 RGB，并仅将 mask 灰度写入 alpha。
- 原服务当前未运行：`GET http://127.0.0.1:30231/health` 被拒绝连接。

## 新插件文件与注册
- 实际插件目录：`packages/server/agent-spaces-data/plugins/sam/`。
- 商店模板目录：`packages/templates/plugins/sam/`。
- 商店索引生成命令：`node packages/templates/generate-index.mjs`。
- mini-app 严格 allowlist：`manifest.json.enabledPlugins` 必须增加 `workflow.sam`。
- `plugin-guide.md` 推荐 server 插件通过 `main.js` 调用 `context.registerActions(actions)`；`workflow.js`、`tools.js` 保留空兼容入口。
- 现有 rembg 插件已经提供 URL/data URI/本地路径转 Buffer 与 `ctx.api.savePublicFile` 的成熟模式，可在独立 SAM 插件中最小化复用其结构，但不能复用 rembg SAM action。
- Python `sam_server.py` 默认端口为 30231，`POST /segment_with_boxes` 在一次 `set_image` 后循环全部 boxes；错误体字段为 `error`，插件错误解析需保留该字段。
- 可用的 `plugin-creator` 技能专用于 Codex `.codex-plugin/plugin.json`，与本仓库 Agent Spaces `info.json` 插件格式不兼容；不运行其脚手架，以项目 `plugin-guide.md` 和现有 server 插件为准。
- handoff 提到的 `docs/skills/write-mini-app-code/SKILL.md` 在 game-asset-canvas 及 packages 搜索范围内不存在，后续遵循现有 mini-app 代码与测试惯例。

## mask 应用注意事项
- 一次请求返回的是全图 mask；每个 mask 的尺寸应等于 segmentSource。
- 浏览器加载灰度 PNG 后 alpha 通常仍是 255，真实 mask 值在 RGB/R 通道；不能读取图片 alpha 当 mask。
- 正确流程：加载全图 mask -> 同 region bbox/rotate 裁 mask -> 读取灰度 -> 乘到生成图 region 的 alpha -> 可选 close -> erosion。
- 任一 region mask 缺失时应失败，不要静默使用未抠背景的白底裁图。
- 现有 `shapeSegmenter.applyMaskToRegion` 会把整图 `Uint8Array` mask 乘入生成图 bbox 的 alpha，适合作为新 SAM 路径的 RGB 保留边界；对 rotate region 应在应用 alpha 后再按 `cropRegionRotated` 做相同旋转。
- 插件商店索引会枚举模板插件目录内全部文件，因此测试放在 `packages/server/test/`，不随插件下发；插件目录可增加零依赖 `package.json` 声明 `type: commonjs`，便于 Node 测试直接 require，同时不会触发依赖安装。
- 真实 opencv backend 双框响应成功，但参考 `sam_server.py` 对 OpenCV 已是 0/255 的 uint8 mask 再乘 255，PNG extrema 实际为 0/1；前端灰度解析对 `max===1` 做 255 倍归一化，SAM/SAM2 的标准 0/255 输出不变。
- `.gitignore` 明确忽略 `packages/server/agent-spaces-data/plugins/*`，该目录是本机运行时副本；可提交 canonical 插件在 `packages/templates/plugins/sam/`。单测必须加载模板插件，实际副本通过逐文件 SHA-256 一致性检查。

## 已撤销
- 已撤销 rembg 实际插件和模板中的 `box -> rectangle` 兼容层。
- 已恢复 rembg README、换肤管线 helper/test、CLAUDE 和 handoff 的本轮契约修改。
