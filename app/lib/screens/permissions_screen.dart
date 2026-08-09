import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Purely informational — the actual permission prompts happen at the point
/// of use (camera when Scan opens, SMS when "Watch SMS" is toggled in
/// Settings), which is both simpler than a separate permissions package and
/// better UX: a system dialog makes more sense right when its reason for
/// existing is on screen.
class PermissionsScreen extends StatelessWidget {
  final VoidCallback onDone;
  const PermissionsScreen({super.key, required this.onDone});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            children: [
              const Spacer(),
              const Icon(Icons.verified_user_outlined, size: 64, color: AppColors.navy),
              const SizedBox(height: 24),
              Text('Two quick permissions', style: AppTheme.heading(22), textAlign: TextAlign.center),
              const SizedBox(height: 12),
              Text(
                'Camera to scan QR codes, and SMS to watch for scam messages. '
                'Everything is analyzed on your phone — nothing is ever uploaded.',
                style: AppTheme.body(14, color: AppColors.muted, height: 1.5),
                textAlign: TextAlign.center,
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                child: FilledButton(onPressed: onDone, child: const Text('Continue')),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
