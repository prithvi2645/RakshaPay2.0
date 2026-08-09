import 'dart:convert';
import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/risk_result.dart';

/// Community scam-pattern database.
///
/// Patterns sync down from Supabase into a local cache so scoring keeps
/// working offline. Only derived signals ever go up — never raw QR, SMS or
/// notification content.
class ScamDatabaseService {
  static const _cacheKey = 'cached_scam_vpas';
  static const _syncedAtKey = 'scam_patterns_synced_at';
  static const _pendingKey = 'pending_scam_reports';
  static const _deviceTokenKey = 'device_report_token';

  Set<String> _cachedVpas = {};

  /// Injected only in tests. Resolved lazily otherwise: touching
  /// Supabase.instance eagerly would throw when initialization failed, taking
  /// down an app that is supposed to work offline.
  final SupabaseClient? _injectedClient;

  ScamDatabaseService({SupabaseClient? client}) : _injectedClient = client;

  SupabaseClient? get _client {
    if (_injectedClient != null) return _injectedClient;
    try {
      return Supabase.instance.client;
    } catch (_) {
      return null;
    }
  }

  Set<String> get cachedVpas => Set.unmodifiable(_cachedVpas);

  Future<void> loadCache() async {
    final prefs = await SharedPreferences.getInstance();
    _cachedVpas = (prefs.getStringList(_cacheKey) ?? const []).toSet();
  }

  /// A random per-install token — not a hardware or advertising ID. It exists
  /// only so the backend can count *distinct devices* toward the report
  /// threshold; it identifies nothing about the user or the phone, and is
  /// discarded on uninstall.
  Future<String> _deviceToken() async {
    final prefs = await SharedPreferences.getInstance();
    final existing = prefs.getString(_deviceTokenKey);
    if (existing != null && existing.isNotEmpty) return existing;

    final rng = Random.secure();
    final bytes = List<int>.generate(24, (_) => rng.nextInt(256));
    final token = base64Url.encode(bytes);
    await prefs.setString(_deviceTokenKey, token);
    return token;
  }

  /// Best-effort refresh from Supabase. Failures are swallowed on purpose —
  /// a failed sync must never block scoring a payment.
  Future<bool> sync() async {
    final client = _client;
    if (client == null) return false;
    try {
      final rows = await client
          .from('scam_patterns')
          .select('vpa')
          .eq('active', true)
          .eq('kind', 'vpa')
          .timeout(const Duration(seconds: 10));

      final vpas = (rows as List)
          .map((row) => (row['vpa'] as String?)?.toLowerCase().trim())
          .whereType<String>()
          .where((vpa) => vpa.isNotEmpty)
          .toSet();

      _cachedVpas = vpas;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList(_cacheKey, vpas.toList());
      await prefs.setString(_syncedAtKey, DateTime.now().toIso8601String());

      await flushPendingReports();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<DateTime?> lastSyncedAt() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_syncedAtKey);
    return raw == null ? null : DateTime.tryParse(raw);
  }

  bool isKnownScam(String vpa) => vpa.isNotEmpty && _cachedVpas.contains(vpa.toLowerCase().trim());

  /// Submits an anonymized report. Only the payee VPA and a reason code are
  /// sent — never the raw message or QR payload.
  Future<bool> reportScam({required String vpa, required String reasonCode}) async {
    if (vpa.isEmpty) return false;

    final client = _client;
    if (client != null) {
      try {
        await client.from('reports').insert({
          'vpa': vpa.toLowerCase().trim(),
          'kind': 'vpa',
          'reason_code': reasonCode,
          'device_hash': await _deviceToken(),
        }).timeout(const Duration(seconds: 10));
        return true;
      } on PostgrestException catch (e) {
        // 23505 = unique violation: this device already reported this VPA.
        // The report is on file and counted, so this is a success, not a
        // failure — queueing it would mean retrying forever.
        if (e.code == '23505') return true;
        return false;
      } catch (_) {
        // Network/timeout — fall through and queue it.
      }
    }

    await _queueReport(vpa: vpa, reasonCode: reasonCode);
    return false;
  }

  Future<void> _queueReport({required String vpa, required String reasonCode}) async {
    final prefs = await SharedPreferences.getInstance();
    final queued = prefs.getStringList(_pendingKey) ?? [];
    final entry = jsonEncode({'vpa': vpa.toLowerCase().trim(), 'reasonCode': reasonCode});
    if (!queued.contains(entry)) {
      queued.add(entry);
      await prefs.setStringList(_pendingKey, queued);
    }
  }

  Future<int> pendingReportCount() async {
    final prefs = await SharedPreferences.getInstance();
    return (prefs.getStringList(_pendingKey) ?? const []).length;
  }

  Future<int> flushPendingReports() async {
    final client = _client;
    if (client == null) return 0;

    final prefs = await SharedPreferences.getInstance();
    final queued = prefs.getStringList(_pendingKey) ?? [];
    if (queued.isEmpty) return 0;

    final token = await _deviceToken();
    final remaining = <String>[];
    var sent = 0;

    for (final entry in queued) {
      try {
        final data = jsonDecode(entry) as Map<String, dynamic>;
        await client.from('reports').insert({
          'vpa': data['vpa'],
          'kind': 'vpa',
          'reason_code': data['reasonCode'],
          'device_hash': token,
        }).timeout(const Duration(seconds: 10));
        sent++;
      } on PostgrestException catch (e) {
        if (e.code == '23505') sent++;
      } catch (_) {
        remaining.add(entry);
      }
    }

    await prefs.setStringList(_pendingKey, remaining);
    return sent;
  }

  /// Anonymized telemetry: risk level and score only, no content.
  Future<void> logRiskEvent({required RiskResult result, required String source}) async {
    final client = _client;
    if (client == null) return;
    try {
      await client.from('risk_logs').insert({
        'level': result.level.name,
        'score': result.score,
        'source': source,
      }).timeout(const Duration(seconds: 10));
    } catch (_) {
      // Telemetry is best-effort; never surface a failure to the user.
    }
  }
}
