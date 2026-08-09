import 'package:flutter/material.dart';

import '../models/risk_result.dart';
import '../models/scan_record.dart';
import '../services/risk_engine.dart';
import '../services/scan_history_service.dart';
import '../services/sms_monitor_service.dart';
import '../theme/app_theme.dart';
import 'alerts_screen.dart';
import 'manual_check_screen.dart';
import 'report_scam_screen.dart';
import 'scan_screen.dart';
import 'settings_screen.dart';

class HomeScreen extends StatefulWidget {
  final RiskEngine engine;
  final ScanHistoryService history;
  final SmsMonitorService smsMonitor;
  const HomeScreen({
    super.key,
    required this.engine,
    required this.history,
    required this.smsMonitor,
  });

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;

  void _refresh() => setState(() {});

  @override
  Widget build(BuildContext context) {
    final pages = [
      _HomeTab(
        engine: widget.engine,
        history: widget.history,
        smsMonitor: widget.smsMonitor,
        onChanged: _refresh,
      ),
      AlertsScreen(history: widget.history),
      const SizedBox.shrink(), // scan handled via push, not a tab body
      SettingsScreen(
        engine: widget.engine,
        history: widget.history,
        smsMonitor: widget.smsMonitor,
        onHistoryCleared: _refresh,
      ),
    ];

    return Scaffold(
      body: IndexedStack(index: _tab == 2 ? 0 : _tab, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) async {
          if (i == 2) {
            await Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => ScanScreen(engine: widget.engine, history: widget.history),
            ));
            _refresh();
            return;
          }
          setState(() => _tab = i);
        },
        destinations: [
          const NavigationDestination(icon: Icon(Icons.shield_outlined), selectedIcon: Icon(Icons.shield), label: 'Home'),
          NavigationDestination(
            icon: Badge(
              label: Text('${widget.history.countByLevel(RiskLevel.highRisk) + widget.history.countByLevel(RiskLevel.caution)}'),
              isLabelVisible: (widget.history.countByLevel(RiskLevel.highRisk) + widget.history.countByLevel(RiskLevel.caution)) > 0,
              child: const Icon(Icons.notifications_none),
            ),
            selectedIcon: const Icon(Icons.notifications),
            label: 'Alerts',
          ),
          const NavigationDestination(icon: Icon(Icons.qr_code_scanner), label: 'Scan'),
          const NavigationDestination(icon: Icon(Icons.settings_outlined), selectedIcon: Icon(Icons.settings), label: 'Settings'),
        ],
      ),
    );
  }
}

class _HomeTab extends StatefulWidget {
  final RiskEngine engine;
  final ScanHistoryService history;
  final SmsMonitorService smsMonitor;
  final VoidCallback onChanged;
  const _HomeTab({
    required this.engine,
    required this.history,
    required this.smsMonitor,
    required this.onChanged,
  });

  @override
  State<_HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<_HomeTab> {
  bool _scanningMessages = false;

  /// On the home screen rather than buried in Settings: "check the messages I
  /// already have" is a thing a worried person wants to do the moment they open
  /// the app, not a preference they configure once.
  Future<void> _checkMessages() async {
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _scanningMessages = true);

    try {
      final scored = await widget.smsMonitor.scanInbox();
      if (!mounted) return;
      setState(() => _scanningMessages = false);
      widget.onChanged();

      if (widget.smsMonitor.permissionDenied) {
        messenger.showSnackBar(const SnackBar(
          content: Text('SMS permission is needed to read your messages. Nothing is uploaded.'),
          duration: Duration(seconds: 5),
        ));
        return;
      }

      final risky = scored.where((a) => a.result.level != RiskLevel.safe).length;
      messenger.showSnackBar(SnackBar(
        content: Text(risky == 0
            ? 'Checked ${scored.length} messages — nothing suspicious found.'
            : 'Checked ${scored.length} messages. $risky need${risky == 1 ? 's' : ''} attention — see Alerts.'),
        duration: const Duration(seconds: 5),
      ));
    } catch (e) {
      if (!mounted) return;
      setState(() => _scanningMessages = false);
      messenger.showSnackBar(SnackBar(content: Text('Could not read messages: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final engine = widget.engine;
    final history = widget.history;
    final onChanged = widget.onChanged;
    final safety = 100 - (history.records.isEmpty ? 0 : (history.records.take(10).map((r) => r.score).reduce((a, b) => a + b) / history.records.take(10).length)).round();

    return SafeArea(
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(24, 20, 24, 28),
              decoration: const BoxDecoration(color: AppColors.navy, borderRadius: BorderRadius.vertical(bottom: Radius.circular(28))),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Stay protected,', style: AppTheme.body(14, color: Colors.white70)),
                          Text('RakshaPay', style: AppTheme.heading(26, color: Colors.white)),
                        ],
                      ),
                      IconButton(
                        onPressed: () async {
                          await engine.scamDatabase.sync();
                          onChanged();
                        },
                        icon: const Icon(Icons.sync, color: Colors.white70),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(20)),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Safety Score', style: AppTheme.body(13, color: Colors.white70)),
                              const SizedBox(height: 6),
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text('$safety', style: AppTheme.heading(36, color: Colors.white)),
                                  Text('/100', style: AppTheme.body(15, color: Colors.white54)),
                                ],
                              ),
                            ],
                          ),
                        ),
                        Icon(Icons.shield, color: safety >= 70 ? AppColors.safe : (safety >= 35 ? AppColors.caution : AppColors.danger), size: 44),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      _StatCard(label: 'Scans today', value: '${history.scansToday}', color: AppColors.navy),
                      const SizedBox(width: 12),
                      _StatCard(label: 'Safe payments', value: '${history.countByLevel(RiskLevel.safe)}', color: AppColors.safe),
                      const SizedBox(width: 12),
                      _StatCard(label: 'Risks found', value: '${history.countByLevel(RiskLevel.highRisk)}', color: AppColors.danger),
                    ],
                  ),
                  const SizedBox(height: 22),
                  Row(
                    children: [
                      Expanded(
                        child: _ActionTile(
                          icon: Icons.keyboard_outlined,
                          label: 'Check a UPI ID',
                          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ManualCheckScreen(engine: engine, history: history))).then((_) => onChanged()),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _ActionTile(
                          icon: Icons.flag_outlined,
                          label: 'Report a Scam',
                          color: AppColors.danger,
                          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ReportScamScreen(engine: engine))),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _scanningMessages ? null : _checkMessages,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.navy,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                      icon: _scanningMessages
                          ? const SizedBox(
                              width: 17,
                              height: 17,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Icon(Icons.mark_email_unread_outlined),
                      label: Text(
                        _scanningMessages ? 'Checking your messages...' : 'Check my messages',
                        style: AppTheme.body(14.5, color: Colors.white).copyWith(fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Reads the messages already on your phone and flags anything risky. Nothing is uploaded.',
                    textAlign: TextAlign.center,
                    style: AppTheme.body(11.5, color: AppColors.muted, height: 1.35),
                  ),
                  const SizedBox(height: 26),
                  Text('Recent Checks', style: AppTheme.heading(17)),
                  const SizedBox(height: 10),
                  if (history.records.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 30),
                      child: Center(child: Text('No checks yet — scan a QR to get started', style: AppTheme.body(13.5, color: AppColors.muted))),
                    )
                  else
                    ...history.records.take(6).map(_RecentTile.new),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label, value;
  final Color color;
  const _StatCard({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), boxShadow: kCardShadow),
        child: Column(
          children: [
            Text(value, style: AppTheme.heading(22, color: color)),
            const SizedBox(height: 4),
            Text(label, style: AppTheme.body(11.5, color: AppColors.muted), textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color? color;
  final VoidCallback onTap;
  const _ActionTile({required this.icon, required this.label, required this.onTap, this.color});

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.navy;
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 12),
          child: Column(
            children: [
              Icon(icon, color: c, size: 26),
              const SizedBox(height: 8),
              Text(label, style: AppTheme.body(13, color: AppColors.navy), textAlign: TextAlign.center),
            ],
          ),
        ),
      ),
    );
  }
}

class _RecentTile extends StatelessWidget {
  final ScanRecord record;
  const _RecentTile(this.record);

  @override
  Widget build(BuildContext context) {
    final (color, bg) = switch (record.level) {
      RiskLevel.safe => (AppColors.safe, AppColors.safeBg),
      RiskLevel.caution => (AppColors.caution, AppColors.cautionBg),
      RiskLevel.highRisk => (AppColors.danger, AppColors.dangerBg),
    };
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), boxShadow: kCardShadow),
      child: Row(
        children: [
          Container(width: 8, height: 40, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(4))),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(record.merchantName ?? record.vpa, style: AppTheme.body(14, color: AppColors.navy), maxLines: 1, overflow: TextOverflow.ellipsis),
                Text(record.vpa, style: AppTheme.body(11.5, color: AppColors.muted), maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
            child: Text('${record.score}', style: AppTheme.body(12, color: color)),
          ),
        ],
      ),
    );
  }
}
