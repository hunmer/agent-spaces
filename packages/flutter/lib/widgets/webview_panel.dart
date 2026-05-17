import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/browser_provider.dart';
import 'home_page.dart';
import 'webview_instance.dart';

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
      return HomePage(
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
        return WebViewInstance(
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
