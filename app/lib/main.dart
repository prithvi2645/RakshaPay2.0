import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'screens/home_screen.dart';
import 'screens/onboarding_screen.dart';
import 'screens/permissions_screen.dart';
import 'screens/splash_screen.dart';
import 'models/scan_record.dart';
import 'services/risk_engine.dart';
import 'services/scan_history_service.dart';
import 'services/scam_text_matcher.dart';
import 'services/sms_monitor_service.dart';
import 'supabase_options.dart';
import 'theme/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (SupabaseOptions.isConfigured) {
    try {
      await Supabase.initialize(url: SupabaseOptions.url, publishableKey: SupabaseOptions.publishableKey);
    } catch (_) {
      // The app is offline-first: scoring runs entirely on-device, so a
      // failed backend init must not stop the user from checking a payment.
    }
  }
  runApp(const RakshaPayApp());
}

class RakshaPayApp extends StatelessWidget {
  const RakshaPayApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'RakshaPay',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.theme,
      home: const _Bootstrap(),
    );
  }
}

enum _Stage { loading, onboarding, permissions, home, failed }

class _Bootstrap extends StatefulWidget {
  const _Bootstrap();

  @override
  State<_Bootstrap> createState() => _BootstrapState();
}

class _BootstrapState extends State<_Bootstrap> {
  static const _seenOnboardingKey = 'seen_onboarding';

  final _engine = RiskEngine();
  final _history = ScanHistoryService();
  // Owned here, for the lifetime of the app. It used to live inside the
  // Settings screen's state, so it was destroyed the moment the user navigated
  // away and nothing ever listened to its alerts.
  late final SmsMonitorService _smsMonitor = SmsMonitorService(_engine);
  StreamSubscription<ScamAlert>? _alertSubscription;

  _Stage _stage = _Stage.loading;
  String _status = 'Loading protection...';
  String? _error;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  @override
  void dispose() {
    _alertSubscription?.cancel();
    _smsMonitor.dispose();
    _engine.dispose();
    super.dispose();
  }

  /// A flagged message becomes a record in the same history the Alerts tab
  /// already renders. Without this the monitor scored messages into a stream
  /// nobody read, which is indistinguishable from it not working at all.
  void _recordAlert(ScamAlert alert) {
    final vpa = ScamTextMatcher.extractVpa(alert.body) ?? alert.sender ?? 'Unknown sender';
    _history.add(ScanRecord(
      merchantName: alert.sender,
      vpa: vpa,
      amount: null,
      level: alert.result.level,
      score: alert.result.score,
      scannedAt: alert.receivedAt,
      source: 'sms',
      // Truncated: the Alerts list needs enough to recognise the message, and
      // the full body has no business being persisted.
      preview: alert.body.length > 140 ? '${alert.body.substring(0, 140)}…' : alert.body,
      reasons: alert.result.reasons,
    ));
    if (mounted) setState(() {});
  }

  Future<void> _boot() async {
    try {
      setState(() => _status = 'Loading on-device models...');
      await _engine.init();

      setState(() => _status = 'Loading your history...');
      await _history.load();

      _alertSubscription = _smsMonitor.alerts.listen(_recordAlert);
      // Re-arm the SMS watcher if the user had already turned it on. It is
      // best-effort: a refused permission must not stop the app booting.
      unawaited(_smsMonitor.restoreIfEnabled());

      final prefs = await SharedPreferences.getInstance();
      final seen = prefs.getBool(_seenOnboardingKey) ?? false;

      if (!mounted) return;
      setState(() => _stage = seen ? _Stage.home : _Stage.onboarding);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _stage = _Stage.failed;
        _error = '$e';
      });
    }
  }

  Future<void> _finishOnboarding() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_seenOnboardingKey, true);
    if (mounted) setState(() => _stage = _Stage.home);
  }

  @override
  Widget build(BuildContext context) {
    return switch (_stage) {
      _Stage.loading => SplashScreen(status: _status),
      _Stage.onboarding => OnboardingScreen(onDone: () => setState(() => _stage = _Stage.permissions)),
      _Stage.permissions => PermissionsScreen(onDone: _finishOnboarding),
      _Stage.home => HomeScreen(engine: _engine, history: _history, smsMonitor: _smsMonitor),
      _Stage.failed => _buildFailure(),
    };
  }

  Widget _buildFailure() {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 54, color: AppColors.danger),
              const SizedBox(height: 16),
              Text('Could not start protection', style: AppTheme.heading(20)),
              const SizedBox(height: 8),
              Text(
                _error ?? 'The on-device models failed to load.',
                textAlign: TextAlign.center,
                style: AppTheme.body(13.5, color: AppColors.muted, height: 1.45),
              ),
              const SizedBox(height: 22),
              FilledButton.icon(
                onPressed: () {
                  setState(() {
                    _stage = _Stage.loading;
                    _error = null;
                  });
                  _boot();
                },
                icon: const Icon(Icons.refresh),
                label: const Text('Try again'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
