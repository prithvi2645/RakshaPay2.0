import '../models/risk_result.dart';
import 'fraud_signals.dart';

/// Spoken alert text, translated.
///
/// Setting the TTS locale alone is not localization — the engine would read
/// English words with an Indian voice. These are the actual sentences, so a
/// user who does not read English still gets the warning that matters.
///
/// Detailed on-screen reasons stay in English for now; the spoken alert
/// carries the actionable part.
class AlertPhrases {
  static const supportedLanguages = ['en-IN', 'hi-IN', 'kn-IN', 'mr-IN'];

  static const _level = <String, Map<RiskLevel, String>>{
    'en-IN': {
      RiskLevel.safe: 'This payment looks safe.',
      RiskLevel.caution: 'Caution. Please check carefully before you pay.',
      RiskLevel.highRisk: 'Warning! High risk of fraud. We recommend you do not pay.',
    },
    'hi-IN': {
      RiskLevel.safe: 'यह भुगतान सुरक्षित लगता है।',
      RiskLevel.caution: 'सावधान! भुगतान करने से पहले ध्यान से जाँच करें।',
      RiskLevel.highRisk: 'चेतावनी! धोखाधड़ी का बहुत बड़ा खतरा है। भुगतान न करें।',
    },
    'kn-IN': {
      RiskLevel.safe: 'ಈ ಪಾವತಿ ಸುರಕ್ಷಿತವಾಗಿದೆ.',
      RiskLevel.caution: 'ಎಚ್ಚರಿಕೆ! ಪಾವತಿಸುವ ಮೊದಲು ಜಾಗ್ರತೆಯಿಂದ ಪರಿಶೀಲಿಸಿ.',
      RiskLevel.highRisk: 'ಎಚ್ಚರಿಕೆ! ಮೋಸದ ಅಪಾಯ ಹೆಚ್ಚಿದೆ. ದಯವಿಟ್ಟು ಹಣ ಪಾವತಿಸಬೇಡಿ.',
    },
    'mr-IN': {
      RiskLevel.safe: 'हे पेमेंट सुरक्षित वाटते.',
      RiskLevel.caution: 'सावधान! पैसे देण्यापूर्वी नीट तपासा.',
      RiskLevel.highRisk: 'इशारा! फसवणुकीचा मोठा धोका आहे. कृपया पैसे देऊ नका.',
    },
  };

  static const _signal = <String, Map<FraudSignalKind, String>>{
    'en-IN': {
      FraudSignalKind.credentialRequest: 'It is asking for your PIN or OTP. Never share these with anyone.',
      FraudSignalKind.threat: 'It is threatening to block your account to make you panic.',
      FraudSignalKind.remoteAccess: 'It wants you to install an app that gives away control of your phone.',
      FraudSignalKind.paymentTrap: 'It is asking you to pay in order to receive money. That is a scam.',
    },
    'hi-IN': {
      FraudSignalKind.credentialRequest: 'यह आपका पिन या ओ॰टी॰पी॰ माँग रहा है। इन्हें कभी किसी को न बताएँ।',
      FraudSignalKind.threat: 'यह आपका खाता बंद करने की धमकी देकर आपको डरा रहा है।',
      FraudSignalKind.remoteAccess: 'यह ऐसा ऐप डलवाना चाहता है जिससे आपके फ़ोन का नियंत्रण चला जाएगा।',
      FraudSignalKind.paymentTrap: 'यह पैसे पाने के लिए पहले पैसे भरने को कह रहा है। यह धोखा है।',
    },
    'kn-IN': {
      FraudSignalKind.credentialRequest: 'ಇದು ನಿಮ್ಮ ಪಿನ್ ಅಥವಾ ಒ.ಟಿ.ಪಿ. ಕೇಳುತ್ತಿದೆ. ಇವನ್ನು ಯಾರಿಗೂ ಹೇಳಬೇಡಿ.',
      FraudSignalKind.threat: 'ಇದು ನಿಮ್ಮ ಖಾತೆ ಬಂದ್ ಮಾಡುವ ಬೆದರಿಕೆ ಹಾಕಿ ಭಯ ಹುಟ್ಟಿಸುತ್ತಿದೆ.',
      FraudSignalKind.remoteAccess: 'ಇದು ನಿಮ್ಮ ಫೋನಿನ ನಿಯಂತ್ರಣ ಕಸಿಯುವ ಆ್ಯಪ್ ಹಾಕಿಸಲು ಬಯಸುತ್ತಿದೆ.',
      FraudSignalKind.paymentTrap: 'ಹಣ ಪಡೆಯಲು ಮೊದಲು ಹಣ ಕಟ್ಟಲು ಹೇಳುತ್ತಿದೆ. ಇದು ಮೋಸ.',
    },
    'mr-IN': {
      FraudSignalKind.credentialRequest: 'हे तुमचा पिन किंवा ओ.टी.पी. मागत आहे. हे कोणालाही सांगू नका.',
      FraudSignalKind.threat: 'हे तुमचे खाते बंद करण्याची भीती दाखवत आहे.',
      FraudSignalKind.remoteAccess: 'हे असे अ‍ॅप घालायला सांगत आहे ज्याने तुमच्या फोनवरचा ताबा जातो.',
      FraudSignalKind.paymentTrap: 'पैसे मिळवण्यासाठी आधी पैसे भरायला सांगत आहे. ही फसवणूक आहे.',
    },
  };

  static String _resolve(String languageCode) => supportedLanguages.contains(languageCode) ? languageCode : 'en-IN';

  static String forLevel(RiskLevel level, String languageCode) => _level[_resolve(languageCode)]![level]!;

  static String? forSignal(FraudSignalKind kind, String languageCode) => _signal[_resolve(languageCode)]?[kind];

  static String build({
    required RiskLevel level,
    required String languageCode,
    List<FraudSignal> signals = const [],
  }) {
    final parts = [forLevel(level, languageCode)];
    for (final signal in signals) {
      final phrase = forSignal(signal.kind, languageCode);
      if (phrase != null) parts.add(phrase);
    }
    return parts.join(' ');
  }
}
