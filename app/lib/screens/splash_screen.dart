import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../widgets/brand_mark.dart';

class SplashScreen extends StatelessWidget {
  final String status;
  const SplashScreen({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.navy,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // The brand mark, not Material's stock shield — the same two paths
            // the website and the launcher icon use.
            const BrandMark(size: 68, color: Colors.white),
            const SizedBox(height: 16),
            Text('RakshaPay', style: AppTheme.heading(28, color: Colors.white)),
            const SizedBox(height: 28),
            const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5)),
            const SizedBox(height: 16),
            Text(status, style: AppTheme.body(13.5, color: Colors.white70)),
          ],
        ),
      ),
    );
  }
}
