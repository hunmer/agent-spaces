import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';
import '../models/browser_tab.dart';
import '../services/storage_service.dart';

class BrowserState {
  final List<BrowserTab> tabs;
  final String activeTabId;
  final String homeUrl;

  const BrowserState({
    this.tabs = const [],
    this.activeTabId = '',
    this.homeUrl = 'http://localhost:3000',
  });

  BrowserTab? get activeTab {
    try {
      return tabs.firstWhere((t) => t.id == activeTabId);
    } catch (_) {
      return null;
    }
  }

  BrowserState copyWith({
    List<BrowserTab>? tabs,
    String? activeTabId,
    String? homeUrl,
  }) {
    return BrowserState(
      tabs: tabs ?? this.tabs,
      activeTabId: activeTabId ?? this.activeTabId,
      homeUrl: homeUrl ?? this.homeUrl,
    );
  }
}

class BrowserNotifier extends StateNotifier<BrowserState> {
  static const _uuid = Uuid();
  bool _restoreOnStartup = false;

  BrowserNotifier() : super(const BrowserState());

  Future<void> init() async {
    final savedHomeUrl = await StorageService.loadHomeUrl();
    if (savedHomeUrl != null) {
      state = state.copyWith(homeUrl: savedHomeUrl);
    }

    if (_restoreOnStartup) {
      final savedTabs = await StorageService.loadTabs();
      final savedActiveId = await StorageService.loadActiveTabId();
      if (savedTabs.isNotEmpty) {
        state = state.copyWith(
          tabs: savedTabs,
          activeTabId: savedActiveId ?? savedTabs.first.id,
        );
        return;
      }
    }
    // Don't auto-create tab - show homepage instead
  }

  void setRestoreOnStartup(bool value) => _restoreOnStartup = value;

  void addTab({String? url, String? title, DeviceProfile? device}) {
    final tab = BrowserTab(
      id: _uuid.v4(),
      title: title ?? 'New Tab',
      url: url ?? state.homeUrl,
      device: device ?? DeviceProfile.desktop,
    );
    state = state.copyWith(
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    );
    _persistTabs();
  }

  void closeTab(String tabId) {
    final newTabs = state.tabs.where((t) => t.id != tabId).toList();
    String newActiveId = '';
    if (newTabs.isNotEmpty) {
      final idx = state.tabs.indexWhere((t) => t.id == tabId);
      final newIdx = idx < newTabs.length ? idx : newTabs.length - 1;
      newActiveId = newTabs[newIdx].id;
    }
    state = state.copyWith(tabs: newTabs, activeTabId: newActiveId);
    _persistTabs();
  }

  void setActiveTab(String tabId) {
    state = state.copyWith(activeTabId: tabId);
    _persistTabs();
  }

  void updateTab(String tabId, {String? title, String? url, String? faviconUrl}) {
    state = state.copyWith(
      tabs: state.tabs
          .map((t) => t.id == tabId ? t.copyWith(title: title, url: url, faviconUrl: faviconUrl) : t)
          .toList(),
    );
    _persistTabs();
  }

  void setDevice(DeviceProfile device, String tabId) {
    state = state.copyWith(
      tabs: state.tabs
          .map((t) => t.id == tabId ? t.copyWith(device: device) : t)
          .toList(),
    );
    _persistTabs();
  }

  void setHomeUrl(String url) {
    state = state.copyWith(homeUrl: url);
    StorageService.saveHomeUrl(url);
  }

  void _persistTabs() {
    StorageService.saveTabs(state.tabs, state.activeTabId);
  }
}

final browserProvider =
    StateNotifierProvider<BrowserNotifier, BrowserState>((ref) {
  return BrowserNotifier();
});
