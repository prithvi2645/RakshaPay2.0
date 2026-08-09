import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:rakshapay/main.dart';

void main() {
  testWidgets('shows the branded splash while models load', (tester) async {
    await tester.pumpWidget(const RakshaPayApp());
    await tester.pump();

    expect(find.text('RakshaPay'), findsOneWidget);
    expect(find.byIcon(Icons.shield_outlined), findsOneWidget);
  });
}
