import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/browser_provider.dart';
import '../providers/settings_provider.dart';
import '../services/notification_service.dart';
import '../services/storage_service.dart';
import '../widgets/browser_tab_bar.dart';
import '../widgets/webview_panel.dart';

final _notificationService = NotificationService();

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  bool _initialized = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _init());
  }

  Future<void> _init() async {
    if (_initialized) return;
    _initialized = true;

    final settings = await StorageService.loadSettings();
    ref.read(settingsProvider.notifier).load(settings);

    final browserNotifier = ref.read(browserProvider.notifier);
    browserNotifier.setRestoreOnStartup(settings.restoreTabsOnStartup);
    await browserNotifier.init();

    final seenPermissionDialog = await StorageService.hasSeenPermissionDialog();
    if (!seenPermissionDialog && mounted) {
      await StorageService.markPermissionDialogSeen();
      _showPermissionDialog();
    }
  }

  Future<void> _showPermissionDialog() async {
    final allowed = await _notificationService.isAllowed();
    if (!mounted || allowed) return;

    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('授权管理'),
        content: const Text('Agent Spaces 需要通知权限，用于发送系统通知。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('稍后'),
          ),
          FilledButton(
            onPressed: () async {
              await _notificationService.requestPermission();
              if (context.mounted) Navigator.of(context).pop();
            },
            child: const Text('授权通知'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      resizeToAvoidBottomInset: true,
      body: SafeArea(
        child: Column(
          children: [
            const BrowserTabBar(),
            const Expanded(child: WebViewPanel()),
          ],
        ),
      ),
    );
  }
}
