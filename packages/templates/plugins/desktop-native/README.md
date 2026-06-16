# 桌面原生 插件

> 在 Workflow 中调用桌面应用原生的剪贴板、系统通知、文件对话框、文件管理器等能力。

## 简介

本插件把 Electron / Tauri 等桌面运行时提供的原生能力封装为一组 Workflow 动作节点，让 Agent 在执行工作流时能够与用户操作系统交互。

插件类型：`client`（运行在桌面客户端进程中）。

## 节点清单

### 剪贴板

| 节点 | 用途 |
| --- | --- |
| `read_clipboard` | 读取剪贴板文本内容 |
| `write_clipboard` | 写入文本到剪贴板 |
| `read_clipboard_image` | 读取剪贴板图片，返回 base64 DataURL |
| `write_clipboard_image` | 将图片写入剪贴板（DataURL） |
| `clear_clipboard` | 清空剪贴板 |

### 系统通知与提示

| 节点 | 用途 |
| --- | --- |
| `show_notification` | 发送系统桌面通知 |
| `show_message_box` | 显示系统消息框（同步返回按钮索引） |
| `show_error_box` | 显示系统错误对话框 |
| `beep` | 播放系统提示音 |

### 文件与路径

| 节点 | 用途 |
| --- | --- |
| `show_item_in_folder` | 在文件管理器中显示文件并选中 |
| `open_path` | 用系统默认应用打开文件 / 文件夹 |
| `open_external` | 用系统默认浏览器打开 URL |

### 文件对话框

| 节点 | 用途 |
| --- | --- |
| `show_open_dialog` | 显示系统「打开」文件选择框 |
| `show_save_dialog` | 显示系统「保存」对话框 |

## 输入输出示例

**show_notification**

- 入参：
  - `title`：通知标题（必填）
  - `body`：通知正文
  - `silent`：是否静默（无声音），默认 `false`
- 出参：无

**show_open_dialog**

- 入参：
  - `title`：对话框标题
  - `filters`：JSON 数组，如 `[{"name":"Images","extensions":["png","jpg"]}]`
  - `properties`：JSON 数组，常见取值 `["openFile"]` / `["openFile","multiSelections"]` / `["openDirectory"]`
- 出参 `data.filePaths`：选中的文件路径数组

**show_message_box**

- 入参：
  - `title`、`message`（必填）
  - `type`：`none` / `info` / `warning` / `error` / `question`
  - `buttons`：JSON 数组，自定义按钮文本
- 出参 `data.response`：用户点击按钮的索引

**read_clipboard_image**

- 入参：无
- 出参 `data.dataUrl`：`data:image/png;base64,...` 格式的图片

## 使用示例

1. **「复制 AI 回答到剪贴板」工作流**：调用 `write_clipboard` 把模型输出写入剪贴板
2. **「任务完成通知」工作流**：调用 `show_notification` 在任务完成时弹出系统通知
3. **「批量处理用户文件」工作流**：先 `show_open_dialog` 拿到文件列表，再传给后续处理节点

## 常见问题

- **通知不显示**：检查操作系统的「勿扰模式 / 通知权限」是否放行了本应用。
- **图片剪贴板读写失败**：仅支持 PNG / JPEG；Windows 平台需要应用为前台焦点时才能写入。
- **`show_message_box` 阻塞工作流**：这是同步节点，会等待用户点击；如需异步请自行改造。
- **macOS 文件权限**：首次访问文件 / 文件夹时会触发系统授权弹窗。

## 适用场景

- 自动化办公流程中需要与用户桌面交互
- 剪贴板辅助（复制 AI 回答、贴图等）
- 桌面通知提醒
- 文件选择 / 保存对话框
