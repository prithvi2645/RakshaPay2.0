import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:rakshapay/main.dart';
import 'package:rakshapay/widgets/brand_mark.dart';

void main() {
  testWidgets('shows the branded splash while models load', (tester) async {
    await tester.pumpWidget(const RakshaPayApp());
    await tester.pump();

    expect(find.text('RakshaPay'), findsOneWidget);
    // The brand mark, not Material's stock shield icon. This assertion is the
    // reason the splash cannot quietly drift back to a generic glyph.
    expect(find.byType(BrandMark), findsOneWidget);
  });
}
