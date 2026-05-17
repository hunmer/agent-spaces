import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_spaces/main.dart';

void main() {
  testWidgets('App builds without error', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: AgentSpacesApp()));

    expect(find.byType(AgentSpacesApp), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
