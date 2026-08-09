import 'package:shared_preferences/shared_preferences.dart';

import '../models/risk_result.dart';
import '../models/scan_record.dart';

/// Local scan history — powers the home screen's stats and Recent Checks.
///
/// Deliberately on-device only: the history includes which merchants a user
/// pays, which never leaves the phone.
class ScanHistoryService {
  static const _key = 'scan_history';
  static const _maxRecords = 100;

  List<ScanRecord> _records = [];

  List<ScanRecord> get records => List.unmodifiable(_records);

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_key) ?? const [];
    _records = raw
        .map((entry) {
          try {
            return ScanRecord.decode(entry);
          } catch (_) {
            return null;
          }
        })
        .whereType<ScanRecord>()
        .toList()
      ..sort((a, b) => b.scannedAt.compareTo(a.scannedAt));
  }

  Future<void> add(ScanRecord record) async {
    _records.insert(0, record);
    if (_records.length > _maxRecords) {
      _records = _records.sublist(0, _maxRecords);
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_key, _records.map((r) => r.encode()).toList());
  }

  int get scansToday {
    final now = DateTime.now();
    return _records.where((r) => r.scannedAt.year == now.year && r.scannedAt.month == now.month && r.scannedAt.day == now.day).length;
  }

  int countByLevel(RiskLevel level) => _records.where((r) => r.level == level).length;
}
