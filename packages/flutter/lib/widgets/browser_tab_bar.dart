import 'package:buttons_tabbar/buttons_tabbar.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/browser_tab.dart';
import '../providers/browser_provider.dart';
import '../providers/bookmark_provider.dart';
import '../providers/console_log_provider.dart';
import '../providers/settings_provider.dart';
import '../services/webview_service.dart';

class BrowserTabBar extends ConsumerStatefulWidget {
  const BrowserTabBar({super.key});

  @override
  ConsumerState<BrowserTabBar> createState() => _BrowserTabBarState();
}

class _BrowserTabBarState extends ConsumerState<BrowserTabBar>
    with TickerProviderStateMixin {
  TabController? _controller;

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(browserProvider);
    final notifier = ref.read(browserProvider.notifier);
    final theme = Theme.of(context);
    final tabCount = state.tabs.length;
    final activeIndex = state.tabs
        .indexWhere((t) => t.id == state.activeTabId)
        .clamp(0, tabCount > 0 ? tabCount - 1 : 0);

    if (_controller?.length != tabCount) {
      _controller?.dispose();
      _controller = tabCount > 0
          ? TabController(
              length: tabCount,
              initialIndex: activeIndex,
              vsync: this,
            )
          : null;
    }

    if (tabCount == 0) {
      return Container(
        height: 40,
        color: theme.colorScheme.surfaceContainer,
        child: Row(
          children: [
            const Spacer(),
            _MoreMenuButton(
              onNewTab: () => _showNewTabDialog(context, notifier),
            ),
          ],
        ),
      );
    }

    return Container(
      height: 40,
      color: theme.colorScheme.surfaceContainer,
      child: Row(
        children: [
          Expanded(
            child: ButtonsTabBar(
              controller: _controller,
              backgroundColor: theme.colorScheme.primaryContainer,
              unselectedBackgroundColor: theme.colorScheme.surface,
              labelStyle: TextStyle(
                fontSize: 12,
                color: theme.colorScheme.onPrimaryContainer,
              ),
              unselectedLabelStyle: TextStyle(
                fontSize: 12,
                color: theme.colorScheme.onSurface,
              ),
              borderWidth: 0,
              radius: 8,
              contentPadding: const EdgeInsets.symmetric(horizontal: 8),
              buttonMargin: const EdgeInsets.symmetric(
                horizontal: 1,
                vertical: 4,
              ),
              onTap: (index) {
                _hideKeyboard();
                if (index < tabCount) {
                  notifier.setActiveTab(state.tabs[index].id);
                }
              },
              tabs: state.tabs.map((tab) {
                return Tab(
                  child: GestureDetector(
                    onLongPressStart: (details) => _showContextMenu(
                      context,
                      ref,
                      tab,
                      details.globalPosition,
                    ),
                    onSecondaryTapUp: (details) => _showContextMenu(
                      context,
                      ref,
                      tab,
                      details.globalPosition,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _FaviconIcon(url: tab.effectiveFaviconUrl),
                        const SizedBox(width: 6),
                        ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 80),
                          child: Text(
                            tab.title,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 12),
                          ),
                        ),
                        const SizedBox(width: 4),
                        GestureDetector(
                          onTap: () => notifier.closeTab(tab.id),
                          child: Icon(
                            Icons.close,
                            size: 14,
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          _MoreMenuButton(onNewTab: () => _showNewTabDialog(context, notifier)),
          const SizedBox(width: 4),
        ],
      ),
    );
  }

  void _showContextMenu(
    BuildContext context,
    WidgetRef ref,
    BrowserTab tab,
    Offset position,
  ) {
    final notifier = ref.read(browserProvider.notifier);
    final bookmarkNotifier = ref.read(bookmarkProvider.notifier);
    final isBookmarked = bookmarkNotifier.isBookmarked(tab.url);

    showMenu<String>(
      context: context,
      position: RelativeRect.fromLTRB(
        position.dx,
        position.dy,
        position.dx + 1,
        position.dy + 1,
      ),
      items: [
        const PopupMenuItem<String>(
          value: 'navigate',
          height: 36,
          child: Row(
            children: [
              Icon(Icons.open_in_browser, size: 16),
              SizedBox(width: 8),
              Text('跳转', style: TextStyle(fontSize: 13)),
            ],
          ),
        ),
        PopupMenuItem<String>(
          value: 'device',
          height: 36,
          child: Row(
            children: [
              Icon(_deviceIcon(tab.device.type), size: 16),
              const SizedBox(width: 8),
              const Text('切换设备', style: TextStyle(fontSize: 13)),
              const Spacer(),
              Text(
                tab.device.name,
                style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
              ),
            ],
          ),
        ),
        PopupMenuItem<String>(
          value: 'bookmark',
          height: 36,
          child: Row(
            children: [
              Icon(
                isBookmarked ? Icons.bookmark : Icons.bookmark_outline,
                size: 16,
              ),
              const SizedBox(width: 8),
              Text(
                isBookmarked ? '从书签移除' : '添加到书签',
                style: const TextStyle(fontSize: 13),
              ),
            ],
          ),
        ),
        const PopupMenuItem<String>(
          value: 'open_external',
          height: 36,
          child: Row(
            children: [
              Icon(Icons.open_in_new, size: 16),
              SizedBox(width: 8),
              Text('用浏览器打开', style: TextStyle(fontSize: 13)),
            ],
          ),
        ),
        const PopupMenuItem<String>(
          value: 'refresh',
          height: 36,
          child: Row(
            children: [
              Icon(Icons.refresh, size: 16),
              SizedBox(width: 8),
              Text('刷新', style: TextStyle(fontSize: 13)),
            ],
          ),
        ),
        const PopupMenuItem<String>(
          value: 'debug',
          height: 36,
          child: Row(
            children: [
              Icon(Icons.bug_report_outlined, size: 16),
              SizedBox(width: 8),
              Text('调试', style: TextStyle(fontSize: 13)),
            ],
          ),
        ),
        const PopupMenuItem<String>(
          value: 'console',
          height: 36,
          child: Row(
            children: [
              Icon(Icons.terminal, size: 16),
              SizedBox(width: 8),
              Text('查看控制台', style: TextStyle(fontSize: 13)),
            ],
          ),
        ),
      ],
    ).then((value) {
      if (!context.mounted) return;

      if (value == 'navigate') {
        _showNavigateDialog(context, tab, notifier);
      } else if (value == 'device') {
        _showDeviceMenu(context, tab, notifier);
      } else if (value == 'bookmark') {
        if (isBookmarked) {
          final bm = bookmarkNotifier.findByUrl(tab.url);
          if (bm != null) bookmarkNotifier.removeBookmark(bm.id);
        } else {
          bookmarkNotifier.addBookmark(
            name: tab.title,
            url: tab.url,
            deviceType: tab.device.type,
          );
        }
      } else if (value == 'open_external') {
        launchUrl(Uri.parse(tab.url));
      } else if (value == 'refresh') {
        WebViewService.instance.reload(tab.id);
      } else if (value == 'debug') {
        _showDebugDialog(context, tab);
      } else if (value == 'console') {
        showModalBottomSheet(
          context: context,
          isScrollControlled: true,
          builder: (_) => const _ConsoleSheet(),
        );
      }
    });
  }

  void _showDebugDialog(BuildContext context, BrowserTab tab) {
    final theme = Theme.of(context);
    final webViewDebuggingEnabled = ref.read(
      settingsProvider.select((settings) => settings.webViewDebuggingEnabled),
    );
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('调试', style: TextStyle(fontSize: 15)),
        contentPadding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
        content: SizedBox(
          width: 420,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _DebugInfoRow(label: '标签页', value: tab.title),
                const SizedBox(height: 8),
                _DebugInfoRow(label: 'URL', value: tab.url),
                const SizedBox(height: 8),
                _DebugInfoRow(
                  label: '设备',
                  value:
                      '${tab.device.name} '
                      '${tab.device.width.toInt()}x'
                      '${tab.device.height.toInt()}',
                ),
                const SizedBox(height: 12),
                Text(
                  webViewDebuggingEnabled
                      ? 'WebView inspectable 已启用。'
                      : 'WebView inspectable 当前未启用，可在“设置 > 浏览器 > WebView 调试”中打开。',
                  style: TextStyle(
                    fontSize: 12,
                    height: 1.4,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 12),
                const _DebugStepsSection(
                  title: 'macOS Safari',
                  steps: [
                    'Safari > 设置 > 高级，开启“在菜单栏中显示开发菜单”。',
                    '保持当前 App 和这个 WebView 页面打开。',
                    'Safari 菜单栏打开“开发”，选择当前 Mac、App 或页面。',
                    '点击对应页面后打开 Web Inspector。',
                  ],
                ),
                const SizedBox(height: 12),
                const _DebugStepsSection(
                  title: 'Android Chrome',
                  steps: [
                    '保持当前 App 和这个 WebView 页面打开。',
                    '在 Chrome 地址栏打开 chrome://inspect。',
                    '在 Remote Target 中找到当前 WebView。',
                    '点击 inspect 打开 DevTools。',
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  '要求：iOS 16.4+ 或 macOS 13.3+ 支持 isInspectable。',
                  style: TextStyle(
                    fontSize: 12,
                    height: 1.4,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton.icon(
            onPressed: () {
              WebViewService.instance.reload(tab.id);
              Navigator.of(ctx).pop();
            },
            icon: const Icon(Icons.refresh, size: 16),
            label: const Text('刷新'),
          ),
          TextButton.icon(
            onPressed: () {
              Navigator.of(ctx).pop();
              showModalBottomSheet(
                context: context,
                isScrollControlled: true,
                builder: (_) => const _ConsoleSheet(),
              );
            },
            icon: const Icon(Icons.terminal, size: 16),
            label: const Text('控制台'),
          ),
          TextButton.icon(
            onPressed: () {
              Clipboard.setData(ClipboardData(text: tab.url));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('已复制 URL'),
                  duration: Duration(seconds: 1),
                ),
              );
            },
            icon: const Icon(Icons.copy, size: 16),
            label: const Text('复制 URL'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('知道了'),
          ),
        ],
      ),
    );
  }

  void _hideKeyboard() {
    FocusManager.instance.primaryFocus?.unfocus();
    SystemChannels.textInput.invokeMethod<void>('TextInput.hide');
  }

  void _showNewTabDialog(BuildContext context, BrowserNotifier notifier) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('新建标签页', style: TextStyle(fontSize: 15)),
        contentPadding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
        content: TextField(
          controller: controller,
          autofocus: true,
          style: const TextStyle(fontSize: 13),
          decoration: const InputDecoration(isDense: true, hintText: '输入 URL'),
          onSubmitted: (url) {
            if (url.isNotEmpty) {
              final normalized = url.startsWith('http') ? url : 'http://$url';
              notifier.addTab(url: normalized);
              Navigator.of(ctx).pop();
            }
          },
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () {
              final url = controller.text;
              if (url.isNotEmpty) {
                final normalized = url.startsWith('http') ? url : 'http://$url';
                notifier.addTab(url: normalized);
                Navigator.of(ctx).pop();
              }
            },
            child: const Text('打开'),
          ),
        ],
      ),
    );
  }

  void _showNavigateDialog(
    BuildContext context,
    BrowserTab tab,
    BrowserNotifier notifier,
  ) {
    final controller = TextEditingController(text: tab.url);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('跳转', style: TextStyle(fontSize: 15)),
        contentPadding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
        content: TextField(
          controller: controller,
          autofocus: true,
          style: const TextStyle(fontSize: 13),
          decoration: const InputDecoration(
            isDense: true,
            hintText: '输入 URL',
            prefixIcon: Icon(Icons.language, size: 16),
          ),
          onSubmitted: (url) {
            if (url.isNotEmpty) {
              final normalized = url.startsWith('http') ? url : 'http://$url';
              notifier.updateTab(tab.id, url: normalized);
              Navigator.of(ctx).pop();
            }
          },
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () {
              if (controller.text.isNotEmpty) {
                final normalized = controller.text.startsWith('http')
                    ? controller.text
                    : 'http://${controller.text}';
                notifier.updateTab(tab.id, url: normalized);
                Navigator.of(ctx).pop();
              }
            },
            child: const Text('跳转'),
          ),
        ],
      ),
    );
  }

  void _showDeviceMenu(
    BuildContext context,
    BrowserTab tab,
    BrowserNotifier notifier,
  ) {
    showDialog(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text('切换设备', style: TextStyle(fontSize: 15)),
        children: DeviceProfile.defaults.map((d) {
          final selected = d.type == tab.device.type;
          return SimpleDialogOption(
            onPressed: () {
              notifier.setDevice(d, tab.id);
              Navigator.of(ctx).pop();
            },
            child: Row(
              children: [
                Icon(_deviceIcon(d.type), size: 18),
                const SizedBox(width: 12),
                Text(
                  '${d.name} (${d.width.toInt()}x${d.height.toInt()})',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
                  ),
                ),
                if (selected) ...[
                  const Spacer(),
                  Icon(
                    Icons.check,
                    size: 16,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                ],
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  IconData _deviceIcon(DeviceType type) {
    return switch (type) {
      DeviceType.phone => Icons.phone_android,
      DeviceType.tablet => Icons.tablet,
      DeviceType.desktop => Icons.desktop_windows,
    };
  }
}

class _MoreMenuButton extends ConsumerWidget {
  final VoidCallback? onNewTab;

  const _MoreMenuButton({this.onNewTab});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return PopupMenuButton<String>(
      icon: Icon(
        Icons.more_vert,
        size: 18,
        color: theme.colorScheme.onSurfaceVariant,
      ),
      style: IconButton.styleFrom(
        minimumSize: const Size(32, 32),
        padding: EdgeInsets.zero,
      ),
      offset: const Offset(0, 40),
      itemBuilder: (_) => [
        if (onNewTab != null)
          const PopupMenuItem(
            value: 'new_tab',
            height: 36,
            child: Row(
              children: [
                Icon(Icons.add, size: 16),
                SizedBox(width: 8),
                Text('新建标签页', style: TextStyle(fontSize: 13)),
              ],
            ),
          ),
        const PopupMenuItem(
          value: 'bookmarks',
          height: 36,
          child: Row(
            children: [
              Icon(Icons.bookmark_outline, size: 16),
              SizedBox(width: 8),
              Text('书签', style: TextStyle(fontSize: 13)),
            ],
          ),
        ),
        const PopupMenuItem(
          value: 'settings',
          height: 36,
          child: Row(
            children: [
              Icon(Icons.settings, size: 16),
              SizedBox(width: 8),
              Text('设置', style: TextStyle(fontSize: 13)),
            ],
          ),
        ),
      ],
      onSelected: (value) {
        if (value == 'new_tab') {
          onNewTab?.call();
        } else if (value == 'bookmarks') {
          context.push('/bookmarks');
        } else if (value == 'settings') {
          context.push('/settings');
        }
      },
    );
  }
}

class _DebugInfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _DebugInfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 44,
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
        Expanded(
          child: SelectableText(value, style: const TextStyle(fontSize: 12)),
        ),
      ],
    );
  }
}

class _DebugStepsSection extends StatelessWidget {
  final String title;
  final List<String> steps;

  const _DebugStepsSection({required this.title, required this.steps});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 6),
        ...steps.indexed.map((entry) {
          final index = entry.$1 + 1;
          final step = entry.$2;
          return Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 18,
                  child: Text(
                    '$index.',
                    style: TextStyle(
                      fontSize: 12,
                      height: 1.35,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
                Expanded(
                  child: Text(
                    step,
                    style: TextStyle(
                      fontSize: 12,
                      height: 1.35,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }
}

class _FaviconIcon extends StatelessWidget {
  final String url;
  const _FaviconIcon({required this.url});

  @override
  Widget build(BuildContext context) {
    if (url.isEmpty) {
      return Icon(
        Icons.language,
        size: 14,
        color: Theme.of(context).colorScheme.onSurfaceVariant,
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(2),
      child: Image.network(
        url,
        width: 14,
        height: 14,
        // ignore: avoid_renaming_method_parameters
        errorBuilder: (context, error, stackTrace) => Icon(
          Icons.language,
          size: 14,
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }
}

class _ConsoleSheet extends ConsumerWidget {
  const _ConsoleSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(consoleLogProvider);
    final notifier = ref.read(consoleLogProvider.notifier);
    final theme = Theme.of(context);

    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      minChildSize: 0.3,
      maxChildSize: 0.9,
      expand: false,
      builder: (context, scrollController) {
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 8, 0),
              child: Row(
                children: [
                  Text('控制台', style: theme.textTheme.titleSmall),
                  const Spacer(),
                  Switch(
                    value: state.capturing,
                    onChanged: (v) => notifier.setCapturing(v),
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '捕获日志',
                    style: TextStyle(
                      fontSize: 12,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(width: 12),
                  IconButton(
                    onPressed: state.logs.isEmpty
                        ? null
                        : () {
                            Clipboard.setData(
                              ClipboardData(text: notifier.allLogsText),
                            );
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('已复制'),
                                duration: Duration(seconds: 1),
                              ),
                            );
                          },
                    icon: const Icon(Icons.copy, size: 18),
                    tooltip: '复制所有日志',
                    style: IconButton.styleFrom(
                      minimumSize: const Size(32, 32),
                      padding: EdgeInsets.zero,
                    ),
                  ),
                  IconButton(
                    onPressed: state.logs.isEmpty ? null : notifier.clearLogs,
                    icon: const Icon(Icons.delete_outline, size: 18),
                    tooltip: '清空日志',
                    style: IconButton.styleFrom(
                      minimumSize: const Size(32, 32),
                      padding: EdgeInsets.zero,
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: state.logs.isEmpty
                  ? Center(
                      child: Text(
                        state.capturing ? '暂无日志' : '开启捕获以记录控制台日志',
                        style: TextStyle(
                          fontSize: 13,
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    )
                  : ListView.builder(
                      controller: scrollController,
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      itemCount: state.logs.length,
                      itemBuilder: (_, i) {
                        final log = state.logs[i];
                        final color = _levelColor(log.level, theme);
                        return Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 2,
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${log.formattedTime} ',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontFamily: 'monospace',
                                  color: theme.colorScheme.onSurfaceVariant,
                                ),
                              ),
                              Container(
                                margin: const EdgeInsets.only(top: 2),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 4,
                                ),
                                decoration: BoxDecoration(
                                  color: color.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(3),
                                ),
                                child: Text(
                                  log.level.toUpperCase(),
                                  style: TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.w600,
                                    color: color,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  log.message,
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontFamily: 'monospace',
                                    color: color,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
          ],
        );
      },
    );
  }

  Color _levelColor(String level, ThemeData theme) {
    return switch (level) {
      'error' => Colors.red,
      'warning' => Colors.orange,
      'debug' => Colors.grey,
      'info' => theme.colorScheme.primary,
      _ => theme.colorScheme.onSurface,
    };
  }
}
