import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';
import '../models/browser_tab.dart';
import '../models/bookmark.dart';
import '../services/storage_service.dart';

class BookmarkNotifier extends StateNotifier<List<Bookmark>> {
  static const _uuid = Uuid();

  BookmarkNotifier() : super(const []);

  Future<void> init() async {
    state = await StorageService.loadBookmarks();
  }

  void addBookmark({
    required String name,
    required String url,
    DeviceType deviceType = DeviceType.desktop,
  }) {
    final bookmark = Bookmark(
      id: _uuid.v4(),
      name: name,
      url: url,
      deviceType: deviceType,
    );
    state = [...state, bookmark];
    StorageService.saveBookmarks(state);
  }

  void removeBookmark(String id) {
    state = state.where((b) => b.id != id).toList();
    StorageService.saveBookmarks(state);
  }

  bool isBookmarked(String url) => state.any((b) => b.url == url);

  Bookmark? findByUrl(String url) {
    for (final b in state) {
      if (b.url == url) return b;
    }
    return null;
  }
}

final bookmarkProvider =
    StateNotifierProvider<BookmarkNotifier, List<Bookmark>>((ref) {
  final notifier = BookmarkNotifier();
  notifier.init();
  return notifier;
});
