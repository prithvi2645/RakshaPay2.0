import 'dart:async';

import 'package:another_telephony/telephony.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/risk_result.dart';
import 'risk_engine.dart';

class ScamAlert {
  final String body;
  final String? sender;
  final RiskResult result;
  final DateTime receivedAt;

  ScamAlert({
    required this.body,
    required this.sender,
    required this.result,
    required this.receivedAt,
  });
}

/// Watches incoming SMS and scores each one on-device.
///
/// Message bodies are read, scored, and discarded in memory — nothing is
/// uploaded. Only the resulting risk level syncs, and only if the user reports.
///
/// **Ownership matters here.** This must be created once for the lifetime of
/// the app and its [alerts] stream must have a subscriber. It previously lived
/// inside the Settings screen's state with nothing listening, which meant
/// granting the permission appeared to work and then did nothing: every scored
/// message went into a stream with no listener, and the whole service was
/// disposed as soon as the user navigated away from Settings.
class SmsMonitorService {
  static const _enabledKey = 'sms_watch_enabled';

  final Telephony _telephony = Telephony.instance;
  final RiskEngine _engine;
  final _alertController = StreamController<ScamAlert>.broadcast();

  SmsMonitorService(this._engine);

  Stream<ScamAlert> get alerts => _alertController.stream;

  bool _watching = false;
  bool get isWatching => _watching;

  /// Set when the user turned the toggle on but the OS permission was refused,
  /// so the UI can explain rather than silently snapping the switch back.
  bool _permissionDenied = false;
  bool get permissionDenied => _permissionDenied;

  Future<bool> requestPermissions() async {
    final granted = await _telephony.requestPhoneAndSmsPermissions;
    return granted ?? false;
  }

  /// Starts listening. Returns false if the user declined SMS permission.
  Future<bool> start() async {
    if (_watching) return true;

    final granted = await requestPermissions();
    _permissionDenied = !granted;
    if (!granted) return false;

    _telephony.listenIncomingSms(
      onNewMessage: (msg) => _handle(msg.body, msg.address),
      listenInBackground: false,
    );

    _watching = true;
    await _persist(true);
    return true;
  }

  Future<void> stop() async {
    // another_telephony has no unlisten, so the handler stays registered and is
    // gated on the flag instead. Cheap, and it keeps "off" honest.
    _watching = false;
    await _persist(false);
  }

  /// Re-arms the listener on launch if the user had it on. Without this the
  /// toggle silently reset to off on every cold start.
  Future<bool> restoreIfEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    if (!(prefs.getBool(_enabledKey) ?? false)) return false;
    return start();
  }

  /// Scores the messages already in the inbox and returns the risky ones.
  ///
  /// The live listener only fires while the app is in the foreground, which
  /// makes it almost impossible to observe on a single phone: you have to leave
  /// RakshaPay to receive the message, and leaving is exactly what stops the
  /// listener delivering. Reading the inbox on demand has no such timing
  /// dependency — and it is the more useful feature anyway, because it covers
  /// the scam that arrived yesterday, before the app was ever installed.
  ///
  /// Bodies are read, scored and dropped. Only the risky ones are surfaced, and
  /// nothing is uploaded.
  Future<List<ScamAlert>> scanInbox({int limit = 60}) async {
    final granted = await requestPermissions();
    _permissionDenied = !granted;
    if (!granted) return const [];

    final messages = await _telephony.getInboxSms(
      columns: [SmsColumn.ADDRESS, SmsColumn.BODY, SmsColumn.DATE],
      sortOrder: [OrderBy(SmsColumn.DATE, sort: Sort.DESC)],
    );

    // Safe messages are kept too. The Alerts screen has a Messages tab that is
    // meant to read like an inbox — "these are your messages, here is what we
    // made of each" — and a list that silently omitted everything harmless
    // would be a filtered alert list wearing an inbox's name.
    final scored = <ScamAlert>[];
    for (final message in messages.take(limit)) {
      final body = message.body;
      if (body == null || body.isEmpty) continue;

      scored.add(ScamAlert(
        body: body,
        sender: message.address,
        result: _engine.analyzeMessage(body, sender: message.address).result,
        receivedAt: message.date != null
            ? DateTime.fromMillisecondsSinceEpoch(message.date!)
            : DateTime.now(),
      ));
    }

    // Through the same stream the live listener uses, so these land in history
    // and the Alerts badge exactly like a message caught in real time.
    for (final alert in scored) {
      _alertController.add(alert);
    }
    return scored;
  }

  Future<void> _persist(bool enabled) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_enabledKey, enabled);
  }

  void _handle(String? body, String? sender) {
    if (!_watching) return;
    if (body == null || body.isEmpty) return;

    // analyzeMessage rather than analyzeText: the most common shape of UPI
    // fraud by SMS carries its whole payload in a link, and a message like
    // "KYC pending, update here: <link>" asks for nothing in its wording.
    final result = _engine.analyzeMessage(body, sender: sender).result;
    if (result.level == RiskLevel.safe) return;

    _alertController.add(ScamAlert(
      body: body,
      sender: sender,
      result: result,
      receivedAt: DateTime.now(),
    ));
  }

  void dispose() => _alertController.close();
}
