# 独立 SAM 插件接入计划

## 目标
新增 Agent Spaces SAM 插件，接入 `G:/spine-animation-ai-workspace/spine-animation-ai/reskin-app/sam_server`，替换 game-asset-canvas 换肤中的 rembg SAM 路径。`bg_components` 仍可继续使用 rembg 去背景，不在本任务移除。

## 成功标准
- SAM 模式不调用 `workflow.rembg/rembg_sam_segment`。
- 一次插件调用提交整张分割源和全部 region boxes，不再逐 region 重复请求。
- 插件调用原服务 `POST /segment_with_boxes`，正确解包全部 `mask_b64/score/slot_id`。
- 前端把全图 mask 应用到对应 region，材质 RGB 来自 AI 生成图，mask 只控制 alpha。
- SAM 服务不可用或部分 mask 缺失时有明确日志与逐 region 降级，不产出白色 skin。
- 插件单测、reskin pipeline 单测、Babel 检查和一次真实 end-to-end 请求通过。

## 阶段
- [completed] 0. 撤销 rembg box/rectangle 兼容修改
- [completed] 1. 创建独立 SAM 插件及模板
  - 使用 `plugin-creator` skill，参考 `packages/server/agent-spaces-data/plugins/rembg` 的 server action 结构。
  - 创建实际插件 `packages/server/agent-spaces-data/plugins/sam/`，至少包含 `info.json/main.js/actions.js/shared.js/tools.js/README.md/lang.json/icon.png`。
  - 同步模板 `packages/templates/plugins/sam/`，随后运行 `node packages/templates/generate-index.mjs` 重建三份商店索引。
  - plugin id：`workflow.sam`；action：`sam_segment_with_boxes`；可选增加 `sam_health`。
  - 配置：`baseUrl=http://127.0.0.1:30231`、`timeout=600000`。
- [completed] 2. 插件单元测试与真实服务契约测试
  - `shared.js` 支持 image URL/data URI/local path，统一得到图片 Buffer/base64。
  - 一次 POST `${baseUrl}/segment_with_boxes`，body 严格为 `{image_base64, boxes}`。
  - 校验 HTTP、JSON、masks 数组、slot_id、mask_b64；将每个 mask 用 `ctx.api.savePublicFile(..., 'png')` 落盘。
  - action 返回 `{success,data:{masks:[{slotId,score,maskUrl}],total}}`，不把 mask_b64 传给浏览器。
  - 测试必须断言：N 个 boxes 只产生 1 次上游 HTTP 请求、N 个 mask 文件、错误响应保留服务端 detail。
  - 启动原服务后做 `GET /health` 和至少 2 boxes 的真实请求。
- [completed] 3. 改造 reskinPipeline 为一次批量 SAM 调用
  - 增加 `SAM_PLUGIN = 'workflow.sam'`；保留 `REMBG_PLUGIN` 仅供 `bg_components/rembg_remove` 和局部重绘去背景。
  - 将 `segRegions` 一次映射为 `{slot_id:name,x_min:x,y_min:y,x_max:x+w,y_max:y+h}`。
  - segmentSource 只上传一次，只调用一次 `sam_segment_with_boxes`。
  - 按 slotId 建 mask map；严格校验每个 region 都有 mask，缺失则整次 SAM 换肤失败并明确列出缺失项，不静默产出白图。
  - mask PNG 是灰度图：从 segmentSource 裁 RGB，从 mask 的 R/灰度通道生成 alpha；绝不能把 mask PNG 当材质图片。
  - region 有 rotate 时，生成图与 mask 都用 `cropRegionRotated` 做相同旋转后再局部合成。
  - 对局部 mask 做与参考 Python 一致的 close/侵蚀；至少为 close/alpha 应用添加纯函数测试。
- [completed] 4. 更新 manifest、文档和处理记录展示
  - `manifest.json.enabledPlugins` 增加 `workflow.sam`，保留 `workflow.rembg`（形状交集仍用去背景）。
  - `spine-editor-handoff.md`、`src/CLAUDE.md` 更新调用链和插件职责。
  - 生成记录加入 SAM source、mask 数量/score；如展示 mask，使用插件返回的服务端 maskUrl。
- [completed] 5. 完整验证与清理
  - 插件单测 + reskin 单测 + Spine 单测 + Babel + `git diff --check`。
  - 使用真实角色执行 SAM 换肤；逐项比较“AI 生成图 RGB / mask / masked region / preview atlas / repack atlas”。
  - 确认一次换肤网络面板只有 1 次 `sam_segment_with_boxes`，没有 `rembg_sam_segment`。
  - 清理调试日志；保留必要的结构化执行日志和生成记录。

## 关键约束
- 不修改 Python `site-packages/rembg`。
- 不复用 rembg 的 `sam` model。
- 不逐 region 调 SAM；必须批量 boxes，一次 set_image/embedding。
- 新插件 id 建议 `workflow.sam`，tool 建议 `sam_segment_with_boxes`。
- baseUrl 配置默认 `http://127.0.0.1:30231`，超时至少 600000ms。
- 保留工作区已有无关改动。
- 当前 `127.0.0.1:30231/health` 不可连接；真实验收前必须先启动 sam_server。

## 错误记录
| 错误 | 尝试 | 处理 |
|---|---:|---|
| 并行读取中 `rg` 无匹配返回 1，导致整组输出丢失 | 1 | 分开读取，不再将可选搜索与必读文件绑定 |
| 组合读取末尾插件测试 `rg` 无匹配返回 1，工具整体标记失败 | 1 | 必读内容已成功读取；后续把可选搜索拆成独立命令并容忍无匹配 |
| 当前 `python` 指向 Hermes venv，启动 SAM 服务时缺少 Flask | 1 | 查找项目已有 venv/系统 Python；无可用环境时使用临时最小依赖环境验证 opencv backend |
