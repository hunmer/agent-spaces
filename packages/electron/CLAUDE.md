# packages/electron (`@agent-spaces/electron`)

Electron 31 桌面壳。负责窗口管理、`local://` 和 `app://` 自定义协议、全局快捷键、IPC 通信（文件系统/插件管理）、自动更新。后端通过独立 Server 进程，桌面壳仅提供原生能力封装。

## 约定

- 开发态加载 `http://127.0.0.1:3000`（Web dev server），生产态从 `renderer/` 加载静态导出。
- `main.ts` 为主进程入口，`preload/` 为预加载脚本。
- 窗口状态持久化到 electron-store。
- 路径：`ipc/`（IPC 处理器）、`services/`（原生服务）、`utils/`（工具）。

## 文件索引

| 文件 | 用途 | 何时阅读 |
|---|---|---|
| [概述](claude/overview.md) | 架构、协议、IPC | 首次接触 |
| [入口与启动](claude/entrypoints.md) | 启动流程、构建命令 | 需要构建/启动 |
| [文件索引](claude/file-map.md) | 目录结构 | 需要找文件 |
| [变更记录](claude/changelog.md) | 更新历史 | 了解变更 |

## 扫描状态

- **更新时间**: 2026-06-27
- **已扫描**: package.json、main.ts（前80行）、目录结构
- **跳过**: node_modules, out, release, build
