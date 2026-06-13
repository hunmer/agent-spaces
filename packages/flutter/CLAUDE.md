[根目录](../../CLAUDE.md) > [packages](../) > **flutter**

# Flutter 模块 (packages/flutter)

## 模块概述

Agent Spaces 的**原生多平台客户端外壳**。基于 Flutter 构建桌面/移动端应用，核心定位是 **WebView 壳 + 原生能力桥接层 + 终端/文件管理器**。业务逻辑全部在 Web 前端（packages/web）和服务端（packages/server）中。

**核心能力**：WebView Tab 浏览器、SSH 终端、多协议文件源管理器（SFTP/FTP/Storage/WebDAV）、分屏/Docking 布局、书签管理、原生通知、内网服务器发现、JS Bridge 双向通信、i18n（中/英）、主题切换（明/暗/跟随系统）、桌面窗口状态管理。

详细文档参见 [claude/](./claude/) 子目录。

## 文件索引

| 文件 | 说明 |
|------|------|
| [claude/overview.md](claude/overview.md) | 项目总览、核心定位、技术栈、架构分层 |
| [claude/conventions.md](claude/conventions.md) | 编码约定、命名规范、状态管理规则 |
| [claude/module-responsibilities.md](claude/module-responsibilities.md) | 各子模块职责概述（models/providers/services/screens/widgets/bridge） |
| [claude/entrypoints.md](claude/entrypoints.md) | 入口文件、启动流程、路由配置 |
| [claude/public-interfaces.md](claude/public-interfaces.md) | JS Bridge API、路由表、对外接口 |
| [claude/dependencies-and-config.md](claude/dependencies-and-config.md) | 依赖关系、构建配置、平台配置 |
| [claude/data-model.md](claude/data-model.md) | 数据模型、持久化方案、状态枚举 |
| [claude/testing-and-quality.md](claude/testing-and-quality.md) | 测试现状、验证命令、质量工具 |
| [claude/file-map.md](claude/file-map.md) | 完整文件地图、源码结构 |
| [claude/faq.md](claude/faq.md) | 常见问题 |
| [claude/changelog.md](claude/changelog.md) | 变更记录 |

## 快速参考

- **语言**：Dart（Flutter SDK ^3.10.1）
- **源文件数**：46 个 Dart 源文件 + 2 个测试文件
- **状态管理**：Riverpod 2.x（StateNotifierProvider 模式）
- **路由**：GoRouter（7 条路由）
- **持久化**：SharedPreferences（JSON 序列化）
- **Lint**：flutter_lints
- **测试**：`flutter test`（widget_test 冒烟测试 + webdav_url_test 单元测试）
- **外部依赖**：不依赖 packages/shared 或 packages/server，通过 HTTP/WebSocket 连接后端

## 变更记录 (Changelog)

- **2026-06-13**：增量更新。确认新增 2 个测试文件（`test/widget_test.dart` App 构建冒烟测试 + `test/services/file_sources/webdav_url_test.dart` URL 规范化单元测试）。测试缺口已填补。覆盖率提升至 97%。
- **2026-06-09**：全量重新扫描，发现源文件从旧记录的 21 个增长到 44 个。新增：终端（SSH）功能、文件源管理器（SFTP/FTP/Storage/WebDAV）、Docking 分屏布局、i18n、主题切换、桌面窗口状态管理、虚拟键盘、控制台日志面板等。重新生成 CLAUDE.md 和全部 claude/ 详情文件。
