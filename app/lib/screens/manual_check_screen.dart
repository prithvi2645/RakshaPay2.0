import 'package:flutter/material.dart';

import '../models/scan_record.dart';
import '../services/risk_engine.dart';
import '../services/scan_history_service.dart';
import '../theme/app_theme.dart';
import 'risk_result_screen.dart';

class ManualCheckScreen extends StatefulWidget {
  final RiskEngine engine;
  final ScanHistoryService history;
  const ManualCheckScreen({super.key, required this.engine, required this.history});

  @override
  State<ManualCheckScreen> createState() => _ManualCheckScreenState();
}

class _ManualCheckScreenState extends State<ManualCheckScreen> {
  final _controller = TextEditingController();
  bool _checking = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _check() async {
    final vpa = _controller.text.trim();
    if (vpa.isEmpty) return;

    setState(() => _checking = true);
    try {
      final payload = 'upi://pay?pa=${Uri.encodeComponent(vpa)}&cu=INR';
      final result = widget.engine.analyzeQr(payload);
      final features = widget.engine.qrAnalyzer.extractFeatures(payload);

      await widget.history.add(ScanRecord(
        merchantName: null,
        vpa: features.vpa,
        amount: null,
        level: result.level,
        score: result.score,
        scannedAt: DateTime.now(),
        source: 'manual',
        reasons: result.reasons,
      ));
      widget.engine.scamDatabase.logRiskEvent(result: result, source: 'manual');

      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => RiskResultScreen(engine: widget.engine, result: result, vpa: features.vpa, rawPayload: payload),
      ));
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Check a UPI ID'), backgroundColor: AppColors.background, elevation: 0, foregroundColor: AppColors.navy),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Enter the UPI ID you want to check before paying.', style: AppTheme.body(14, color: AppColors.muted, height: 1.4)),
            const SizedBox(height: 18),
            TextField(
              controller: _controller,
              autofocus: true,
              decoration: const InputDecoration(hintText: 'merchant@upi', prefixIcon: Icon(Icons.alternate_email), border: OutlineInputBorder()),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _controller.text.trim().isEmpty || _checking ? null : _check,
              child: _checking
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Check safety'),
            ),
          ],
        ),
      ),
    );
  }
}
