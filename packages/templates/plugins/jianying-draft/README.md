# 剪映草稿导入 插件

> 通过 [pyJianYingDraft](https://github.com/Doeveron/pyJianYingDraft) 的 HTTP 服务，把预设数据导入为剪映（JianYing / CapCut）草稿。

## 简介

本插件对接 `pyJianYingDraftServer`（FastAPI 服务，默认 `http://127.0.0.1:8000`），把剪映「预设数据」（`preset_data`）提交为异步任务，服务端会下载素材并生成可在剪映中打开的草稿目录（`draft_path`）。

插件类型：`server`。

核心链路：**提交 preset_data → 轮询任务 → 返回 draft_path**（一步到位，节点内部自动等待完成）。

## 前置准备

1. 安装并启动 [pyJianYingDraft](https://github.com/) 配套服务 `pyJianYingDraftServer`（默认监听 `http://127.0.0.1:8000`）。
2. 准备好 `preset_data`：一份完整的剪映预设 JSON，至少包含 `ruleGroup`、`materials`、`testData` 三个字段。可参考 pyJianYingDraft 仓库的 `coze-plugin/data/full-request.json`。
3. 在 Agent Spaces 插件中心安装并启用本插件，按需修改「API 地址」配置。

## 配置说明

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `apiBase` | `http://127.0.0.1:8000` | pyJianYingDraft 服务地址 |
| `timeout` | `300` | 提交后等待任务完成的超时（秒） |
| `interval` | `3` | 轮询任务状态的时间间隔（秒） |

## 节点清单

| 节点 / 工具 | 类型 | 用途 |
| --- | --- | --- |
| `jianying_submit_draft` | workflow node + Agent tool | 提交 preset_data，轮询到完成，返回 draft_path |
| `jianying_submit_draft_by_url` | workflow node + Agent tool | 从 URL 拉取 preset JSON 后提交并等待完成 |
| `jianying_get_task_result` | workflow node + Agent tool | 按 task_id 查询任务当前状态（不轮询） |
| `jianying_validate_preset` | 仅 workflow node | 本地校验 preset_data 结构，不提交 |

## preset_data 结构

```jsonc
{
  "ruleGroup": { "id": "...", "title": "...", "rules": [/* ... */] }, // 必需
  "materials": [/* 素材列表 */],                                       // 必需
  "testData": { "tracks": [/* ... */], "items": [/* ... */] },        // 必需
  "segment_styles": {},   // 可选
  "raw_segments": [],     // 可选
  "raw_materials": [],    // 可选
  "canvas_width": 1080,   // 可选
  "canvas_height": 1920,  // 可选
  "fps": 30,              // 可选
  "draft_config": {}      // 可选
}
```

## 使用示例

**示例 1：提交预设数据导入草稿**

```
preset_data = { "ruleGroup": {...}, "materials": [...], "testData": {...} }   // 完整 JSON
draft_title  = 我的剪映项目
```

节点会自动轮询直到 `status === completed`，成功后返回 `data.draft_path`（剪映草稿目录），在剪映中打开即可。

**示例 2：通过 URL 导入**

```
url = https://example.com/my-draft.json
```

**示例 3：查询历史任务**

```
task_id = 20260622_abcdef
```

**示例 4：提交前先校验**

用 `jianying_validate_preset` 节点先校验 `preset_data`，确认结构无误再提交。

## 任务状态

`status` 取值：`pending`（等待）/ `downloading`（下载素材）/ `processing`（生成草稿）/ `completed`（完成）/ `failed`（失败）/ `cancelled`（已取消）。

## 常见问题

- **无法连接到 API 服务器**：确认 `pyJianYingDraftServer` 已启动，且 `apiBase` 地址正确。
- **任务超时**：调大 `timeout`，或改用 `jianying_get_task_result` 手动查询 `task_id`（提交节点超时也会返回 `task_id`，便于后续查询）。
- **校验失败：缺少必需字段**：检查 `preset_data` 是否包含 `ruleGroup`、`materials`、`testData`。
- **任务失败**：查看返回的 `message` / `data.error_message`，通常是素材 URL 不可下载或规则配置有误。

## 依赖

- 运行时依赖：本地运行的 `pyJianYingDraftServer` 服务
- 默认服务地址：`http://127.0.0.1:8000`
