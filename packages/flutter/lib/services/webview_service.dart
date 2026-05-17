import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:logger/logger.dart';

class WebViewService {
  static final instance = WebViewService._();
  WebViewService._();
  static final _log = Logger(printer: PrettyPrinter(methodCount: 0));
  final Map<String, InAppWebViewController> _controllers = {};

  InAppWebViewController? getController(String tabId) => _controllers[tabId];

  void registerController(String tabId, InAppWebViewController controller) {
    _controllers[tabId] = controller;
    _log.i('WebView registered: $tabId');
  }

  void unregisterController(String tabId) {
    _controllers.remove(tabId);
    _log.i('WebView unregistered: $tabId');
  }

  Future<void> setZoom(String tabId, double scale) async {
    final ctrl = _controllers[tabId];
    if (ctrl == null) return;
    await ctrl.zoomBy(zoomFactor: scale, animated: false);
  }

  Future<void> loadUrl(String tabId, String url) async {
    final ctrl = _controllers[tabId];
    if (ctrl == null) return;
    await ctrl.loadUrl(
      urlRequest: URLRequest(url: WebUri(url)),
    );
  }

  Future<void> evaluateJS(String tabId, String script) async {
    final ctrl = _controllers[tabId];
    if (ctrl == null) return;
    await ctrl.evaluateJavascript(source: script);
  }

  Future<String?> getTitle(String tabId) async {
    final ctrl = _controllers[tabId];
    if (ctrl == null) return null;
    return ctrl.getTitle();
  }

  Future<void> reload(String tabId) async {
    final ctrl = _controllers[tabId];
    if (ctrl == null) return;
    await ctrl.reload();
  }
}
