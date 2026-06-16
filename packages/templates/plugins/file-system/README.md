# 文件系统 插件

> 提供本地文件和目录的读写、编辑、枚举、删除、复制、重命名、状态查询等能力。

## 简介

本插件把文件系统操作封装为一组 Workflow 动作节点，覆盖文件级与目录级常用操作。Agent 在执行工作流时可以直接对本地文件进行增删改查。

插件类型：`server`。

> ⚠️ 出于安全考虑，请确认 Agent Spaces 运行时对目标目录有读写权限。生产环境建议限制可访问的根目录。

## 节点清单

### 文件操作

| 节点 | 用途 |
| --- | --- |
| `write_text_file` | 写入文本到文件（不存在则创建） |
| `write_binary_file` | 写入二进制数据（图片 / 音频等） |
| `read_file` | 读取文本文件内容 |
| `read_json` | 读取并解析 JSON 文件 |
| `write_json` | 把对象序列化为 JSON 写入文件 |
| `edit_file` | 在文件中替换指定内容 |
| `delete_file` | 删除文件 |
| `list_files` | 列举目录下的文件与子目录 |
| `file_stat` | 获取文件 / 目录详细信息 |
| `rename_file` | 重命名 / 移动 文件或目录 |
| `copy_file` | 复制文件到新路径 |

### 目录操作

| 节点 | 用途 |
| --- | --- |
| `create_dir` | 创建目录（支持递归） |
| `remove_dir` | 删除目录（可选递归 / 强制） |

## 节点字段

### write_text_file / write_binary_file

- `path`：目标文件绝对路径（必填）
- `content` / `data`：文本内容或二进制数据
- `encoding`：文本写入时使用，默认 `utf-8`

### read_file / read_json

- `path`、`encoding`
- 出参 `data.content` 或 `data.json`

### write_json

- `path`、`json`（对象 / 数组）
- `indent`：缩进空格数，`0` 输出压缩 JSON，默认 `2`

### edit_file

- `path`、`oldContent`、`newContent`
- 仅做单次字符串替换；不匹配时会报错

### list_files

- `path`：目录路径
- `recursive`：是否递归，默认 `false`
- `pattern`：文件名通配符，例如 `*.txt`
- 出参 `data.files[]`：含 `name`、`path`、`type`

### file_stat

- `path`
- 出参 `data`：`isFile`、`isDirectory`、`size`、`createdAt`、`modifiedAt`

### create_dir / remove_dir

- `path`
- `recursive`（创建时默认 `true`，删除时默认 `false`）
- `force`：删除时若目录不存在不报错，默认 `false`

### rename_file / copy_file

- `oldPath` / `newPath`，或 `src` / `dest`

## 使用示例

**示例 1：保存模型输出为 JSON**

1. 拖入「Write JSON File」节点
2. `path = /tmp/result.json`、`json` 接上游数据
3. `data.path` 返回最终写入路径

**示例 2：批量替换文件中的字符串**

1. 拖入「Read File」节点 → 拿到 `data.content`
2. 替换处理后 → 拖入「Write Text File」节点回写

**示例 3：清理旧文件**

1. 「List Files」拿到 `*.log` 列表
2. 循环调用「Delete File」删除

## 常见问题

- **`ENOENT` 找不到文件**：检查 `path` 是否为绝对路径，文件名 / 后缀是否正确。
- **`EACCES` 权限不足**：换用有写权限的目录，或在 OS 层授权。
- **edit_file 替换失败**：`oldContent` 在文件中出现多次 / 出现 0 次都会失败，请先读出来核对。
- **大文件读入慢**：节点会一次性把文件读入内存；>200 MB 请使用流式节点。
- **跨平台路径分隔符**：建议统一用 `/` 或 `path.join()` 处理。

## 安全建议

- 限制 Agent 可访问的目录（沙箱 / 工作区）
- 删除前先备份到回收站（可自行封装一层）
- 写入前校验路径，避免越权写入
