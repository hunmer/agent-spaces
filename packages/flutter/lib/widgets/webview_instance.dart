import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../bridge/js_bridge.dart';
import '../models/browser_tab.dart';
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

const _keyboardViewportScript = '''
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

class WebViewInstance extends ConsumerStatefulWidget {
  final BrowserTab tab;
  final void Function(String tabId, String title, String url, String? faviconUrl) onTitleChanged;

  const WebViewInstance({
    super.key,
    required this.tab,
    required this.onTitleChanged,
  });

  @override
  ConsumerState<WebViewInstance> createState() => _WebViewInstanceState();
}

class _WebViewInstanceState extends ConsumerState<WebViewInstance> {
  InAppWebViewController? _controller;
  String _lastUrl = '';

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
  void didUpdateWidget(covariant WebViewInstance oldWidget) {
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
