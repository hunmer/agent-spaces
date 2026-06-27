# Flutter 模块 — 概述

## 架构

Flutter App → WebView → 加载本地 Web 静态导出 (`assets/web/`)

## 关键依赖

| 依赖 | 用途 |
|---|---|
| `flutter_inappwebview` | WebView |
| `awesome_notifications` | 本地通知 |
| `flutter_riverpod` | 状态管理 |
| `go_router` | 路由 |
| `dartssh2` | SSH 终端 |
| `xterm` | 终端 UI |
| `easy_localization` | 国际化 |
| `window_manager` | 窗口管理（桌面） |
| `webdav_client` | WebDAV 客户端 |
| `ftpconnect` | FTP 客户端 |
| `animated_tree_view` | 树形视图 |

## Web 资产

`assets/web/` 目录由 `copy-web.mjs` 生成，包含 Next.js 静态导出的全部文件。pubspec.yaml 中通过自动生成块声明资产。
