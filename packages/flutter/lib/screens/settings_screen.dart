import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/settings_provider.dart';
import '../services/notification_service.dart';

final _notificationService = NotificationService();

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool _notificationAllowed = false;
  bool _loadingNotificationPermission = true;
  bool _requestingNotificationPermission = false;

  @override
  void initState() {
    super.initState();
    _refreshNotificationPermission();
  }

  Future<void> _refreshNotificationPermission() async {
    final allowed = await _notificationService.isAllowed();
    if (!mounted) return;
    setState(() {
      _notificationAllowed = allowed;
      _loadingNotificationPermission = false;
    });
  }

  Future<void> _requestNotificationPermission() async {
    setState(() {
      _requestingNotificationPermission = true;
    });
    final allowed = await _notificationService.requestPermission();
    if (!mounted) return;
    setState(() {
      _notificationAllowed = allowed;
      _requestingNotificationPermission = false;
      _loadingNotificationPermission = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(settingsProvider);
    final notifier = ref.read(settingsProvider.notifier);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('设置', style: TextStyle(fontSize: 16)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, size: 20),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: ListView(
        children: [
          _SectionHeader(title: '启动'),
          SwitchListTile(
            dense: true,
            secondary: const Icon(Icons.restore, size: 20),
            title: const Text('启动时恢复 Tabs', style: TextStyle(fontSize: 13)),
            subtitle: Text(
              '打开应用后恢复上次关闭时的标签页',
              style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurfaceVariant),
            ),
            value: settings.restoreTabsOnStartup,
            onChanged: (v) => notifier.setRestoreTabsOnStartup(v),
          ),
          _SectionHeader(title: '授权管理'),
          ListTile(
            dense: true,
            leading: const Icon(Icons.notifications_outlined, size: 20),
            title: const Text('通知', style: TextStyle(fontSize: 13)),
            subtitle: Text(
              _loadingNotificationPermission
                  ? '检查中...'
                  : (_notificationAllowed ? '已授权' : '未授权'),
              style: TextStyle(
                fontSize: 11,
                color: _notificationAllowed
                    ? Colors.green
                    : theme.colorScheme.onSurfaceVariant,
              ),
            ),
            trailing: _notificationAllowed
                ? const Icon(Icons.check_circle, size: 20, color: Colors.green)
                : TextButton(
                    onPressed: _requestingNotificationPermission
                        ? null
                        : _requestNotificationPermission,
                    child: Text(_requestingNotificationPermission ? '授权中...' : '授权'),
                  ),
          ),
          _SectionHeader(title: '其他'),
          ListTile(
            dense: true,
            leading: const Icon(Icons.info_outline, size: 20),
            title: const Text('关于', style: TextStyle(fontSize: 13)),
            subtitle: Text(
              '版本 0.1.0',
              style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurfaceVariant),
            ),
            onTap: () => context.push('/about'),
          ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: Theme.of(context).colorScheme.primary,
        ),
      ),
    );
  }
}
