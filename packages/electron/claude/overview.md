# Electron 模块 — 概述

## 架构

- **主进程**: `main.ts` — 创建窗口、注册协议、IPC、全局快捷键
- **预加载**: `preload/` — 安全桥接
- **渲染层**: `renderer/` — Web 静态导出（由 `copy-web.mjs` 复制）

## 自定义协议

| 协议 | 用途 |
|---|---|
| `app://` | 服务 Next.js 静态导出（HTML/JS/CSS/JSON/WASM） |
| `local://` | 服务用户本地音视频文件（支持 Range 请求） |

## IPC 通道

| 文件 | 职责 |
|---|---|
| `ipc/shortcut.ts` | 全局快捷键注册/注销 |
| `ipc/fs.ts` | 文件系统操作 |

## 服务

| 文件 | 职责 |
|---|---|
| `services/store.ts` | electron-store（窗口状态持久化） |
| `services/client-plugin-runner.ts` | 客户端插件管理（安装/卸载/执行） |

## 构建

- `pnpm build` — tsc 编译 main + preload
- `pnpm dist` — electron-builder 打包（DMG/NSIS/AppImage）
- 更新: electron-updater，GitHub Releases 作为分发源
