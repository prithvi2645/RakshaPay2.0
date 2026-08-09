import 'package:flutter/material.dart';

import '../models/risk_result.dart';
import '../models/scan_record.dart';
import '../services/scan_history_service.dart';
import '../theme/app_theme.dart';

enum _Filter { all, risky, messages }

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
    final risky = widget.history.records.where((r) => r.level != RiskLevel.safe).toList();
    final list = switch (_filter) {
      _Filter.all => widget.history.records,
      _Filter.risky => risky,
      _Filter.messages => risky.where((r) => r.source == 'sms').toList(),
    };

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Alerts'), backgroundColor: AppColors.background, elevation: 0, foregroundColor: AppColors.navy),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                _chip('All', _Filter.all),
                const SizedBox(width: 8),
                _chip('Risky', _Filter.risky),
                const SizedBox(width: 8),
                _chip('Messages', _Filter.messages),
              ],
            ),
          ),
          Expanded(
            child: list.isEmpty
                ? Center(child: Text('Nothing here yet', style: AppTheme.body(14, color: AppColors.muted)))
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

  Widget _chip(String label, _Filter value) {
    final selected = _filter == value;
    return ChoiceChip(
      label: Text(label),
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
