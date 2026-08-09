import 'package:flutter/material.dart';

import '../models/risk_result.dart';
import '../models/scan_record.dart';
import '../services/scan_history_service.dart';
import '../theme/app_theme.dart';

/// High risk and caution are separate tabs rather than one "risky" bucket.
/// They call for different actions — one means stop, the other means look
/// closer — and collapsing them hides that distinction exactly where it
/// matters. `messages` is every SMS that has been checked, safe ones included,
/// so it reads as an inbox rather than as a filtered alert list.
enum _Filter { all, highRisk, caution, messages }

class AlertsScreen extends StatefulWidget {
  final ScanHistoryService history;
  const AlertsScreen({super.key, required this.history});

  @override
  State<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends State<AlertsScreen> {
  _Filter _filter = _Filter.all;

  @override
  Widget build(BuildContext context) {
    final records = widget.history.records;
    final list = switch (_filter) {
      _Filter.all => records,
      _Filter.highRisk => records.where((r) => r.level == RiskLevel.highRisk).toList(),
      _Filter.caution => records.where((r) => r.level == RiskLevel.caution).toList(),
      _Filter.messages => records.where((r) => r.source == 'sms').toList(),
    };

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Alerts'), backgroundColor: AppColors.background, elevation: 0, foregroundColor: AppColors.navy),
      body: Column(
        children: [
          SizedBox(
            height: 48,
            // Scrollable: four chips do not fit across a narrow phone, and a
            // wrapped row would push the list down.
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              children: [
                _chip('All', _Filter.all, widget.history.records.length),
                const SizedBox(width: 8),
                _chip('High risk', _Filter.highRisk, widget.history.countByLevel(RiskLevel.highRisk)),
                const SizedBox(width: 8),
                _chip('Caution', _Filter.caution, widget.history.countByLevel(RiskLevel.caution)),
                const SizedBox(width: 8),
                _chip('Messages', _Filter.messages,
                    widget.history.records.where((r) => r.source == 'sms').length),
              ],
            ),
          ),
          Expanded(
            child: list.isEmpty
                ? Center(child: Text(_emptyLabel, style: AppTheme.body(14, color: AppColors.muted)))
                : ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
                    itemCount: list.length,
                    itemBuilder: (context, i) => _AlertCard(list[i]),
                  ),
          ),
        ],
      ),
    );
  }

  String get _emptyLabel => switch (_filter) {
        _Filter.all => 'Nothing checked yet',
        _Filter.highRisk => 'No high-risk items. That is the good outcome.',
        _Filter.caution => 'Nothing needs a second look right now',
        _Filter.messages =>
          'No messages checked yet. Settings → Check recent messages will read the ones already on your phone.',
      };

  Widget _chip(String label, _Filter value, int count) {
    final selected = _filter == value;
    return ChoiceChip(
      // The count is on the chip because "Caution (0)" answers the question
      // before it is asked, instead of making the user tap to find an empty
      // list.
      label: Text(count > 0 ? '$label  $count' : label),
      selected: selected,
      onSelected: (_) => setState(() => _filter = value),
      selectedColor: AppColors.navy,
      labelStyle: AppTheme.body(13, color: selected ? Colors.white : AppColors.navy),
    );
  }
}

class _AlertCard extends StatelessWidget {
  final ScanRecord record;
  const _AlertCard(this.record);

  @override
  Widget build(BuildContext context) {
    final (color, bg, icon, label) = switch (record.level) {
      RiskLevel.safe => (AppColors.safe, AppColors.safeBg, Icons.check_circle_outline, 'Safe'),
      RiskLevel.caution => (AppColors.caution, AppColors.cautionBg, Icons.warning_amber_rounded, 'Caution'),
      RiskLevel.highRisk => (AppColors.danger, AppColors.dangerBg, Icons.dangerous_outlined, 'High Risk'),
    };
    final sourceLabel = switch (record.source) {
      'sms' => 'Message',
      'manual' => 'Typed UPI ID',
      'qr_image' => 'QR image',
      _ => 'QR scan',
    };

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), border: Border.all(color: bg), boxShadow: kCardShadow),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 20),
              const SizedBox(width: 8),
              Text(label, style: AppTheme.heading(14, color: color)),
              const Spacer(),
              Text(sourceLabel, style: AppTheme.body(11.5, color: AppColors.muted)),
            ],
          ),
          const SizedBox(height: 8),
          Text(record.merchantName ?? record.vpa, style: AppTheme.body(14)),
          if (record.reasons.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(record.reasons.first, style: AppTheme.body(12.5, color: AppColors.muted, height: 1.3)),
          ],
        ],
      ),
    );
  }
}
