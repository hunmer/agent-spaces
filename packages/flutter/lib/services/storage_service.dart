import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/bookmark.dart';
import '../models/browser_tab.dart';

class StorageService {
  static const _bookmarksKey = 'bookmarks';
  static const _settingsKey = 'app_settings';
  static const _tabsKey = 'saved_tabs';
  static const _activeTabKey = 'saved_active_tab';
  static const _homeUrlKey = 'home_url';

  static SharedPreferences? _instance;

  static Future<SharedPreferences> get _prefs async {
    _instance ??= await SharedPreferences.getInstance();
    return _instance!;
  }

  // Bookmarks
  static Future<List<Bookmark>> loadBookmarks() async {
    final prefs = await _prefs;
    final raw = prefs.getString(_bookmarksKey);
    if (raw == null) return [];
    final list = jsonDecode(raw) as List;
    return list.map((e) => Bookmark.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<void> saveBookmarks(List<Bookmark> bookmarks) async {
    final prefs = await _prefs;
    await prefs.setString(
      _bookmarksKey,
      jsonEncode(bookmarks.map((b) => b.toJson()).toList()),
    );
  }

  // Settings
  static Future<AppSettings> loadSettings() async {
    final prefs = await _prefs;
    final raw = prefs.getString(_settingsKey);
    if (raw == null) return const AppSettings();
    return AppSettings.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  static Future<void> saveSettings(AppSettings settings) async {
    final prefs = await _prefs;
    await prefs.setString(_settingsKey, jsonEncode(settings.toJson()));
  }

  // Tab persistence
  static Future<void> saveTabs(List<BrowserTab> tabs, String activeTabId) async {
    final prefs = await _prefs;
    await prefs.setString(
      _tabsKey,
      jsonEncode(tabs.map((t) => {
        'id': t.id,
        'title': t.title,
        'url': t.url,
        'faviconUrl': t.faviconUrl,
        'deviceType': t.device.type.index,
        'createdAt': t.createdAt.toIso8601String(),
      }).toList()),
    );
    await prefs.setString(_activeTabKey, activeTabId);
  }

  static Future<List<BrowserTab>> loadTabs() async {
    final prefs = await _prefs;
    final raw = prefs.getString(_tabsKey);
    if (raw == null) return [];
    final list = jsonDecode(raw) as List;
    return list
        .map((e) => BrowserTab.fromSaved(e as Map<String, dynamic>))
        .toList();
  }

  static Future<String?> loadActiveTabId() async {
    final prefs = await _prefs;
    return prefs.getString(_activeTabKey);
  }

  static Future<void> saveHomeUrl(String url) async {
    final prefs = await _prefs;
    await prefs.setString(_homeUrlKey, url);
  }

  static Future<String?> loadHomeUrl() async {
    final prefs = await _prefs;
    return prefs.getString(_homeUrlKey);
  }
}
