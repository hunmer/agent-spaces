# EPUB 解析器 插件

> 解析 EPUB 电子书文件，提取书籍元数据、目录（TOC）以及章节内容（HTML + CSS），方便后续做摘要、翻译、转换等处理。

## 简介

EPUB 是业界主流的电子书格式，本插件基于 `@lingo-reader/epub-parser` 把 EPUB 解包为可编程的数据结构，让 Workflow / Agent 可以：

- 读取书籍信息（标题、作者、语言、出版社、出版日期等）
- 读取目录结构（TOC）
- 按需加载指定章节的 HTML 正文和 CSS 样式

插件类型：`server`。

## 节点清单

| 节点 | 用途 |
| --- | --- |
| `epub_info` | 解析 EPUB 文件，输出元数据 + 目录 + spine 信息 |
| `epub_chapters` | 按范围加载指定章节的 HTML / CSS 内容 |

## 节点 `epub_info`

**入参**：

- `filePath`：EPUB 文件的绝对路径（必填）

**出参 `data`**：

- `fileInfo`：原始文件信息（结构由解析器决定）
- `metadata`：
  - `title`、`language`、`description`、`publisher`、`rights`、`date`
  - `creator`：作者列表
  - `subject`：主题列表
- `toc`：目录数组，每项含 `label`、`href`、`id`、`playOrder`、`children`
- `spineCount`：spine 条目数（≈ 章节总数）
- `spine`：spine 列表，含 `id`、`href`、`linear`
- `guide`：阅读引导对象（封面 / 目录 / 序言等定位）

## 节点 `epub_chapters`

**入参**：

- `filePath`：EPUB 文件的绝对路径（必填）
- `start`：起始章节索引，从 0 开始，默认 0
- `count`：加载章节数，0 表示加载到末尾，默认 1

**出参 `data`**：

- `total`：EPUB 总章节数
- `chapters`：章节数组，每项含：
  - `index`、`id`、`href`、`linear`
  - `html`：章节 HTML 文本
  - `css`：章节引用的 CSS 列表

## 使用示例

**示例 1：查看一本书的基本信息**

1. 拖入「EPUB Book Info」节点
2. `filePath` 填入 `/path/to/book.epub`
3. 运行后从 `data.metadata.title` / `data.toc` 拿到标题与目录

**示例 2：批量翻译全书**

1. 先用「EPUB Book Info」拿到 `spineCount`（假设为 30）
2. 把「EPUB Chapter Content」放进循环：
   - `start = ${loop.index}`，`count = 1`
   - 得到 `data.chapters[0].html` 喂给翻译节点
   - 写回结果时按 `index` 顺序重组
3. 全部完成后拼成新文件

**示例 3：分页阅读**

`start=0, count=1` → `start=1, count=1` → … 逐章加载

## 常见问题

- **解析失败 `invalid file`**：确认路径是 `.epub` 且文件未损坏（部分加密 / 受 DRM 保护的 EPUB 无法解析）。
- **HTML 是带 CSS 的富文本**：需要纯文本时建议用 HTML 解析器或正则去除标签。
- **章节为图片 / 视频**：可能返回空 `html`，可结合 `data.chapters[i].href` 拿到原始资源。
- **大文件占用内存**：`count=0` 会一次性加载所有章节，请按需分批；解析器内部已用 `destroy()` 释放句柄。

## 依赖

- `@lingo-reader/epub-parser` ^0.4.6
