import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../bridge/js_bridge.dart';
import '../models/browser_tab.dart';
import '../providers/browser_provider.dart';
import '../providers/console_log_provider.dart';
import '../providers/settings_provider.dart';
import '../services/notification_service.dart';
import '../services/webview_service.dart';

final _webViewService = WebViewService.instance;
final _notificationService = NotificationService();

Future<dynamic> _handleBridgeInvoke(String method, dynamic args) async {
  switch (method) {
    case 'setZoom':
      final scale = args is Map
          ? (args['scale'] as num?)?.toDouble() ?? 1.0
          : 1.0;
      return scale;
    case 'setFullscreen':
      return args as bool? ?? true;
    case 'sendNotification':
      final map = args as Map?;
      await _notificationService.showNotification(
        title: map?['title'] ?? 'Agent Spaces',
        body: map?['body'] ?? '',
        id: (map?['id'] as num?)?.toInt(),
        ongoing: map?['ongoing'] == true,
      );
      return true;
    case 'getNotificationPermission':
      return await _notificationService.isAllowed();
    case 'requestNotificationPermission':
      return await _notificationService.requestPermission();
    default:
      return null;
  }
}

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
  final void Function(
    String tabId,
    String title,
    String url,
    String? faviconUrl,
  )
  onTitleChanged;

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
  late final JsBridge _jsBridge;
  bool _isLoading = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _lastUrl = widget.tab.url;
    _jsBridge = JsBridge(
      onEvent: (event, data) {
        if (event != 'inspector.jump' || !mounted) return;
        ref.read(browserProvider.notifier).setActiveTab(widget.tab.id);
      },
      onInvoke: _handleBridgeInvoke,
    );
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
      _controller!.loadUrl(urlRequest: URLRequest(url: WebUri(widget.tab.url)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final device = widget.tab.device;
    final isConstrained = device.type != DeviceType.desktop;
    final webViewDebuggingEnabled = ref.watch(
      settingsProvider.select((settings) => settings.webViewDebuggingEnabled),
    );

    Widget webView = Stack(
      children: [
        InAppWebView(
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
        isInspectable: webViewDebuggingEnabled,
      ),
      onWebViewCreated: (controller) async {
        _controller = controller;
        _webViewService.registerController(widget.tab.id, controller);
        _jsBridge.registerHandlers(controller);
        await controller.evaluateJavascript(source: _jsBridge.injectionScript);
        await controller.evaluateJavascript(source: _keyboardViewportScript);
      },
      onLoadStop: (controller, url) async {
        if (mounted && _isLoading) {
          setState(() => _isLoading = false);
        }
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
        ref
            .read(consoleLogProvider.notifier)
            .addLog(
              consoleMessage.message,
              consoleMessage.messageLevel.toString().split('.').last,
            );
      },
      onReceivedError: (_, request, error) {
        if (request.isForMainFrame != true) return;
        if (mounted) {
          setState(() {
            _isLoading = false;
            _errorMessage = error.description;
          });
        }
        ref
            .read(consoleLogProvider.notifier)
            .addLog(
              'WebView load error: ${error.description} (${error.type})',
              'error',
            );
      },
      onReceivedHttpError: (_, request, response) {
        if (request.isForMainFrame != true) return;
        if (mounted) {
          setState(() {
            _isLoading = false;
            _errorMessage = 'HTTP ${response.statusCode} ${response.reasonPhrase}';
          });
        }
        ref
            .read(consoleLogProvider.notifier)
            .addLog(
              'WebView HTTP error: ${response.statusCode} ${response.reasonPhrase}',
              'error',
            );
      },
    ),
    if (_isLoading)
      const _LoadingPlaceholder(),
    if (_errorMessage != null)
      _ErrorPlaceholder(
        message: _errorMessage!,
        onRetry: () {
          setState(() {
            _isLoading = true;
            _errorMessage = null;
          });
          _controller?.loadUrl(urlRequest: URLRequest(url: WebUri(widget.tab.url)));
        },
      ),
    ],
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

class _LoadingPlaceholder extends StatelessWidget {
  const _LoadingPlaceholder();

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Theme.of(context).scaffoldBackgroundColor,
      child: const Center(
        child: CircularProgressIndicator(strokeWidth: 2),
      ),
    );
  }
}

class _ErrorPlaceholder extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorPlaceholder({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      color: theme.scaffoldBackgroundColor,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.cloud_off, size: 48, color: theme.disabledColor),
              const SizedBox(height: 12),
              Text(
                '加载失败',
                style: theme.textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              Text(
                message,
                style: theme.textTheme.bodySmall?.copyWith(color: theme.disabledColor),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              FilledButton.tonal(
                onPressed: onRetry,
                child: const Text('重试'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
