[根目录](../../CLAUDE.md) > [packages](../) > **flutter**

# Flutter 模块 (packages/flutter)

## 模块概述

Agent Spaces 的**原生移动端/桌面端外壳应用**。基于 Flutter 构建多平台客户端（Android / iOS / macOS / Windows / Web），内嵌 InAppWebView 加载 Agent Spaces Web 前端，提供原生通知、设备模拟（Phone/Tablet/Desktop 响应式预览）、书签管理、内网服务器自动发现、JS Bridge 双向通信等原生增强能力。

核心定位：**WebView 壳 + 原生能力桥接层**，不包含业务逻辑，业务逻辑全部在 Web 前端（packages/web）和服务端（packages/server）中。

## 技术栈与版本

| 技术 | 版本 | 用途 |
|------|------|------|
| Flutter SDK | ^3.10.1 | 跨平台 UI 框架 |
| Dart | (随 Flutter) | 编程语言 |
| flutter_riverpod | ^2.6.1 | 状态管理 |
| go_router | ^14.8.1 | 声明式路由 |
| flutter_inappwebview | ^6.1.5 | WebView 引擎 |
| awesome_notifications | ^0.11.0 | 本地通知 |
| shared_preferences | ^2.5.3 | KV 持久化 |
| buttons_tabbar | ^1.3.15 | Tab 栏样式 |
| logger | ^2.5.0 | 日志 |
| uuid | ^4.5.1 | 唯一 ID 生成 |
| url_launcher | ^6.3.1 | 外部链接 |
| share_plus | ^10.1.4 | 分享 |
| path_provider | ^2.1.5 | 文件路径 |

## 目录结构

```
packages/flutter/
  lib/
    main.dart                          # 应用入口，GoRouter 路由配置，MaterialApp 初始化
    models/
      browser_tab.dart                 # BrowserTab 数据模型 + DeviceProfile + DeviceType 枚举
      bookmark.dart                    # Bookmark 数据模型 + AppSettings 数据模型
    providers/
      browser_provider.dart            # 浏览器 Tab 状态管理（BrowserState/BrowserNotifier）
      bookmark_provider.dart           # 书签 CRUD 状态管理（BookmarkNotifier）
      settings_provider.dart           # 应用设置状态管理（SettingsNotifier）
      console_log_provider.dart        # WebView 控制台日志捕获（ConsoleLogNotifier）
    screens/
      home_screen.dart                 # 主屏幕：BrowserTabBar + WebViewPanel
      bookmarks_screen.dart            # 书签管理页：列表/添加/编辑/删除/打开
      settings_screen.dart             # 设置页：启动恢复 Tabs 开关、关于入口
      about_screen.dart                # 关于页：版本信息、技术栈、项目链接
    widgets/
      webview_panel.dart               # WebView 核心面板：首页（服务器发现）+ WebView 实例 + JS Bridge
      browser_tab_bar.dart             # 浏览器 Tab 栏：标签切换/新建/关闭/右键菜单/控制台
      device_selector.dart             # 设备类型选择器（Phone/Tablet/Desktop）
    services/
      storage_service.dart             # SharedPreferences 持久化层（书签/设置/Tabs/URL）
      notification_service.dart        # 本地推送通知（awesome_notifications）
      webview_service.dart             # WebView Controller 注册/管理（缩放/加载/JS 执行）
    bridge/
      js_bridge.dart                   # Flutter <-> WebView JS Bridge（事件 + RPC 调用）
  test/
    widget_test.dart                   # 冒烟测试：验证 App 可构建
  pubspec.yaml                         # Flutter 依赖与构建配置
  analysis_options.yaml                # Dart Lint 规则（flutter_lints）
```

## 核心文件索引

### 入口与路由

| 文件 | 职责 |
|------|------|
| `lib/main.dart` | 应用入口。初始化 ProviderScope，配置 GoRouter（4 条路由：`/` `/bookmarks` `/settings` `/about`），MaterialApp.router 主题配置（Material 3，蓝色 Seed Color，明暗主题） |

### 数据模型

| 文件 | 职责 |
|------|------|
| `lib/models/browser_tab.dart` | `BrowserTab`（id/title/url/faviconUrl/device/createdAt）+ `DeviceProfile`（phone 375x812 / tablet 768x1024 / desktop 1280x800，含 User-Agent）+ `DeviceType` 枚举 |
| `lib/models/bookmark.dart` | `Bookmark`（id/name/url/deviceType/createdAt，JSON 序列化）+ `AppSettings`（restoreTabsOnStartup） |

### 状态管理（Riverpod StateNotifier）

| Provider | 状态类型 | 职责 |
|----------|----------|------|
| `browserProvider` | `BrowserState` | Tab 列表管理：addTab / closeTab / setActiveTab / updateTab / setDevice / setHomeUrl，启动时可选恢复 Tabs，自动持久化 |
| `bookmarkProvider` | `List<Bookmark>` | 书签 CRUD：addBookmark / removeBookmark / updateBookmark / isBookmarked / findByUrl |
| `settingsProvider` | `AppSettings` | 应用设置：restoreTabsOnStartup 开关 |
| `consoleLogProvider` | `ConsoleLogState` | WebView 控制台日志捕获：setCapturing / addLog / clearLogs，仅在 capturing=true 时记录 |

### 服务层

| 文件 | 职责 |
|------|------|
| `lib/services/storage_service.dart` | SharedPreferences 单例封装，持久化：bookmarks / app_settings / saved_tabs / saved_active_tab / home_url |
| `lib/services/notification_service.dart` | awesome_notifications 封装：初始化通知通道 / 请求权限 / 发送通知 |
| `lib/services/webview_service.dart` | InAppWebViewController 注册表（Map<tabId, Controller>），提供 zoom/loadUrl/evaluateJS/getTitle |

### Bridge 层

| 文件 | 职责 |
|------|------|
| `lib/bridge/js_bridge.dart` | Flutter <-> WebView 双向通信桥。注入 `__flutterBridge` JS 对象到 WebView，支持 `on/emit` 事件模式 + `invoke` RPC 模式（Promise 回调）。WebView 端通过 `window.isFlutterEnvironment()` 检测运行环境 |

**JS Bridge 支持的方法**（webview_panel.dart 中注册）：
- `setZoom(scale)` -- 缩放
- `setFullscreen(bool)` -- 全屏
- `sendNotification({title, body})` -- 发送原生通知
- `getNotificationPermission` / `requestNotificationPermission` -- 通知权限

### 页面（Screens）

| 页面 | 路由 | 职责 |
|------|------|------|
| `HomeScreen` | `/` | 主屏幕。初始化 Settings 和 Browser Provider，布局为 BrowserTabBar + WebViewPanel |
| `BookmarksScreen` | `/bookmarks` | 书签管理。列表展示，点击打开新 Tab，长按弹出编辑/删除菜单，顶部添加按钮弹出对话框 |
| `SettingsScreen` | `/settings` | 设置页。"启动时恢复 Tabs" 开关、"关于" 入口 |
| `AboutScreen` | `/about` | 关于页。项目名称/版本/描述/GitHub 链接/技术栈信息 |

### 组件（Widgets）

| 组件 | 职责 |
|------|------|
| `WebViewPanel` | 核心面板。无 Tab 时显示 `_HomePage`（服务器发现），有 Tab 时用 `IndexedStack` 渲染多个 `_WebViewInstance`。每个实例注入 JS Bridge，捕获控制台日志 |
| `BrowserTabBar` | Tab 栏。使用 ButtonsTabBar 渲染标签（favicon + 标题 + 关闭按钮），支持右键/长按菜单（跳转/切换设备/书签/控制台），"+" 按钮新建 Tab，"..." 菜单跳转书签/设置 |
| `DeviceSelector` | 设备类型下拉选择器（Phone/Tablet/Desktop），切换后 WebView 按对应尺寸约束渲染 |
| `_HomePage` (内部) | 服务器发现页。支持：自动扫描本机、扫描内网（127.0.0.1 + 本机 IP 网段 + 网关）、扫描 WiFi 局域网（254 地址批量检测）、手动输入地址。通过 `/api/health` 端点探测 |
| `_ConsoleSheet` (内部) | WebView 控制台日志面板（BottomSheet），支持开关捕获、复制日志、清空日志 |
| `_WebViewInstance` (内部) | 单个 WebView 实例，按 DeviceProfile 约束尺寸，注入 JS Bridge，监听标题/favicon 变化 |

## 服务器发现机制

`_HomePage` 实现了三级服务器发现策略：

1. **自动扫描（启动时）**：`_autoScanLocal()` -- 快速检测 127.0.0.1:3000 和本机 IP 网关:3000
2. **手动扫描内网**：`_scanLocal()` -- 逐端口扫描 127.0.0.1:3000-3010，然后检测本机 IP 网关
3. **扫描局域网**：`_scanLAN()` -- 获取 WiFi 子网，批量（20 并发）扫描 254 个地址的 :3000 端口
4. **手动输入**：用户直接输入服务器地址

所有扫描通过 `_checkHealth(host, port)` 调用 `GET /api/health` 验证，匹配 `{"status":"ok"}` 即认为有效。

## 依赖关系

```
main.dart
  -> providers/*（初始化所有 Provider）
  -> screens/*（GoRouter 路由目标）

screens/home_screen.dart
  -> providers/browser_provider, providers/settings_provider
  -> widgets/browser_tab_bar, widgets/webview_panel
  -> services/storage_service

widgets/webview_panel.dart
  -> bridge/js_bridge
  -> providers/browser_provider, providers/console_log_provider
  -> services/webview_service, services/notification_service
  -> models/browser_tab

widgets/browser_tab_bar.dart
  -> providers/browser_provider, providers/bookmark_provider, providers/console_log_provider
  -> models/browser_tab

screens/bookmarks_screen.dart
  -> providers/bookmark_provider, providers/browser_provider
  -> models/bookmark, models/browser_tab

providers/*
  -> models/*, services/storage_service

services/storage_service.dart
  -> models/bookmark, models/browser_tab（序列化/反序列化）
```

**外部依赖**：本模块不依赖 `packages/shared` 或 `packages/server`，是完全独立的 Flutter 客户端，通过 HTTP/WebSocket 连接后端。

## 状态管理方案

使用 **Riverpod 2.x（StateNotifier 模式）**：

- 所有 Provider 定义在 `providers/` 目录下，使用 `StateNotifierProvider`
- 状态类为 immutable（`const` 构造 + `copyWith`）
- 状态变更后自动调用 `StorageService` 持久化
- 通过 `ref.watch()` 在 Widget 中订阅，`ref.read().notifier` 触发变更

## 路由方案

使用 **GoRouter**，4 条路由：

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | HomeScreen | 主屏幕（WebView 浏览器） |
| `/bookmarks` | BookmarksScreen | 书签管理 |
| `/settings` | SettingsScreen | 设置 |
| `/about` | AboutScreen | 关于 |

## 编码规范

- Dart SDK ^3.10.1，启用 `flutter_lints` 规则集
- 使用 Riverpod `StateNotifierProvider` 模式进行状态管理
- Widget 使用 `ConsumerWidget`（无状态）或 `ConsumerStatefulWidget`（有状态）
- 数据模型使用 `copyWith` 模式实现不可变更新
- 持久化通过 `StorageService` 静态方法统一管理
- UI 风格：Material 3，主色 `Color(0xFF2563EB)`（蓝色），紧凑布局（dense: true）
- 文本使用固定 fontSize（12/13/15/16），适配移动端
- 通过 `window.isFlutterEnvironment()` 让 Web 前端检测运行环境（区分 Flutter/Tauri）

## 测试策略

当前仅有一个冒烟测试（`test/widget_test.dart`）：

```dart
testWidgets('App builds without error', ...)  // 验证 AgentSpacesApp 可正常构建
```

规划中的测试方向：
- **BrowserNotifier 单元测试**：Tab 的增删切换、持久化恢复逻辑
- **BookmarkNotifier 单元测试**：书签 CRUD、isBookmarked/findByUrl
- **StorageService 单元测试**：SharedPreferences 序列化/反序列化
- **JsBridge 集成测试**：事件收发、RPC 调用、Promise 回调
- **服务器发现测试**：`_checkHealth` 对不同响应的处理
- **Widget 测试**：TabBar 交互、BookmarksScreen CRUD 对话框

## 常见问题 (FAQ)

**Q: Flutter 客户端如何连接后端？**
A: 通过内网扫描（`/api/health` 探测）或手动输入地址，找到 Agent Spaces Server 后在 InAppWebView 中加载 Web 前端。

**Q: WebView 如何与 Flutter 原生层通信？**
A: 通过 `JsBridge`。WebView 端注入 `window.__flutterBridge` 对象，支持 `emit`（单向事件）和 `invoke`（双向 RPC，返回 Promise）。Flutter 端通过 `addJavaScriptHandler` 接收，通过 `evaluateJavascript` 回调。

**Q: 如何区分 Flutter 和 Tauri 环境？**
A: JS Bridge 注入时会设置 `window.isFlutterEnvironment() = true` 和 `window.isTauriEnvironment() = false`，Web 前端可通过这两个函数检测。

**Q: 设备模拟如何工作？**
A: `DeviceProfile` 定义三种设备尺寸和 User-Agent。非 Desktop 模式时，WebView 被约束在固定尺寸的 Container 中（带边框和阴影），模拟移动端视口。

## 相关文件清单

| 文件 | 行数 | 说明 |
|------|------|------|
| `lib/main.dart` | 59 | 入口 + 路由配置 |
| `lib/models/browser_tab.dart` | 99 | BrowserTab + DeviceProfile 模型 |
| `lib/models/bookmark.dart` | 59 | Bookmark + AppSettings 模型 |
| `lib/providers/browser_provider.dart` | 129 | 浏览器 Tab 状态管理 |
| `lib/providers/bookmark_provider.dart` | 63 | 书签状态管理 |
| `lib/providers/settings_provider.dart` | 26 | 设置状态管理 |
| `lib/providers/console_log_provider.dart` | 60 | 控制台日志状态管理 |
| `lib/screens/home_screen.dart` | 51 | 主屏幕 |
| `lib/screens/bookmarks_screen.dart` | 232 | 书签管理页 |
| `lib/screens/settings_screen.dart` | 73 | 设置页 |
| `lib/screens/about_screen.dart` | 169 | 关于页 |
| `lib/widgets/webview_panel.dart` | 638 | WebView 面板 + 服务器发现 + JS Bridge 注册 |
| `lib/widgets/browser_tab_bar.dart` | 503 | Tab 栏 + 右键菜单 + 控制台面板 |
| `lib/widgets/device_selector.dart` | 57 | 设备选择器 |
| `lib/services/storage_service.dart` | 91 | SharedPreferences 持久化 |
| `lib/services/notification_service.dart` | 51 | 原生通知 |
| `lib/services/webview_service.dart` | 46 | WebView Controller 管理 |
| `lib/bridge/js_bridge.dart` | 109 | JS Bridge 双向通信 |
| `test/widget_test.dart` | 13 | 冒烟测试 |

**总计**：18 个 Dart 源文件，1 个测试文件

## 变更记录 (Changelog)

| 时间 | 操作 | 说明 |
|------|------|------|
| 2026-05-17T15:04:39+08:00 | 初始化 | init-architect 首次扫描生成 flutter 模块 CLAUDE.md。18 个源文件全部覆盖（100%）。 |
