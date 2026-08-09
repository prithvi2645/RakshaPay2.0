import 'dart:convert';

import 'risk_result.dart';

/// A single scored payment check, kept locally so the home screen can show
/// stats and recent activity. Never synced — it reveals which merchants a
/// user pays, which stays on-device by design.
class ScanRecord {
  final String? merchantName;
  final String vpa;
  final double? amount;
  final RiskLevel level;
  final int score;
  final DateTime scannedAt;
  final String source; // qr | qr_image | manual | sms
  final String? preview;
  final List<String> reasons;

  const ScanRecord({
    required this.merchantName,
    required this.vpa,
    required this.amount,
    required this.level,
    required this.score,
    required this.scannedAt,
    required this.source,
    this.preview,
    this.reasons = const [],
  });

  Map<String, dynamic> toJson() => {
        'merchantName': merchantName,
        'vpa': vpa,
        'amount': amount,
        'level': level.name,
        'score': score,
        'scannedAt': scannedAt.toIso8601String(),
        'source': source,
        'preview': preview,
        'reasons': reasons,
      };

  factory ScanRecord.fromJson(Map<String, dynamic> json) => ScanRecord(
        merchantName: json['merchantName'] as String?,
        vpa: json['vpa'] as String? ?? '',
        amount: (json['amount'] as num?)?.toDouble(),
        level: RiskLevel.values.firstWhere(
          (l) => l.name == json['level'],
          orElse: () => RiskLevel.safe,
        ),
        score: json['score'] as int? ?? 0,
        scannedAt: DateTime.tryParse(json['scannedAt'] as String? ?? '') ?? DateTime.now(),
        source: json['source'] as String? ?? 'qr',
        preview: json['preview'] as String?,
        reasons: (json['reasons'] as List?)?.cast<String>() ?? const [],
      );

  String encode() => jsonEncode(toJson());
  static ScanRecord decode(String raw) => ScanRecord.fromJson(jsonDecode(raw) as Map<String, dynamic>);
}
