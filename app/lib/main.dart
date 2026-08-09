import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'screens/home_screen.dart';
import 'screens/onboarding_screen.dart';
import 'screens/permissions_screen.dart';
import 'screens/splash_screen.dart';
import 'services/risk_engine.dart';
import 'services/scan_history_service.dart';
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
    _engine.dispose();
    super.dispose();
  }

  Future<void> _boot() async {
    try {
      setState(() => _status = 'Loading on-device models...');
      await _engine.init();

      setState(() => _status = 'Loading your history...');
      await _history.load();

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
      _Stage.home => HomeScreen(engine: _engine, history: _history),
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
