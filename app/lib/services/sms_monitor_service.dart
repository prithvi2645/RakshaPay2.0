import 'dart:async';

import 'package:another_telephony/telephony.dart';

import '../models/risk_result.dart';
import 'risk_engine.dart';

class ScamAlert {
  final String body;
  final String? sender;
  final RiskResult result;
  final DateTime receivedAt;

  ScamAlert({required this.body, required this.sender, required this.result, required this.receivedAt});
}

/// Watches incoming SMS and scores each one on-device.
///
/// Message bodies are read, scored, and discarded in memory — nothing is
/// uploaded. Only the resulting risk level syncs, and only if the user reports.
class SmsMonitorService {
  final Telephony _telephony = Telephony.instance;
  final RiskEngine _engine;
  final _alertController = StreamController<ScamAlert>.broadcast();

  SmsMonitorService(this._engine);

  Stream<ScamAlert> get alerts => _alertController.stream;

  Future<bool> requestPermissions() async {
    final granted = await _telephony.requestPhoneAndSmsPermissions;
    return granted ?? false;
  }

  /// Starts listening. Returns false if the user declined SMS permission.
  Future<bool> start() async {
    final granted = await requestPermissions();
    if (!granted) return false;

    _telephony.listenIncomingSms(
      onNewMessage: (msg) => _handle(msg.body, msg.address),
      listenInBackground: false,
    );
    return true;
  }

  void _handle(String? body, String? sender) {
    if (body == null || body.isEmpty) return;
    final result = _engine.analyzeText(body, sender: sender);
    if (result.level == RiskLevel.safe) return;
    _alertController.add(ScamAlert(body: body, sender: sender, result: result, receivedAt: DateTime.now()));
  }

  void dispose() => _alertController.close();
}
