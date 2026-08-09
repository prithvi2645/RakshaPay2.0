/// Concrete fraud "asks" — the things a scam needs you to actually *do*.
///
/// The text model alone conflates marketing with fraud, because promotional
/// language and scam language overlap heavily. A recharge offer and a fake
/// refund read similarly; what separates them is that the scam asks you to
/// hand over a PIN, act on a threat, or install remote-access software.
///
/// RakshaPay is a fraud shield, not a spam filter. A message with no ask is
/// at most noise, and noise must not raise an alert — every false alarm makes
/// the next real warning easier to ignore.
class FraudSignals {
  // Patterns, not literal substrings. Scam wording varies constantly —
  // "share your OTP", "share the OTP", "send me OTP" are the same ask, and a
  // literal list misses all but the exact phrasing it was written for.
  static final _credentialAsks = [
    RegExp(r'\b(share|send|tell|give|provide|forward)\b.{0,25}\b(otp|pin|cvv|password|code)\b'),
    RegExp(r'\b(otp|pin|cvv|password)\b.{0,25}\b(share|send|tell|give|provide|forward)\b'),
    RegExp(r'\bupi\s*pin\b'),
    RegExp(r'\benter\b.{0,20}\b(pin|otp|cvv|password)\b'),
    RegExp(r'\b(atm|debit|credit)\s*card\s*(number|pin|details)\b'),
    RegExp(r'\bnet\s*banking\s*password\b'),
  ];

  static final _threats = [
    RegExp(r'\b(account|card|sim|kyc|service)\b.{0,30}\b(block|suspend|deactivat|clos|expir|terminat)'),
    RegExp(r'\b(block|suspend|deactivat|clos|expir)\w*\b.{0,30}\b(account|card|sim|kyc|service)\b'),
    RegExp(r'\b(update|complete|verify|renew)\b.{0,20}\bkyc\b'),
    RegExp(r'\bkyc\b.{0,25}\b(pending|expire|update|required|incomplete)'),
    RegExp(r'\b(enforcement directorate|cbi|police case|arrest|digital arrest)\b'),
  ];

  static final _remoteAccess = [
    RegExp(r'\b(anydesk|teamviewer|quicksupport|quick\s*support|airdroid|vysor)\b'),
    RegExp(r'\b(share|mirror|show)\b.{0,15}\bscreen\b'),
    RegExp(r'\bscreen\s*(share|sharing|mirror)\b'),
  ];

  static final _paymentTraps = [
    RegExp(r'\baccept\b.{0,30}\b(collect|payment)?\s*request\b'),
    RegExp(r'\bscan\b.{0,25}\b(receive|get|claim|collect)\b'),
    RegExp(r'\b(pay|send|transfer)\b.{0,30}\b(to\s+)?(receive|claim|unlock|release)\b'),
    RegExp(r'\bprocessing\s*fee\b'),
    RegExp(r'\bsent\b.{0,25}\bby\s*mistake\b'),
    RegExp(r'\brefund\b.{0,30}\b(pay|fee|charge)\b'),
    RegExp(r'\bcustoms\s*duty\b'),
  ];

  static List<FraudSignal> detect(String text) {
    final lower = text.toLowerCase();
    final found = <FraudSignal>[];

    void scan(List<RegExp> patterns, FraudSignalKind kind, String explanation) {
      for (final pattern in patterns) {
        final match = pattern.firstMatch(lower);
        if (match != null) {
          found.add(FraudSignal(kind: kind, phrase: match.group(0) ?? '', explanation: explanation));
          return;
        }
      }
    }

    scan(_credentialAsks, FraudSignalKind.credentialRequest,
        'Asks for a PIN, OTP or card detail — no genuine service ever does');
    scan(_threats, FraudSignalKind.threat,
        'Threatens to block your account or invokes legal authority to rush you');
    scan(_remoteAccess, FraudSignalKind.remoteAccess,
        'Wants you to install remote-access software that hands over your phone');
    scan(_paymentTraps, FraudSignalKind.paymentTrap,
        'Asks you to pay or approve a request in order to *receive* money');

    return found;
  }

  static bool hasActionableAsk(String text) => detect(text).isNotEmpty;
}

enum FraudSignalKind { credentialRequest, threat, remoteAccess, paymentTrap }

class FraudSignal {
  final FraudSignalKind kind;
  final String phrase;
  final String explanation;

  const FraudSignal({required this.kind, required this.phrase, required this.explanation});
}
