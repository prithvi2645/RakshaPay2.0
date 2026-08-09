/// Trust signal derived from who sent an SMS.
///
/// Indian commercial SMS must go out through a TRAI/DLT-registered header —
/// `VM-HDFCBK`, `AD-SBIINB`, `JD-PAYTM` and so on: a 2-character operator
/// prefix, a separator, then the registered sender ID. Getting a header
/// requires a registered business entity, so fraudsters overwhelmingly send
/// from ordinary 10-digit mobile numbers instead.
///
/// This is the single most useful non-text signal available: a text model
/// trained on general spam over-flags Indian transactional SMS (bank alerts,
/// OTPs, recharge offers) because that traffic reads like marketing. Knowing
/// the sender is a registered business is what keeps it out of the alert list.
enum SenderTrust {
  registeredBusiness,
  personalNumber,
  unknown,
}

class SenderReputation {
  static final _dltHeader = RegExp(r'^[A-Z]{2}[-_][A-Z0-9]{5,9}$');
  static final _bareHeader = RegExp(r'^[A-Z]{5,9}$');
  static final _mobileNumber = RegExp(r'^(\+?91)?[6-9]\d{9}$');

  static SenderTrust classify(String? sender) {
    if (sender == null || sender.trim().isEmpty) return SenderTrust.unknown;
    final s = sender.trim().toUpperCase().replaceAll(' ', '');

    if (_mobileNumber.hasMatch(s)) return SenderTrust.personalNumber;
    if (_dltHeader.hasMatch(s) || _bareHeader.hasMatch(s)) return SenderTrust.registeredBusiness;
    return SenderTrust.unknown;
  }

  /// Multiplier applied to the model's scam probability. A registered sender
  /// is heavily discounted — the header is very hard to forge. A personal
  /// number gets a mild boost, since most real UPI fraud arrives that way.
  static double riskMultiplier(SenderTrust trust) => switch (trust) {
        SenderTrust.registeredBusiness => 0.25,
        SenderTrust.personalNumber => 1.15,
        SenderTrust.unknown => 1.0,
      };

  static String describe(SenderTrust trust) => switch (trust) {
        SenderTrust.registeredBusiness => 'Sent from a registered business SMS header',
        SenderTrust.personalNumber => 'Sent from a personal mobile number, not a registered business',
        SenderTrust.unknown => 'Sender could not be verified',
      };
}
