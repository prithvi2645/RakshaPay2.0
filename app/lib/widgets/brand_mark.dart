import 'package:flutter/material.dart';

/// The RakshaPay mark, drawn to match `brand/rakshapay-mark.svg` exactly.
///
/// Hand-drawn as a [CustomPainter] rather than pulling in `flutter_svg` for two
/// shapes: it is one dependency fewer in an APK that already ships two ONNX
/// models, and it scales to any size without rasterising.
///
/// The geometry is the same 48x48 grid as the SVG and the web component, with
/// the same round numbers, so a drift between the three is visible by eye
/// rather than needing a pixel diff. If you change one, change all three:
///
///   brand/rakshapay-mark.svg          source of truth
///   web/src/components/BrandMark.tsx  same path data inline
///   this file                         the same two paths
///   tools/build-icons.mjs             regenerates the launcher icons
class BrandMark extends StatelessWidget {
  final double size;
  final Color? color;

  const BrandMark({super.key, this.size = 40, this.color});

  @override
  Widget build(BuildContext context) {
    return SizedBox.square(
      dimension: size,
      child: CustomPaint(
        painter: _BrandMarkPainter(color ?? Theme.of(context).colorScheme.primary),
      ),
    );
  }
}

class _BrandMarkPainter extends CustomPainter {
  final Color color;

  const _BrandMarkPainter(this.color);

  @override
  void paint(Canvas canvas, Size size) {
    // Everything below is authored on the 48x48 grid the SVG uses, then scaled.
    final s = size.width / 48.0;

    final stroke = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.5 * s
      ..strokeJoin = StrokeJoin.round
      ..strokeCap = StrokeCap.round
      ..isAntiAlias = true;

    // M24 4 L42 11 V24 C42 34.5 34.8 43.6 24 46.6 C13.2 43.6 6 34.5 6 24 V11 Z
    final shield = Path()
      ..moveTo(24 * s, 4 * s)
      ..lineTo(42 * s, 11 * s)
      ..lineTo(42 * s, 24 * s)
      ..cubicTo(42 * s, 34.5 * s, 34.8 * s, 43.6 * s, 24 * s, 46.6 * s)
      ..cubicTo(13.2 * s, 43.6 * s, 6 * s, 34.5 * s, 6 * s, 24 * s)
      ..lineTo(6 * s, 11 * s)
      ..close();

    // M15.5 24.5 L21.5 30.5 L33 18.5
    final check = Path()
      ..moveTo(15.5 * s, 24.5 * s)
      ..lineTo(21.5 * s, 30.5 * s)
      ..lineTo(33 * s, 18.5 * s);

    canvas.drawPath(shield, stroke);
    canvas.drawPath(check, stroke);
  }

  @override
  bool shouldRepaint(_BrandMarkPainter oldDelegate) => oldDelegate.color != color;
}
