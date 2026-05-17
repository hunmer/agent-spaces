import 'browser_tab.dart';

class Bookmark {
  final String id;
  final String name;
  final String url;
  final DeviceType deviceType;
  final DateTime createdAt;

  Bookmark({
    required this.id,
    required this.name,
    required this.url,
    this.deviceType = DeviceType.desktop,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'url': url,
        'deviceType': deviceType.index,
        'createdAt': createdAt.toIso8601String(),
      };

  factory Bookmark.fromJson(Map<String, dynamic> json) => Bookmark(
        id: json['id'] as String,
        name: json['name'] as String,
        url: json['url'] as String,
        deviceType: DeviceType.values[json['deviceType'] as int],
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}

class AppSettings {
  final bool restoreTabsOnStartup;

  const AppSettings({
    this.restoreTabsOnStartup = false,
  });

  Map<String, dynamic> toJson() => {
        'restoreTabsOnStartup': restoreTabsOnStartup,
      };

  factory AppSettings.fromJson(Map<String, dynamic> json) => AppSettings(
        restoreTabsOnStartup: json['restoreTabsOnStartup'] as bool? ?? false,
      );
}
