import 'package:flutter/material.dart';

import '../models/risk_result.dart';
import '../services/link_risk_analyzer.dart';
import '../services/risk_engine.dart';
import '../services/url_rules.dart';
import '../theme/app_theme.dart';

/// Check a link on its own, without a message wrapped around it.
///
/// The link model already ran inside [RiskEngine.analyzeMessage], but only on
/// links that arrived in an SMS. A link forwarded on WhatsApp, read off a
/// poster, or pasted from anywhere else had no way in — which made the model
/// present but unreachable for the most common way people ask "is this link
/// safe?".
///
/// The address is read locally and **never opened**: fetching it would confirm
/// to whoever sent it that a real person received the message.
class LinkCheckScreen extends StatefulWidget {
  final RiskEngine engine;
  const LinkCheckScreen({super.key, required this.engine});

  @override
  State<LinkCheckScreen> createState() => _LinkCheckScreenState();
}

class _LinkCheckScreenState extends State<LinkCheckScreen> {
  final _controller = TextEditingController();
  bool _checking = false;
  LinkAnalysis? _analysis;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _check() async {
    final raw = _controller.text.trim();
    if (raw.isEmpty) return;

    setState(() {
      _checking = true;
      _error = null;
      _analysis = null;
    });

    try {
      // People paste "sbi-verify.xyz/kyc" far more often than a full URL.
      final url = RegExp(r'^https?://', caseSensitive: false).hasMatch(raw) ? raw : 'http://$raw';
      final analysis = widget.engine.linkAnalyzer.analyze(url);
      if (!mounted) return;
      setState(() {
        _analysis = analysis;
        _checking = false;
      });
      widget.engine.scamDatabase.logRiskEvent(result: analysis.result, source: 'link');
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e';
        _checking = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Check a Link'),
        backgroundColor: AppColors.background,
        elevation: 0,
        foregroundColor: AppColors.navy,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Paste a link you were sent. RakshaPay reads the address only — it never opens the link, because that would tell the sender you received their message.',
              style: AppTheme.body(13.5, color: AppColors.muted, height: 1.45),
            ),
            const SizedBox(height: 18),
            TextField(
              controller: _controller,
              autocorrect: false,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(
                hintText: 'https://...',
                prefixIcon: Icon(Icons.link),
              ),
              onChanged: (_) => setState(() {}),
              onSubmitted: (_) => _check(),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: (_controller.text.trim().isEmpty || _checking) ? null : _check,
              icon: _checking
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.search),
              label: Text(_checking ? 'Checking...' : 'Check this link'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(_error!, style: AppTheme.body(13, color: AppColors.danger)),
            ],
            if (_analysis != null) ...[
              const SizedBox(height: 22),
              _Verdict(analysis: _analysis!),
            ],
          ],
        ),
      ),
    );
  }
}

class _Verdict extends StatelessWidget {
  final LinkAnalysis analysis;
  const _Verdict({required this.analysis});

  @override
  Widget build(BuildContext context) {
    final (color, bg, icon, label) = switch (analysis.result.level) {
      RiskLevel.safe => (AppColors.safe, AppColors.safeBg, Icons.check_circle_outline, 'Looks safe'),
      RiskLevel.caution => (AppColors.caution, AppColors.cautionBg, Icons.warning_amber_rounded, 'Be careful'),
      RiskLevel.highRisk => (AppColors.danger, AppColors.dangerBg, Icons.dangerous_outlined, 'Do not open this'),
    };

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 24),
              const SizedBox(width: 10),
              Expanded(child: Text(label, style: AppTheme.heading(18, color: color))),
            ],
          ),
          const SizedBox(height: 12),
          Text(analysis.url, style: AppTheme.body(12, color: AppColors.navy).copyWith(height: 1.35)),
          const SizedBox(height: 14),
          for (final rule in analysis.rules) _RuleRow(rule: rule),
          if (analysis.rules.isEmpty)
            Text(
              analysis.result.reasons.first,
              style: AppTheme.body(13, color: AppColors.navy, height: 1.4),
            ),
          if (analysis.rules.isEmpty && analysis.result.level == RiskLevel.safe) ...[
            const SizedBox(height: 10),
            Text(
              'A clean address is not a promise that the page is safe — only that nothing about the address itself is suspicious.',
              style: AppTheme.body(11.5, color: AppColors.muted, height: 1.35),
            ),
          ],
        ],
      ),
    );
  }
}

class _RuleRow extends StatelessWidget {
  final LinkRule rule;
  const _RuleRow({required this.rule});

  @override
  Widget build(BuildContext context) {
    final (tone, label) = switch (rule.severity) {
      LinkRuleSeverity.severe => (AppColors.danger, 'Decisive'),
      LinkRuleSeverity.strong => (AppColors.caution, 'Strong'),
      LinkRuleSeverity.mild => (AppColors.muted, 'Minor'),
    };

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            margin: const EdgeInsets.only(top: 2),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: tone.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(label, style: AppTheme.body(10.5, color: tone).copyWith(fontWeight: FontWeight.w600)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(rule.explanation, style: AppTheme.body(12.5, color: AppColors.navy, height: 1.35)),
          ),
        ],
      ),
    );
  }
}
