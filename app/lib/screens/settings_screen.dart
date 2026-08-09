import 'package:flutter/material.dart';

import '../services/risk_engine.dart';
import '../services/sms_monitor_service.dart';
import '../services/tts_service.dart';
import '../theme/app_theme.dart';

class SettingsScreen extends StatefulWidget {
  final RiskEngine engine;
  const SettingsScreen({super.key, required this.engine});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _tts = TtsService();
  String _language = TtsService.languages.first.code;
  bool _smsWatching = false;
  bool _syncing = false;
  late final SmsMonitorService _smsMonitor = SmsMonitorService(widget.engine);

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
    if (value) {
      final ok = await _smsMonitor.start();
      if (mounted) setState(() => _smsWatching = ok);
    } else {
      setState(() => _smsWatching = false);
    }
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
            child: SwitchListTile(
              value: _smsWatching,
              onChanged: _toggleSms,
              title: const Text('Watch SMS for scams'),
              subtitle: const Text('Reads incoming messages on-device only'),
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
