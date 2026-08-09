import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class OnboardingScreen extends StatefulWidget {
  final VoidCallback onDone;
  const OnboardingScreen({super.key, required this.onDone});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _Page {
  final IconData icon;
  final String title;
  final String body;
  const _Page(this.icon, this.title, this.body);
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _controller = PageController();
  int _page = 0;

  static const _pages = [
    _Page(Icons.qr_code_scanner, 'Check before you pay',
        'Scan any UPI QR code and RakshaPay tells you if it looks safe — before you enter your PIN.'),
    _Page(Icons.chat_bubble_outline, 'Catches scam messages too',
        'RakshaPay reads incoming SMS on-device and warns you about KYC scams, fake refunds, and OTP fraud.'),
    _Page(Icons.groups_outlined, 'Powered by the community',
        'When enough users report a scam UPI ID, it is shared with everyone — automatically, instantly.'),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: TextButton(onPressed: widget.onDone, child: const Text('Skip')),
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: _pages.length,
                onPageChanged: (i) => setState(() => _page = i),
                itemBuilder: (context, i) {
                  final p = _pages[i];
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 32),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 140, height: 140,
                          decoration: BoxDecoration(color: AppColors.navy.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(32)),
                          child: Icon(p.icon, size: 60, color: AppColors.navy),
                        ),
                        const SizedBox(height: 34),
                        Text(p.title, style: AppTheme.heading(24), textAlign: TextAlign.center),
                        const SizedBox(height: 14),
                        Text(p.body, style: AppTheme.body(14.5, color: AppColors.muted, height: 1.5), textAlign: TextAlign.center),
                      ],
                    ),
                  );
                },
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(_pages.length, (i) => AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                margin: const EdgeInsets.symmetric(horizontal: 4),
                width: i == _page ? 22 : 8, height: 8,
                decoration: BoxDecoration(color: i == _page ? AppColors.navy : AppColors.navy.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(4)),
              )),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () {
                    if (_page == _pages.length - 1) {
                      widget.onDone();
                    } else {
                      _controller.nextPage(duration: const Duration(milliseconds: 250), curve: Curves.ease);
                    }
                  },
                  child: Text(_page == _pages.length - 1 ? 'Get Started' : 'Next'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
