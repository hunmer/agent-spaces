import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../bridge/js_bridge.dart';
import '../models/browser_tab.dart';
import '../providers/browser_provider.dart';
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

    if (state.tabs.isEmpty) return const SizedBox.shrink();

    return IndexedStack(
      index: activeIndex >= 0 ? activeIndex : 0,
      children: state.tabs.map((tab) {
        return _WebViewInstance(
          key: ValueKey(tab.id),
          tab: tab,
          onTitleChanged: (tabId, title, url) {
            ref.read(browserProvider.notifier).updateTab(
                  tabId,
                  title: title,
                  url: url,
                );
          },
        );
      }).toList(),
    );
  }
}

class _WebViewInstance extends StatefulWidget {
  final BrowserTab tab;
  final void Function(String tabId, String title, String url) onTitleChanged;

  const _WebViewInstance({
    super.key,
    required this.tab,
    required this.onTitleChanged,
  });

  @override
  State<_WebViewInstance> createState() => _WebViewInstanceState();
}

class _WebViewInstanceState extends State<_WebViewInstance> {
  InAppWebViewController? _controller;

  @override
  void dispose() {
    if (_controller != null) {
      _webViewService.unregisterController(widget.tab.id);
    }
    super.dispose();
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
      },
      onLoadStop: (controller, url) async {
        if (url != null) {
          final title = await controller.getTitle();
          widget.onTitleChanged(
            widget.tab.id,
            title ?? url.host,
            url.toString(),
          );
        }
        await controller.evaluateJavascript(source: _jsBridge.injectionScript);
      },
    );

    if (isConstrained) {
      return Center(
        child: Container(
          width: device.width,
          height: device.height,
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
        ),
      );
    }

    return SizedBox.expand(child: webView);
  }
}
