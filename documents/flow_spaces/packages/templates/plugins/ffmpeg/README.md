# FFmpeg 音视频处理 插件

> 基于 FFmpeg 的音视频处理插件，支持格式转换、合并（音频 + 视频）、分离（提取音频 / 去音频）。

## 简介

本插件封装了 [FFmpeg](https://ffmpeg.org/) 最常见的三类操作，让 Workflow / Agent 可以在不写命令行的前提下完成音视频处理。

插件类型：`server`。

## 前置准备

1. 在系统中安装 FFmpeg（`ffmpeg` / `ffprobe`）
   - macOS: `brew install ffmpeg`
   - Ubuntu: `sudo apt-get install ffmpeg`
   - Windows: 从 [ffmpeg.org](https://ffmpeg.org/download.html) 下载并加入 `PATH`
2. 在插件中心安装并启用本插件
3. 若 FFmpeg 不在 `PATH` 中，请在插件配置中指定 `ffmpegPath`

## 配置说明

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `ffmpegPath` | 否 | FFmpeg 可执行文件绝对路径；留空则使用系统 `PATH` |

## 节点清单

| 节点 | 用途 |
| --- | --- |
| `ffmpeg_format_convert` | 音视频格式转换 |
| `ffmpeg_merge` | 把音频和视频合并为一个文件 |
| `ffmpeg_demux` | 提取音频 / 去除音频 / 同时提取两条流 |

## 节点字段

### ffmpeg_format_convert

- 入参：
  - `inputPath`：输入文件绝对路径（必填）
  - `outputFormat`：`mp4` / `avi` / `mkv` / `mov` / `webm` / `flv` / `gif` / `mp3` / `wav` / `aac` / `flac` / `ogg`
  - `videoCodec`：`libx264` / `libx265` / `libvpx-vp9` / `libaom-av1` / `mpeg4` / `auto`
  - `audioCodec`：`aac` / `libmp3lame` / `flac` / `libvorbis` / `libopus` / `auto`
  - `outputPath`：留空则在输入同目录生成 `<name>_converted.<ext>`
  - `ffmpegPath`：可覆盖全局配置
- 出参 `data.outputPath`：生成文件路径
- 当输出格式为纯音频时，自动加 `-vn`

### ffmpeg_merge

- 入参：
  - `videoPath`、`audioPath`：视频和音频文件绝对路径（必填）
  - `outputPath`：合并后文件路径（必填）
  - `reEncode`：是否重新编码（默认 `false`，即 `-c copy` 直接封装）
  - `videoCodec`、`audioCodec`：仅在 `reEncode=true` 时生效
  - `shortest`：是否取最短流（默认 `true`）
  - `ffmpegPath`
- 出参 `data.outputPath`

### ffmpeg_demux

- 入参：
  - `inputPath`：输入文件（必填）
  - `mode`：`extract_audio` / `extract_video` / `extract_both`
  - `audioFormat`：仅在提取音频时生效，默认 `mp3`
  - `audioOutputPath`、`videoOutputPath`：留空则自动生成
  - `ffmpegPath`
- 出参 `data.audioPath` / `data.videoPath`

## 使用示例

**示例 1：把 MOV 转成 MP4（H.264）**

```
inputPath    = /path/in.mov
outputFormat = mp4
videoCodec   = libx264
audioCodec   = aac
```

**示例 2：把 BGM 合并到视频**

```
videoPath  = /path/video.mp4
audioPath  = /path/bgm.mp3
outputPath = /path/final.mp4
reEncode   = false
```

**示例 3：从视频中提取纯音频**

```
inputPath   = /path/clip.mp4
mode        = extract_audio
audioFormat = mp3
```

## 常见问题

- **`ffmpeg: command not found`**：FFmpeg 不在 `PATH` 中，请在插件配置中填写 `ffmpegPath`。
- **`Permission denied`**：输出目录不可写，请检查路径权限。
- **合并后没有声音 / 黑屏**：原始流封装不兼容，请开启 `reEncode = true` 并指定 `videoCodec` / `audioCodec`。
- **处理大文件很慢**：默认采用 H.264 / AAC 软编码；如机器有 NVIDIA GPU，可通过自定义 `ffmpegPath` 指向带 NVENC 的 FFmpeg 二进制。
- **进度日志不更新**：本插件通过 `progress` 事件打印百分比，受文件 I/O 影响可能不连续。

## 依赖

- 运行时依赖：`@ts-ffmpeg/fluent-ffmpeg` ^2.2.6
- 系统依赖：FFmpeg（[安装说明](https://ffmpeg.org/download.html)）
