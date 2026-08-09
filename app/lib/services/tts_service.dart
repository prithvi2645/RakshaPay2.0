import 'package:flutter_tts/flutter_tts.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/risk_result.dart';
import 'alert_phrases.dart';
import 'fraud_signals.dart';

class TtsLanguage {
  final String code;
  final String label;
  const TtsLanguage(this.code, this.label);
}

/// On-device voice alerts in the user's language.
///
/// Two halves have to agree: the text must be translated (AlertPhrases) and
/// the engine must have a voice for that language. If the voice pack is
/// missing, fall back to English text *and* English voice together — an
/// en-IN voice reading Devanagari produces noise, worse than plain English.
class TtsService {
  static const _languageKey = 'alert_language';

  /// Ordered by number of speakers, not alphabetically — the list is long
  /// enough now that the first few entries should be the ones most people
  /// need. Every code here has translated phrases in AlertPhrases; a language
  /// with a voice pack but no translation would read English words aloud with
  /// an Indian accent, which is not localization.
  static const languages = [
    TtsLanguage('en-IN', 'English'),
    TtsLanguage('hi-IN', 'हिंदी (Hindi)'),
    TtsLanguage('bn-IN', 'বাংলা (Bengali)'),
    TtsLanguage('te-IN', 'తెలుగు (Telugu)'),
    TtsLanguage('mr-IN', 'मराठी (Marathi)'),
    TtsLanguage('ta-IN', 'தமிழ் (Tamil)'),
    TtsLanguage('gu-IN', 'ગુજરાતી (Gujarati)'),
    TtsLanguage('kn-IN', 'ಕನ್ನಡ (Kannada)'),
    TtsLanguage('ml-IN', 'മലയാളം (Malayalam)'),
    TtsLanguage('pa-IN', 'ਪੰਜਾਬੀ (Punjabi)'),
    TtsLanguage('or-IN', 'ଓଡ଼ିଆ (Odia)'),
    TtsLanguage('ur-IN', 'اردو (Urdu)'),
  ];

  final FlutterTts _tts = FlutterTts();

  String _requested = 'en-IN';
  String _effective = 'en-IN';
  String get effectiveLanguage => _effective;
  bool get isFallingBack => _requested != _effective;

  Future<String> loadSavedLanguage() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_languageKey) ?? 'en-IN';
    await setLanguage(saved);
    return saved;
  }

  Future<bool> setLanguage(String languageCode) async {
    _requested = languageCode;

    var available = false;
    try {
      available = await _tts.isLanguageAvailable(languageCode) == true;
    } catch (_) {
      available = false;
    }

    _effective = available ? languageCode : 'en-IN';
    await _tts.setLanguage(_effective);
    await _tts.setSpeechRate(0.48); // default is fast for a safety warning
    await _tts.setPitch(1.0);

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_languageKey, languageCode);
    return available;
  }

  Future<Map<String, bool>> availability() async {
    final result = <String, bool>{};
    for (final lang in languages) {
      try {
        result[lang.code] = await _tts.isLanguageAvailable(lang.code) == true;
      } catch (_) {
        result[lang.code] = false;
      }
    }
    return result;
  }

  Future<void> speakResult(RiskResult result, {String? messageText}) async {
    final signals = messageText == null ? <FraudSignal>[] : FraudSignals.detect(messageText);
    await _tts.speak(AlertPhrases.build(level: result.level, languageCode: _effective, signals: signals));
  }

  Future<void> speakSample() => _tts.speak(AlertPhrases.build(level: RiskLevel.highRisk, languageCode: _effective));

  Future<void> stop() => _tts.stop();
}
