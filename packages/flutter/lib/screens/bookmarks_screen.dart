import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/browser_tab.dart';
import '../providers/browser_provider.dart';
import '../providers/bookmark_provider.dart';

class BookmarksScreen extends ConsumerWidget {
  const BookmarksScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bookmarks = ref.watch(bookmarkProvider);
    final bookmarkNotifier = ref.read(bookmarkProvider.notifier);
    final browserNotifier = ref.read(browserProvider.notifier);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('书签', style: TextStyle(fontSize: 16)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, size: 20),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, size: 20),
            onPressed: () => _showAddDialog(context, bookmarkNotifier),
          ),
        ],
      ),
      body: bookmarks.isEmpty
          ? Center(
              child: Text('暂无书签', style: TextStyle(color: theme.colorScheme.onSurfaceVariant)),
            )
          : ListView.separated(
              itemCount: bookmarks.length,
              separatorBuilder: (context, index) => const Divider(height: 1),
              itemBuilder: (context, index) {
                final bm = bookmarks[index];
                return ListTile(
                  dense: true,
                  leading: Icon(_deviceIcon(bm.deviceType), size: 18),
                  title: Text(bm.name, style: const TextStyle(fontSize: 13)),
                  subtitle: Text(bm.url, style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurfaceVariant)),
                  trailing: IconButton(
                    icon: const Icon(Icons.delete_outline, size: 18),
                    onPressed: () => bookmarkNotifier.removeBookmark(bm.id),
                  ),
                  onTap: () {
                    browserNotifier.addTab(
                      url: bm.url,
                      title: bm.name,
                      device: DeviceProfile.fromType(bm.deviceType),
                    );
                    Navigator.of(context).pop();
                  },
                );
              },
            ),
    );
  }

  void _showAddDialog(BuildContext context, BookmarkNotifier notifier) {
    final nameCtl = TextEditingController();
    final urlCtl = TextEditingController();
    DeviceType deviceType = DeviceType.desktop;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          title: const Text('添加书签', style: TextStyle(fontSize: 15)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameCtl,
                style: const TextStyle(fontSize: 13),
                decoration: const InputDecoration(
                  isDense: true,
                  labelText: '名称',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: urlCtl,
                style: const TextStyle(fontSize: 13),
                decoration: const InputDecoration(
                  isDense: true,
                  labelText: '网址',
                  prefixIcon: Icon(Icons.language, size: 16),
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<DeviceType>(
                initialValue: deviceType,
                isDense: true,
                decoration: const InputDecoration(
                  isDense: true,
                  labelText: '设备类型',
                ),
                items: DeviceType.values.map((t) => DropdownMenuItem(
                  value: t,
                  child: Text(_deviceTypeName(t), style: const TextStyle(fontSize: 13)),
                )).toList(),
                onChanged: (v) => setState(() => deviceType = v!),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('取消'),
            ),
            TextButton(
              onPressed: () {
                if (nameCtl.text.isNotEmpty && urlCtl.text.isNotEmpty) {
                  final url = urlCtl.text.startsWith('http') ? urlCtl.text : 'http://${urlCtl.text}';
                  notifier.addBookmark(name: nameCtl.text, url: url, deviceType: deviceType);
                  Navigator.of(ctx).pop();
                }
              },
              child: const Text('添加'),
            ),
          ],
        ),
      ),
    );
  }

  String _deviceTypeName(DeviceType t) => switch (t) {
    DeviceType.phone => 'Phone',
    DeviceType.tablet => 'Tablet',
    DeviceType.desktop => 'Desktop',
  };

  IconData _deviceIcon(DeviceType t) => switch (t) {
    DeviceType.phone => Icons.phone_android,
    DeviceType.tablet => Icons.tablet,
    DeviceType.desktop => Icons.desktop_windows,
  };
}
