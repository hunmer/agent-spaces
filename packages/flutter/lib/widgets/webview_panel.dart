import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../bridge/js_bridge.dart';
import '../models/browser_tab.dart';
import '../providers/browser_provider.dart';
import '../providers/console_log_provider.dart';
import '../services/notification_service.dart';
import '../services/webview_service.dart';

final _webViewService = WebViewService();
final _notificationService = NotificationService();
final _jsBridge = JsBridge(
  onInvoke: (method, args) async {
    switch (method) {
      case 'setZoom':
        final scale = args is Map ? (args['scale'] as num?)?.toDouble() ?? 1.0 : 1.0;
        return scale;
      case 'setFullscreen':
        return args as bool? ?? true;
      case 'sendNotification':
        final map = args as Map?;
        await _notificationService.showNotification(
          title: map?['title'] ?? 'Agent Spaces',
          body: map?['body'] ?? '',
        );
        return true;
      case 'getNotificationPermission':
        return true;
      case 'requestNotificationPermission':
        return await _notificationService.requestPermission();
      default:
        return null;
    }
  },
);

class WebViewPanel extends ConsumerStatefulWidget {
  const WebViewPanel({super.key});

  @override
  ConsumerState<WebViewPanel> createState() => _WebViewPanelState();
}

class _WebViewPanelState extends ConsumerState<WebViewPanel> {
  @override
  Widget build(BuildContext context) {
    final state = ref.watch(browserProvider);
    final activeIndex = state.tabs.indexWhere((t) => t.id == state.activeTabId);

    if (state.tabs.isEmpty) {
      return _HomePage(
        onServerFound: (url) {
          ref.read(browserProvider.notifier).setHomeUrl(url);
          ref.read(browserProvider.notifier).addTab(url: url, title: 'Agent Spaces');
        },
        homeUrl: state.homeUrl,
      );
    }

    return IndexedStack(
      index: activeIndex >= 0 ? activeIndex : 0,
      children: state.tabs.map((tab) {
        return _WebViewInstance(
          key: ValueKey(tab.id),
          tab: tab,
          onTitleChanged: (tabId, title, url, faviconUrl) {
            ref.read(browserProvider.notifier).updateTab(
                  tabId,
                  title: title,
                  url: url,
                  faviconUrl: faviconUrl,
                );
          },
        );
      }).toList(),
    );
  }
}

class _HomePage extends StatefulWidget {
  final void Function(String url) onServerFound;
  final String homeUrl;

  const _HomePage({required this.onServerFound, required this.homeUrl});

  @override
  State<_HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<_HomePage> {
  String _scanStatus = '';
  bool _scanning = false;
  bool _scanCancelled = false;
  double _progress = 0;
  String? _foundUrl;
  String? _localFoundUrl; // 内网自动扫描结果

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _autoScanLocal());
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.hub, size: 56, color: theme.colorScheme.primary),
              const SizedBox(height: 16),
              Text(
                'Agent Spaces',
                style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Text(
                '连接到 Agent Spaces 服务器',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 32),
              if (_scanning) ...[
                LinearProgressIndicator(value: _progress > 0 ? _progress : null),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        _scanStatus,
                        style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurfaceVariant),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    TextButton(
                      onPressed: _stopScan,
                      style: TextButton.styleFrom(
                        minimumSize: const Size(0, 28),
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: const Text('停止', style: TextStyle(fontSize: 13)),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
              ],
              if (_foundUrl != null) ...[
                _ServerCard(
                  url: _foundUrl!,
                  onTap: () => widget.onServerFound(_foundUrl!),
                ),
                const SizedBox(height: 12),
              ],
              _ActionCard(
                icon: Icons.wifi,
                title: '扫描内网',
                subtitle: _localFoundUrl != null
                    ? '已发现: $_localFoundUrl'
                    : '扫描本机 127.0.0.1 及本机 IP 网段',
                enabled: !_scanning,
                badge: _localFoundUrl != null,
                onTap: () {
                  if (_localFoundUrl != null) {
                    widget.onServerFound(_localFoundUrl!);
                  } else {
                    _scanLocal();
                  }
                },
              ),
              const SizedBox(height: 12),
              _ActionCard(
                icon: Icons.lan,
                title: '扫描局域网',
                subtitle: '扫描 WiFi 所在网段',
                enabled: !_scanning,
                onTap: () => _scanLAN(),
              ),
              const SizedBox(height: 12),
              _ActionCard(
                icon: Icons.link,
                title: '手动输入地址',
                subtitle: '输入服务器地址并设为默认',
                enabled: !_scanning,
                onTap: () => _showManualInput(),
              ),
              const SizedBox(height: 12),
              _ActionCard(
                icon: Icons.info_outline,
                title: '关于 Agent Spaces',
                subtitle: '版本信息与项目链接',
                enabled: true,
                onTap: () => context.push('/about'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _autoScanLocal() async {
    final result = await _quickCheck();
    if (mounted && result != null) {
      setState(() => _localFoundUrl = result);
    }
  }

  void _stopScan() {
    _scanCancelled = true;
    setState(() {
      _scanning = false;
      _scanStatus = '';
      _progress = 0;
    });
  }

  Future<String?> _checkHealth(String host, int port) async {
    final url = 'http://$host:$port/api/health';
    try {
      final client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 2);
      final request = await client.getUrl(Uri.parse(url));
      final response = await request.close();
      final body = await response.transform(utf8.decoder).join();
      client.close();
      debugPrint('[scan] health check $url -> ${response.statusCode} body=$body');
      if (response.statusCode == 200 && body.contains('"status":"ok"')) {
        return 'http://$host:$port';
      }
    } catch (e) {
      debugPrint('[scan] health check $url FAILED: $e');
    }
    return null;
  }

  Future<String?> _quickCheck() async {
    final result = await _checkHealth('127.0.0.1', 3000);
    if (result != null) return result;
    try {
      final interfaces = await NetworkInterface.list();
      for (final iface in interfaces) {
        for (final addr in iface.addresses) {
          if (addr.type == InternetAddressType.IPv4 && !addr.isLoopback) {
            final parts = addr.address.split('.');
            if (parts.length == 4) {
              final gateway = '${parts[0]}.${parts[1]}.${parts[2]}.1';
              final r = await _checkHealth(gateway, 3000);
              if (r != null) return r;
            }
          }
        }
      }
    } catch (_) {}
    return null;
  }

  Future<void> _scanLocal() async {
    _scanCancelled = false;
    setState(() {
      _scanning = true;
      _progress = 0;
      _scanStatus = '快速检测本机...';
      _foundUrl = null;
    });

    final quick = await _quickCheck();
    if (quick != null) {
      if (mounted) {
        setState(() {
          _scanning = false;
          _foundUrl = quick;
          _localFoundUrl = quick;
          _scanStatus = '';
        });
      }
      return;
    }

    setState(() => _scanStatus = '扫描本机端口...');

    for (int port = 3000; port <= 3010; port++) {
      if (_scanCancelled) return;
      final r = await _checkHealth('127.0.0.1', port);
      if (r != null) {
        if (mounted) setState(() { _scanning = false; _foundUrl = r; _localFoundUrl = r; _scanStatus = ''; });
        return;
      }
      if (mounted) setState(() => _progress = (port - 3000 + 1) / 11);
    }

    setState(() {
      _scanning = false;
      _scanStatus = '未在本机发现服务器';
    });
  }

  Future<String?> _getWifiSubnet() async {
    try {
      final interfaces = await NetworkInterface.list();
      debugPrint('[scan] found ${interfaces.length} interfaces');
      String? wifiSubnet;
      String? fallbackSubnet;
      for (final iface in interfaces) {
        for (final addr in iface.addresses) {
          debugPrint('[scan]   ${iface.name}: ${addr.address} (${addr.type}) loopback=${addr.isLoopback}');
          if (addr.type == InternetAddressType.IPv4 && !addr.isLoopback) {
            final parts = addr.address.split('.');
            if (parts.length == 4) {
              final subnet = '${parts[0]}.${parts[1]}.${parts[2]}';
              final isWifi = iface.name.startsWith('wlan') || iface.name.startsWith('en0');
              if (isWifi) {
                debugPrint('[scan]   -> WiFi subnet: $subnet (${iface.name})');
                wifiSubnet = subnet;
              }
              fallbackSubnet ??= subnet;
            }
          }
        }
      }
      final result = wifiSubnet ?? fallbackSubnet;
      if (result != null) debugPrint('[scan]   -> selected subnet: $result');
      return result;
    } catch (e) {
      debugPrint('[scan] getWifiSubnet FAILED: $e');
    }
    return null;
  }

  Future<void> _scanLAN() async {
    _scanCancelled = false;
    setState(() {
      _scanning = true;
      _progress = 0;
      _scanStatus = '获取 WiFi 地址...';
      _foundUrl = null;
    });

    final subnet = await _getWifiSubnet();
    if (subnet == null) {
      if (mounted) setState(() { _scanning = false; _scanStatus = '无法获取 WiFi 地址'; });
      return;
    }
    debugPrint('[scan] LAN scan subnet=$subnet');

    final quick = await _quickCheck();
    if (quick != null) {
      if (mounted) setState(() { _scanning = false; _foundUrl = quick; _localFoundUrl = quick; _scanStatus = ''; });
      return;
    }

    final allHosts = List.generate(254, (i) => '$subnet.${i + 1}');

    setState(() => _scanStatus = '扫描 ${allHosts.length} 个地址...');

    const batchSize = 20;
    int checked = 0;
    for (int i = 0; i < allHosts.length; i += batchSize) {
      if (_scanCancelled) return;
      final batch = allHosts.sublist(i, i + batchSize > allHosts.length ? allHosts.length : i + batchSize);
      final results = await Future.wait(batch.map((host) => _checkHealth(host, 3000)));
      checked += batch.length;

      if (_scanCancelled) return;
      final found = results.where((r) => r != null).firstOrNull;
      if (found != null) {
        if (mounted) setState(() { _scanning = false; _foundUrl = found; _localFoundUrl = found; _scanStatus = ''; });
        return;
      }

      if (mounted) {
        setState(() {
          _progress = checked / allHosts.length;
          _scanStatus = '已扫描 $checked / ${allHosts.length}...';
        });
      }
    }

    if (mounted && !_scanCancelled) setState(() { _scanning = false; _scanStatus = '未在局域网发现服务器'; });
  }

  void _showManualInput() {
    final controller = TextEditingController(text: widget.homeUrl);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('输入服务器地址'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'http://192.168.1.100:3000',
            prefixIcon: Icon(Icons.link, size: 18),
          ),
          onSubmitted: (v) => _connectManual(ctx, v),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('取消')),
          TextButton(onPressed: () => _connectManual(ctx, controller.text), child: const Text('连接')),
        ],
      ),
    );
  }

  void _connectManual(BuildContext ctx, String raw) {
    if (raw.isEmpty) return;
    final url = raw.startsWith('http') ? raw : 'http://$raw';
    Navigator.of(ctx).pop();
    widget.onServerFound(url);
  }
}

class _ActionCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final bool enabled;
  final bool badge;
  final VoidCallback onTap;

  const _ActionCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.enabled,
    this.badge = false,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: theme.colorScheme.outlineVariant),
      ),
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Icon(icon, color: enabled ? theme.colorScheme.primary : theme.disabledColor),
                  if (badge)
                    Positioned(
                      right: -2,
                      top: -2,
                      child: Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          color: Colors.green,
                          shape: BoxShape.circle,
                          border: Border.all(color: theme.colorScheme.surface, width: 2),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: TextStyle(fontWeight: FontWeight.w600, color: enabled ? null : theme.disabledColor)),
                    const SizedBox(height: 2),
                    Text(subtitle, style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurfaceVariant)),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: theme.colorScheme.onSurfaceVariant),
            ],
          ),
        ),
      ),
    );
  }
}

class _ServerCard extends StatelessWidget {
  final String url;
  final VoidCallback onTap;

  const _ServerCard({required this.url, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      color: theme.colorScheme.primaryContainer,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(Icons.check_circle, color: theme.colorScheme.primary),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('发现服务器', style: TextStyle(fontWeight: FontWeight.w600, color: theme.colorScheme.onPrimaryContainer)),
                    const SizedBox(height: 2),
                    Text(url, style: TextStyle(fontSize: 12, color: theme.colorScheme.onPrimaryContainer)),
                  ],
                ),
              ),
              Icon(Icons.arrow_forward, color: theme.colorScheme.primary),
            ],
          ),
        ),
      ),
    );
  }
}

class _WebViewInstance extends ConsumerStatefulWidget {
  final BrowserTab tab;
  final void Function(String tabId, String title, String url, String? faviconUrl) onTitleChanged;

  const _WebViewInstance({
    super.key,
    required this.tab,
    required this.onTitleChanged,
  });

  @override
  ConsumerState<_WebViewInstance> createState() => _WebViewInstanceState();
}

class _WebViewInstanceState extends ConsumerState<_WebViewInstance> {
  InAppWebViewController? _controller;
  String _lastUrl = '';

  static const _keyboardViewportScript = '''
    (function() {
      if (window.__agentSpacesKeyboardViewportInstalled) {
        return;
      }
      window.__agentSpacesKeyboardViewportInstalled = true;

      var selectors = 'input, textarea, select, [contenteditable="true"]';
      var pendingFrame = 0;

      function getFocusedEditable() {
        var element = document.activeElement;
        if (!element || !element.matches || !element.matches(selectors)) {
          return null;
        }
        return element;
      }

      function scrollFocusedEditableIntoView() {
        if (pendingFrame) {
          window.cancelAnimationFrame(pendingFrame);
        }
        pendingFrame = window.requestAnimationFrame(function() {
          pendingFrame = 0;
          var element = getFocusedEditable();
          if (!element) {
            return;
          }

          element.scrollIntoView({
            block: 'center',
            inline: 'nearest',
            behavior: 'smooth'
          });
        });
      }

      window.addEventListener('focusin', function(event) {
        if (event.target && event.target.matches && event.target.matches(selectors)) {
          window.setTimeout(scrollFocusedEditableIntoView, 80);
        }
      }, true);

      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', scrollFocusedEditableIntoView);
        window.visualViewport.addEventListener('scroll', scrollFocusedEditableIntoView);
      } else {
        window.addEventListener('resize', scrollFocusedEditableIntoView);
      }
    })();
  ''';

  @override
  void initState() {
    super.initState();
    _lastUrl = widget.tab.url;
  }

  @override
  void dispose() {
    if (_controller != null) {
      _webViewService.unregisterController(widget.tab.id);
    }
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant _WebViewInstance oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.tab.url != _lastUrl && _controller != null) {
      _lastUrl = widget.tab.url;
      _controller!.loadUrl(
        urlRequest: URLRequest(url: WebUri(widget.tab.url)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final device = widget.tab.device;
    final isConstrained = device.type != DeviceType.desktop;

    Widget webView = InAppWebView(
      initialUrlRequest: URLRequest(url: WebUri(widget.tab.url)),
      initialSettings: InAppWebViewSettings(
        userAgent: device.userAgentSuffix.isEmpty
            ? null
            : device.userAgentSuffix,
        supportZoom: true,
        builtInZoomControls: false,
        useHybridComposition: true,
        allowsInlineMediaPlayback: true,
        mediaPlaybackRequiresUserGesture: false,
      ),
      onWebViewCreated: (controller) async {
        _controller = controller;
        _webViewService.registerController(widget.tab.id, controller);
        _jsBridge.registerHandlers(controller);
        await controller.evaluateJavascript(source: _jsBridge.injectionScript);
        await controller.evaluateJavascript(source: _keyboardViewportScript);
      },
      onLoadStop: (controller, url) async {
        if (url != null) {
          final title = await controller.getTitle();
          final favicons = await controller.getFavicons();
          String? faviconUrl;
          if (favicons.isNotEmpty) {
            faviconUrl = favicons.first.url.toString();
          }
          widget.onTitleChanged(
            widget.tab.id,
            title ?? url.host,
            url.toString(),
            faviconUrl,
          );
        }
        await controller.evaluateJavascript(source: _jsBridge.injectionScript);
        await controller.evaluateJavascript(source: _keyboardViewportScript);
      },
      onConsoleMessage: (_, consoleMessage) {
        ref.read(consoleLogProvider.notifier).addLog(
              consoleMessage.message,
              consoleMessage.messageLevel.toString().split('.').last,
            );
      },
    );

    if (isConstrained) {
      return Center(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final viewportWidth = constraints.maxWidth;
            final viewportHeight = constraints.maxHeight;
            final scale = [
              1.0,
              viewportWidth / device.width,
              viewportHeight / device.height,
            ].reduce((value, element) => value < element ? value : element);

            return Container(
              width: device.width * scale,
              height: device.height * scale,
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey.shade300),
                borderRadius: BorderRadius.circular(8),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.1),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              clipBehavior: Clip.antiAlias,
              child: webView,
            );
          },
        ),
      );
    }

    return SizedBox.expand(child: webView);
  }
}
