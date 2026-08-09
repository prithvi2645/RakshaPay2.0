import 'package:flutter/material.dart';

import '../models/risk_result.dart';
import '../services/risk_engine.dart';
import '../services/scam_text_matcher.dart';
import '../services/tts_service.dart';
import '../theme/app_theme.dart';
import 'report_scam_screen.dart';

class RiskResultScreen extends StatefulWidget {
  final RiskEngine engine;
  final RiskResult result;
  final String? vpa;
  final String? merchantName;
  final double? amount;
  final String? rawPayload;

  const RiskResultScreen({
    super.key,
    required this.engine,
    required this.result,
    this.vpa,
    this.merchantName,
    this.amount,
    this.rawPayload,
  });

  @override
  State<RiskResultScreen> createState() => _RiskResultScreenState();
}

class _RiskResultScreenState extends State<RiskResultScreen> {
  final _tts = TtsService();
  bool _reported = false;

  @override
  void initState() {
    super.initState();
    _speak();
  }

  @override
  void dispose() {
    _tts.stop();
    super.dispose();
  }

  Future<void> _speak() async {
    await _tts.loadSavedLanguage();
    await _tts.speakResult(widget.result, messageText: widget.rawPayload);
  }

  String? get _reportableVpa {
    if (widget.vpa != null && widget.vpa!.isNotEmpty) return widget.vpa;
    final payload = widget.rawPayload;
    return payload == null ? null : ScamTextMatcher.extractVpa(payload);
  }

  Future<void> _report() async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ReportScamScreen(
        engine: widget.engine,
        prefilledVpa: _reportableVpa,
        onReported: () {
          if (mounted) setState(() => _reported = true);
        },
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final (color, bg, icon, label) = switch (widget.result.level) {
      RiskLevel.safe => (AppColors.safe, AppColors.safeBg, Icons.check_circle_outline, 'Looks Safe'),
      RiskLevel.caution => (AppColors.caution, AppColors.cautionBg, Icons.warning_amber_rounded, 'Caution'),
      RiskLevel.highRisk => (AppColors.danger, AppColors.dangerBg, Icons.dangerous_outlined, 'High Risk'),
    };

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Spacer(),
              Container(width: 110, height: 110, decoration: BoxDecoration(color: bg, shape: BoxShape.circle), child: Icon(icon, color: color, size: 56)),
              const SizedBox(height: 20),
              Text(label, style: AppTheme.heading(26, color: color)),
              const SizedBox(height: 8),
              Text('Risk score: ${widget.result.score} / 100', style: AppTheme.body(14, color: AppColors.muted)),
              if (widget.merchantName != null) ...[
                const SizedBox(height: 18),
                Text(widget.merchantName!, style: AppTheme.heading(18)),
              ],
              if (widget.vpa != null) Text(widget.vpa!, style: AppTheme.body(13, color: AppColors.muted)),
              if (widget.amount != null) Text('₹${widget.amount!.toStringAsFixed(2)}', style: AppTheme.heading(20)),
              const SizedBox(height: 22),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), boxShadow: kCardShadow),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Why', style: AppTheme.heading(14)),
                    const SizedBox(height: 8),
                    ...widget.result.reasons.map((r) => Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            const Text('•  '),
                            Expanded(child: Text(r, style: AppTheme.body(13.5, height: 1.4))),
                          ]),
                        )),
                  ],
                ),
              ),
              const Spacer(),
              Row(
                children: [
                  if (widget.result.level != RiskLevel.safe)
                    Expanded(
                      child: FilledButton(
                        style: FilledButton.styleFrom(backgroundColor: color),
                        onPressed: () => Navigator.of(context).pop(false),
                        child: const Text('Cancel'),
                      ),
                    ),
                  if (widget.result.level == RiskLevel.safe)
                    Expanded(
                      child: FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Proceed')),
                    ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger, side: const BorderSide(color: AppColors.dangerBorder, width: 1.5)),
                      onPressed: _reported ? null : _report,
                      icon: Icon(_reported ? Icons.check : Icons.flag_outlined, size: 18),
                      label: Text(_reported ? 'Reported' : 'Report'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
