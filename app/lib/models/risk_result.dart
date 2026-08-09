enum RiskLevel { safe, caution, highRisk }

class RiskResult {
  final RiskLevel level;
  final int score; // 0-100, higher = riskier
  final List<String> reasons;

  const RiskResult({required this.level, required this.score, required this.reasons});

  static RiskResult fromScore(int score, List<String> reasons) {
    final RiskLevel level;
    if (score >= 70) {
      level = RiskLevel.highRisk;
    } else if (score >= 35) {
      level = RiskLevel.caution;
    } else {
      level = RiskLevel.safe;
    }
    return RiskResult(level: level, score: score, reasons: reasons);
  }
}
