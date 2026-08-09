import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppColors {
  static const navy = Color(0xFF16224A);
  static const background = Color(0xFFF3F5FB);
  static const safe = Color(0xFF1F9D55);
  static const safeBg = Color(0xFFE3F6EA);
  static const caution = Color(0xFFB5721E);
  static const cautionBg = Color(0xFFFBEFDD);
  static const danger = Color(0xFFD03C3C);
  static const dangerBg = Color(0xFFFBE3E3);
  static const dangerBorder = Color(0xFFF0B4B4);
  static const muted = Color(0xFF6B7280);
}

const kCardShadow = [
  BoxShadow(color: Color(0x14000000), blurRadius: 18, offset: Offset(0, 6)),
];

class AppTheme {
  static TextStyle heading(double size, {Color? color}) =>
      GoogleFonts.poppins(fontSize: size, fontWeight: FontWeight.w700, color: color ?? AppColors.navy);

  static TextStyle body(double size, {Color? color, double? height}) =>
      GoogleFonts.inter(fontSize: size, color: color ?? AppColors.navy, height: height);

  static ThemeData get theme => ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: AppColors.background,
        colorScheme: ColorScheme.fromSeed(seedColor: AppColors.navy),
        textTheme: GoogleFonts.interTextTheme(),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.navy,
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
        ),
      );
}
