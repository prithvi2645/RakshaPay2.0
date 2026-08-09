import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../models/scan_record.dart';
import '../services/risk_engine.dart';
import '../services/scan_history_service.dart';
import '../theme/app_theme.dart';
import 'risk_result_screen.dart';

class ScanScreen extends StatefulWidget {
  final RiskEngine engine;
  final ScanHistoryService history;
  const ScanScreen({super.key, required this.engine, required this.history});

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  final _controller = MobileScannerController();
  final _imagePicker = ImagePicker();

  bool _handled = false;
  bool _picking = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _notify(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message), duration: const Duration(seconds: 6)));
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_handled || _picking || capture.barcodes.isEmpty) return;
    final code = capture.barcodes.first.rawValue;
    if (code == null || code.isEmpty) return;

    setState(() => _handled = true);
    await _controller.stop();
    try {
      await _score(code, source: 'qr');
    } finally {
      if (mounted) {
        setState(() => _handled = false);
        await _controller.start();
      }
    }
  }

  /// Scores a QR saved on the device — a screenshot, a shared image, or a
  /// photo of a printed code. Scam QRs usually arrive as an image over a
  /// messaging app long before the user ever stands in front of one.
  Future<void> _pickFromGallery() async {
    if (_handled || _picking) return;
    setState(() => _picking = true);
    await _controller.stop();

    try {
      final file = await _imagePicker.pickImage(source: ImageSource.gallery);
      if (file == null) return;

      setState(() => _handled = true);
      final capture = await _controller.analyzeImage(file.path);
      final barcodes = capture?.barcodes ?? const <Barcode>[];
      final code = barcodes.isEmpty ? null : barcodes.first.rawValue;

      if (code == null || code.isEmpty) {
        _notify('No QR code found in that image.');
        return;
      }
      await _score(code, source: 'qr_image');
    } on MobileScannerBarcodeException catch (e) {
      _notify('Could not read a QR from that image: ${e.message}');
    } catch (e) {
      _notify('Could not open that image: $e');
    } finally {
      if (mounted) {
        setState(() {
          _picking = false;
          _handled = false;
        });
        await _controller.start();
      }
    }
  }

  Future<void> _score(String code, {required String source}) async {
    try {
      final features = widget.engine.qrAnalyzer.extractFeatures(code);
      final result = widget.engine.analyzeQr(code);
      final uri = Uri.tryParse(code);
      final merchantName = uri?.queryParameters['pn'];

      await widget.history.add(ScanRecord(
        merchantName: merchantName,
        vpa: features.vpa,
        amount: features.hasAmount ? features.amount : null,
        level: result.level,
        score: result.score,
        scannedAt: DateTime.now(),
        source: source,
        reasons: result.reasons,
      ));
      widget.engine.scamDatabase.logRiskEvent(result: result, source: source);

      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => RiskResultScreen(
          engine: widget.engine,
          result: result,
          vpa: features.vpa.isEmpty ? null : features.vpa,
          merchantName: merchantName,
          amount: features.hasAmount ? features.amount : null,
          rawPayload: code,
        ),
      ));
    } catch (e) {
      _notify('Could not score this QR: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.navy,
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(controller: _controller, onDetect: _onDetect),
          Center(
            child: Container(
              width: 250, height: 250,
              decoration: BoxDecoration(border: Border.all(color: Colors.white.withValues(alpha: 0.9), width: 3), borderRadius: BorderRadius.circular(28)),
            ),
          ),
          SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      Material(
                        color: Colors.black.withValues(alpha: 0.4),
                        shape: const CircleBorder(),
                        child: InkWell(
                          customBorder: const CircleBorder(),
                          onTap: () => Navigator.of(context).pop(),
                          child: const SizedBox(width: 42, height: 42, child: Icon(Icons.arrow_back, color: Colors.white, size: 21)),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Text('Scan UPI QR', style: AppTheme.heading(20, color: Colors.white)),
                    ],
                  ),
                ),
                const Spacer(),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _handled || _picking ? null : _pickFromGallery,
                      icon: const Icon(Icons.image_outlined, size: 20),
                      label: const Text('Check a QR image from my phone'),
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: AppColors.navy,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      ),
                    ),
                  ),
                ),
                Container(
                  margin: const EdgeInsets.fromLTRB(20, 12, 20, 20),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.55), borderRadius: BorderRadius.circular(18)),
                  child: Row(
                    children: [
                      const Icon(Icons.shield_outlined, color: Colors.white, size: 22),
                      const SizedBox(width: 12),
                      Expanded(child: Text('Point at a UPI QR code, or check a screenshot someone sent you.', style: AppTheme.body(13.5, color: Colors.white, height: 1.4))),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (_handled)
            ColoredBox(
              color: Colors.black.withValues(alpha: 0.65),
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const CircularProgressIndicator(color: Colors.white),
                    const SizedBox(height: 16),
                    Text('Checking this QR...', style: AppTheme.body(15, color: Colors.white)),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
