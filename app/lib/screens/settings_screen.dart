import 'package:flutter/material.dart';

import '../services/risk_engine.dart';
import '../services/scan_history_service.dart';
import '../services/sms_monitor_service.dart';
import '../services/tts_service.dart';
import '../theme/app_theme.dart';

class SettingsScreen extends StatefulWidget {
  final RiskEngine engine;
  final ScanHistoryService history;
  final SmsMonitorService smsMonitor;
  final VoidCallback? onHistoryCleared;

  const SettingsScreen({
    super.key,
    required this.engine,
    required this.history,
    required this.smsMonitor,
    this.onHistoryCleared,
  });

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _tts = TtsService();
  String _language = TtsService.languages.first.code;
  bool _syncing = false;

  // Read from the shared service rather than a local copy, so the switch shows
  // what is actually running instead of resetting every time this screen is
  // rebuilt.
  bool get _smsWatching => widget.smsMonitor.isWatching;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final saved = await _tts.loadSavedLanguage();
    if (mounted) setState(() => _language = saved);
  }

  Future<void> _toggleSms(bool value) async {
    final messenger = ScaffoldMessenger.of(context);

    if (!value) {
      await widget.smsMonitor.stop();
      if (mounted) setState(() {});
      return;
    }

    final ok = await widget.smsMonitor.start();
    if (!mounted) return;
    setState(() {});

    // A switch that silently flips back is indistinguishable from a broken
    // feature, which is exactly how this read before.
    if (!ok) {
      messenger.showSnackBar(const SnackBar(
        content: Text(
          'SMS permission was denied. Grant it in Settings → Apps → RakshaPay → Permissions to let RakshaPay check incoming messages.',
        ),
        duration: Duration(seconds: 6),
      ));
    }
  }

  Future<void> _clearHistory() async {
    final messenger = ScaffoldMessenger.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Clear scan history?'),
        content: const Text(
          'This deletes every check stored on this phone, including message alerts. It cannot be undone.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Clear'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    await widget.history.clear();
    widget.onHistoryCleared?.call();
    if (!mounted) return;
    setState(() {});
    messenger.showSnackBar(const SnackBar(content: Text('Scan history cleared.')));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Settings'), backgroundColor: AppColors.background, elevation: 0, foregroundColor: AppColors.navy),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _SectionLabel('Voice alerts'),
          Container(
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), boxShadow: kCardShadow),
            child: Column(
              children: [
                RadioGroup<String>(
                  groupValue: _language,
                  onChanged: (code) async {
                    if (code == null) return;
                    await _tts.setLanguage(code);
                    setState(() => _language = code);
                  },
                  child: Column(
                    children: [
                      for (final lang in TtsService.languages)
                        RadioListTile<String>(value: lang.code, title: Text(lang.label)),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                  child: SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () async {
                        await _tts.setLanguage(_language);
                        await _tts.speakSample();
                      },
                      icon: const Icon(Icons.volume_up_outlined),
                      label: const Text('Test voice'),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          _SectionLabel('Protection'),
          Container(
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), boxShadow: kCardShadow),
            child: Column(
              children: [
                SwitchListTile(
                  value: _smsWatching,
                  onChanged: _toggleSms,
                  title: const Text('Watch SMS for scams'),
                  subtitle: const Text('Checks new messages while RakshaPay is open'),
                ),
                const Divider(height: 1),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
                  child: Text(
                    'To check the messages already on your phone, use "Check my messages" on the Home screen.',
                    style: AppTheme.body(12.5, color: AppColors.muted, height: 1.4),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          _SectionLabel('Community database'),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), boxShadow: kCardShadow),
            child: Row(
              children: [
                Expanded(child: Text('${widget.engine.scamDatabase.cachedVpas.length} known scam UPI IDs cached', style: AppTheme.body(13.5))),
                TextButton(
                  onPressed: _syncing
                      ? null
                      : () async {
                          setState(() => _syncing = true);
                          await widget.engine.scamDatabase.sync();
                          if (mounted) setState(() => _syncing = false);
                        },
                  child: Text(_syncing ? 'Syncing...' : 'Sync now'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          _SectionLabel('Your data'),
          Container(
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), boxShadow: kCardShadow),
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 6),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${widget.history.records.length} checks stored on this phone',
                          style: AppTheme.body(13.5),
                        ),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                  child: SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: widget.history.records.isEmpty ? null : _clearHistory,
                      style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger),
                      icon: const Icon(Icons.delete_outline),
                      label: const Text('Clear scan history'),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          _SectionLabel('Privacy'),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), boxShadow: kCardShadow),
            child: Text(
              'RakshaPay never uploads your QR codes or messages. Only a risk score, a reported UPI ID, or a reason code ever leaves your phone — and only when you choose to sync or report.',
              style: AppTheme.body(12.5, color: AppColors.muted, height: 1.5),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 4, 4, 10),
      child: Text(text.toUpperCase(), style: AppTheme.body(11.5, color: AppColors.muted).copyWith(letterSpacing: 0.6, fontWeight: FontWeight.w600)),
    );
  }
}
