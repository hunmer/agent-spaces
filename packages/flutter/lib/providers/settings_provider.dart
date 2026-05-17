import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/bookmark.dart';
import '../services/storage_service.dart';

class SettingsNotifier extends StateNotifier<AppSettings> {
  SettingsNotifier() : super(const AppSettings());

  Future<void> init() async {
    state = await StorageService.loadSettings();
  }

  void setRestoreTabsOnStartup(bool value) {
    state = AppSettings(restoreTabsOnStartup: value);
    StorageService.saveSettings(state);
  }
}

final settingsProvider =
    StateNotifierProvider<SettingsNotifier, AppSettings>((ref) {
  final notifier = SettingsNotifier();
  notifier.init();
  return notifier;
});
