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
  /// Twelve languages, chosen by number of speakers rather than by what was
  /// convenient to translate. Between them they cover the large majority of
  /// India, and the people most exposed to UPI fraud are precisely those least
  /// likely to act on an English warning.
  ///
  /// A caveat worth stating rather than hiding: these translations have not yet
  /// been reviewed by native speakers for every language. The sentences are
  /// deliberately short and literal to keep them hard to get wrong, and the
  /// fallback in TtsService means a missing voice pack degrades to English
  /// text *and* English voice together rather than producing noise.
  static const supportedLanguages = [
    'en-IN', 'hi-IN', 'bn-IN', 'te-IN', 'mr-IN', 'ta-IN',
    'gu-IN', 'kn-IN', 'ml-IN', 'pa-IN', 'or-IN', 'ur-IN',
  ];

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
    'bn-IN': {
      RiskLevel.safe: 'এই পেমেন্ট নিরাপদ মনে হচ্ছে।',
      RiskLevel.caution: 'সাবধান! টাকা দেওয়ার আগে ভালো করে দেখে নিন।',
      RiskLevel.highRisk: 'সতর্কতা! প্রতারণার বড় ঝুঁকি রয়েছে। টাকা দেবেন না।',
    },
    'te-IN': {
      RiskLevel.safe: 'ఈ చెల్లింపు సురక్షితంగా ఉంది.',
      RiskLevel.caution: 'జాగ్రత్త! డబ్బు చెల్లించే ముందు జాగ్రత్తగా చూడండి.',
      RiskLevel.highRisk: 'హెచ్చరిక! మోసం జరిగే ప్రమాదం ఎక్కువ. దయచేసి డబ్బు చెల్లించవద్దు.',
    },
    'ta-IN': {
      RiskLevel.safe: 'இந்தப் பணப்பரிமாற்றம் பாதுகாப்பாகத் தெரிகிறது.',
      RiskLevel.caution: 'எச்சரிக்கை! பணம் அனுப்பும் முன் கவனமாகச் சரிபார்க்கவும்.',
      RiskLevel.highRisk: 'எச்சரிக்கை! மோசடி ஏற்படும் அபாயம் அதிகம். பணம் அனுப்ப வேண்டாம்.',
    },
    'gu-IN': {
      RiskLevel.safe: 'આ ચુકવણી સુરક્ષિત લાગે છે.',
      RiskLevel.caution: 'સાવધાન! પૈસા ચૂકવતા પહેલાં ધ્યાનથી તપાસો.',
      RiskLevel.highRisk: 'ચેતવણી! છેતરપિંડીનું મોટું જોખમ છે. કૃપા કરીને પૈસા ન ચૂકવો.',
    },
    'ml-IN': {
      RiskLevel.safe: 'ഈ പണമിടപാട് സുരക്ഷിതമാണെന്ന് തോന്നുന്നു.',
      RiskLevel.caution: 'ശ്രദ്ധിക്കുക! പണം നൽകുന്നതിന് മുമ്പ് നന്നായി പരിശോധിക്കുക.',
      RiskLevel.highRisk: 'മുന്നറിയിപ്പ്! വഞ്ചനയ്ക്ക് വലിയ സാധ്യതയുണ്ട്. പണം നൽകരുത്.',
    },
    'pa-IN': {
      RiskLevel.safe: 'ਇਹ ਭੁਗਤਾਨ ਸੁਰੱਖਿਅਤ ਲੱਗਦਾ ਹੈ।',
      RiskLevel.caution: 'ਸਾਵਧਾਨ! ਪੈਸੇ ਦੇਣ ਤੋਂ ਪਹਿਲਾਂ ਧਿਆਨ ਨਾਲ ਜਾਂਚ ਕਰੋ।',
      RiskLevel.highRisk: 'ਚੇਤਾਵਨੀ! ਧੋਖਾਧੜੀ ਦਾ ਵੱਡਾ ਖ਼ਤਰਾ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਪੈਸੇ ਨਾ ਦਿਓ।',
    },
    'or-IN': {
      RiskLevel.safe: 'ଏହି ଦେୟ ସୁରକ୍ଷିତ ଲାଗୁଛି।',
      RiskLevel.caution: 'ସାବଧାନ! ଟଙ୍କା ଦେବା ପୂର୍ବରୁ ଭଲ ଭାବରେ ଯାଞ୍ଚ କରନ୍ତୁ।',
      RiskLevel.highRisk: 'ଚେତାବନୀ! ଠକେଇର ବଡ଼ ଆଶଙ୍କା ଅଛି। ଦୟାକରି ଟଙ୍କା ଦିଅନ୍ତୁ ନାହିଁ।',
    },
    'ur-IN': {
      RiskLevel.safe: 'یہ ادائیگی محفوظ لگتی ہے۔',
      RiskLevel.caution: 'ہوشیار! پیسے دینے سے پہلے احتیاط سے جانچ لیں۔',
      RiskLevel.highRisk: 'انتباہ! دھوکہ دہی کا بڑا خطرہ ہے۔ براہ کرم پیسے نہ دیں۔',
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
    'bn-IN': {
      FraudSignalKind.credentialRequest: 'এটি আপনার পিন বা ও.টি.পি. চাইছে। এগুলি কাউকে বলবেন না।',
      FraudSignalKind.threat: 'এটি আপনার অ্যাকাউন্ট বন্ধ করার ভয় দেখাচ্ছে।',
      FraudSignalKind.remoteAccess: 'এটি এমন অ্যাপ বসাতে বলছে যাতে আপনার ফোনের নিয়ন্ত্রণ চলে যাবে।',
      FraudSignalKind.paymentTrap: 'টাকা পাওয়ার জন্য আগে টাকা দিতে বলছে। এটি প্রতারণা।',
    },
    'te-IN': {
      FraudSignalKind.credentialRequest: 'ఇది మీ పిన్ లేదా ఓ.టి.పి. అడుగుతోంది. వీటిని ఎవరికీ చెప్పవద్దు.',
      FraudSignalKind.threat: 'ఇది మీ ఖాతా మూసివేస్తామని భయపెడుతోంది.',
      FraudSignalKind.remoteAccess: 'మీ ఫోన్ నియంత్రణ పోయే యాప్ ఇన్‌స్టాల్ చేయమని అడుగుతోంది.',
      FraudSignalKind.paymentTrap: 'డబ్బు రావాలంటే ముందు డబ్బు కట్టమని అడుగుతోంది. ఇది మోసం.',
    },
    'ta-IN': {
      FraudSignalKind.credentialRequest: 'இது உங்கள் பின் அல்லது ஓ.டி.பி. கேட்கிறது. இதை யாரிடமும் சொல்ல வேண்டாம்.',
      FraudSignalKind.threat: 'இது உங்கள் கணக்கை முடக்குவதாக பயமுறுத்துகிறது.',
      FraudSignalKind.remoteAccess: 'உங்கள் தொலைபேசியின் கட்டுப்பாட்டை இழக்கும் செயலியை நிறுவச் சொல்கிறது.',
      FraudSignalKind.paymentTrap: 'பணம் பெற முதலில் பணம் கட்டச் சொல்கிறது. இது மோசடி.',
    },
    'gu-IN': {
      FraudSignalKind.credentialRequest: 'આ તમારો પિન કે ઓ.ટી.પી. માંગે છે. આ કોઈને ન કહો.',
      FraudSignalKind.threat: 'આ તમારું ખાતું બંધ કરવાની બીક બતાવે છે.',
      FraudSignalKind.remoteAccess: 'આ એવી એપ નાખવાનું કહે છે જેનાથી ફોનનો કાબૂ જતો રહે.',
      FraudSignalKind.paymentTrap: 'પૈસા મેળવવા પહેલાં પૈસા ભરવાનું કહે છે. આ છેતરપિંડી છે.',
    },
    'ml-IN': {
      FraudSignalKind.credentialRequest: 'ഇത് നിങ്ങളുടെ പിൻ അല്ലെങ്കിൽ ഒ.ടി.പി. ചോദിക്കുന്നു. ഇത് ആരോടും പറയരുത്.',
      FraudSignalKind.threat: 'ഇത് നിങ്ങളുടെ അക്കൗണ്ട് പൂട്ടുമെന്ന് ഭയപ്പെടുത്തുന്നു.',
      FraudSignalKind.remoteAccess: 'ഫോണിന്റെ നിയന്ത്രണം നഷ്ടപ്പെടുത്തുന്ന ആപ്പ് ഇൻസ്റ്റാൾ ചെയ്യാൻ പറയുന്നു.',
      FraudSignalKind.paymentTrap: 'പണം കിട്ടാൻ ആദ്യം പണം അടയ്ക്കാൻ പറയുന്നു. ഇത് വഞ്ചനയാണ്.',
    },
    'pa-IN': {
      FraudSignalKind.credentialRequest: 'ਇਹ ਤੁਹਾਡਾ ਪਿੰਨ ਜਾਂ ਓ.ਟੀ.ਪੀ. ਮੰਗ ਰਿਹਾ ਹੈ। ਇਹ ਕਿਸੇ ਨੂੰ ਨਾ ਦੱਸੋ।',
      FraudSignalKind.threat: 'ਇਹ ਤੁਹਾਡਾ ਖਾਤਾ ਬੰਦ ਕਰਨ ਦਾ ਡਰ ਦਿਖਾ ਰਿਹਾ ਹੈ।',
      FraudSignalKind.remoteAccess: 'ਇਹ ਅਜਿਹੀ ਐਪ ਪਵਾਉਣੀ ਚਾਹੁੰਦਾ ਹੈ ਜਿਸ ਨਾਲ ਫ਼ੋਨ ਦਾ ਕਾਬੂ ਚਲਾ ਜਾਵੇ।',
      FraudSignalKind.paymentTrap: 'ਪੈਸੇ ਲੈਣ ਲਈ ਪਹਿਲਾਂ ਪੈਸੇ ਭਰਨ ਨੂੰ ਕਹਿ ਰਿਹਾ ਹੈ। ਇਹ ਧੋਖਾ ਹੈ।',
    },
    'or-IN': {
      FraudSignalKind.credentialRequest: 'ଏହା ଆପଣଙ୍କ ପିନ୍ କିମ୍ବା ଓ.ଟି.ପି. ମାଗୁଛି। ଏହା କାହାକୁ କୁହନ୍ତୁ ନାହିଁ।',
      FraudSignalKind.threat: 'ଏହା ଆପଣଙ୍କ ଖାତା ବନ୍ଦ କରିବାର ଭୟ ଦେଖାଉଛି।',
      FraudSignalKind.remoteAccess: 'ଏହା ଏମିତି ଆପ୍ ଲଗାଇବାକୁ କହୁଛି ଯାହା ଫୋନର ନିୟନ୍ତ୍ରଣ ନେଇଯିବ।',
      FraudSignalKind.paymentTrap: 'ଟଙ୍କା ପାଇବା ପାଇଁ ଆଗେ ଟଙ୍କା ଦେବାକୁ କହୁଛି। ଏହା ଠକେଇ।',
    },
    'ur-IN': {
      FraudSignalKind.credentialRequest: 'یہ آپ کا پن یا او.ٹی.پی. مانگ رہا ہے۔ یہ کسی کو نہ بتائیں۔',
      FraudSignalKind.threat: 'یہ آپ کا کھاتہ بند کرنے کا ڈر دکھا رہا ہے۔',
      FraudSignalKind.remoteAccess: 'یہ ایسی ایپ لگوانا چاہتا ہے جس سے فون کا کنٹرول چلا جائے۔',
      FraudSignalKind.paymentTrap: 'پیسے پانے کے لیے پہلے پیسے بھرنے کو کہہ رہا ہے۔ یہ دھوکہ ہے۔',
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
