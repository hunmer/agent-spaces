import 'package:flutter_riverpod/flutter_riverpod.dart';

class ConsoleLog {
  final String message;
  final String level;
  final DateTime time;

  const ConsoleLog({
    required this.message,
    required this.level,
    required this.time,
  });

  String get formattedTime =>
      '${time.hour.toString().padLeft(2, '0')}:'
      '${time.minute.toString().padLeft(2, '0')}:'
      '${time.second.toString().padLeft(2, '0')}';
}

class ConsoleLogState {
  final List<ConsoleLog> logs;
  final bool capturing;

  const ConsoleLogState({this.logs = const [], this.capturing = false});

  ConsoleLogState copyWith({List<ConsoleLog>? logs, bool? capturing}) =>
      ConsoleLogState(
        logs: logs ?? this.logs,
        capturing: capturing ?? this.capturing,
      );
}

class ConsoleLogNotifier extends StateNotifier<ConsoleLogState> {
  ConsoleLogNotifier() : super(const ConsoleLogState());

  void setCapturing(bool value) =>
      state = state.copyWith(capturing: value);

  void addLog(String message, String level) {
    if (!state.capturing) return;
    state = state.copyWith(
      logs: [
        ConsoleLog(message: message, level: level, time: DateTime.now()),
        ...state.logs,
      ],
    );
  }

  void clearLogs() => state = state.copyWith(logs: []);

  String get allLogsText => state.logs.reversed
      .map((l) => '[${l.formattedTime}] [${l.level}] ${l.message}')
      .join('\n');
}

final consoleLogProvider =
    StateNotifierProvider<ConsoleLogNotifier, ConsoleLogState>(
  (_) => ConsoleLogNotifier(),
);
