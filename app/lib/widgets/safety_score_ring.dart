import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class SafetyScoreRing extends StatelessWidget {
  final int score; // 0-100, safety score (100 - risk)
  const SafetyScoreRing({super.key, required this.score});

  Color get _color {
    if (score >= 70) return AppColors.safe;
    if (score >= 35) return AppColors.caution;
    return AppColors.danger;
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 72,
      height: 72,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox(
            width: 72,
            height: 72,
            child: CircularProgressIndicator(
              value: score / 100,
              strokeWidth: 6,
              backgroundColor: Colors.white.withValues(alpha: 0.25),
              valueColor: AlwaysStoppedAnimation(_color),
            ),
          ),
          const Icon(Icons.shield_outlined, color: Colors.white, size: 28),
        ],
      ),
    );
  }
}
