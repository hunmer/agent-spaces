# packages/flutter

Flutter 移动端壳。通过 WebView 嵌入 Web 静态导出，支持 Android/iOS/macOS/Windows 多平台。提供本地通知、SSH 终端、国际化等原生能力。

## 约定

- Web 静态资源由 `copy-web.mjs` 复制到 `assets/web/`。
- pubspec.yaml 中的 Web 资产列表由 `copy-web.mjs` 自动生成（`BEGIN/END GENERATED WEB ASSETS` 标记之间）。
- Flutter SDK: ^3.10.1。

## 文件索引

| 文件 | 用途 | 何时阅读 |
|---|---|---|
| [概述](claude/overview.md) | 架构、依赖 | 首次接触 |
| [变更记录](claude/changelog.md) | 更新历史 | 了解变更 |

## 扫描状态

- **更新时间**: 2026-06-27
- **已扫描**: pubspec.yaml
- **跳过**: android, ios, macos, windows, build 生成物
