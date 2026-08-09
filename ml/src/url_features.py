"""Feature extraction for the link-risk model.

TWO LAYERS, AND THE SPLIT IS THE WHOLE DESIGN.

The trained model reads the **host only**. That is not a simplification, it is a
guard against the leakage trap this dataset invites: the malicious feeds
(URLhaus, OpenPhish) give full URLs with long paths, while the benign reference
(Tranco) gives bare domains. Train on those directly and the model learns
"has a path => malicious", scores ~99%, and collapses the moment it sees a real
benign URL with a path. The number would be a lie.

Restricting the model to host features makes both classes structurally
comparable, because a host is a host in either feed.

What the host cannot see — `.apk` downloads, `@` in the authority, embedded
brand names in the path — is handled by DETERMINISTIC RULES in url_rules
(mirrored in Dart and TypeScript). Those need no training data and each one is
individually defensible to anyone who asks why it fires.

FEATURES below is the contract. Its ORDER is part of the model artifact: the
Dart and TypeScript ports index into it positionally, so a reordering here
silently feeds entropy into the digit-ratio slot. Both clients pin the order in
a test.
"""
import math
import re

FEATURES = [
    "host_len",
    "num_labels",
    "num_hyphens",
    "digit_ratio",
    "max_label_len",
    "domain_entropy",
    "is_ip_literal",
    "has_punycode",
    "is_common_tld",
    "tld_len",
    "brand_token_present",
    "has_suspicious_word",
]

# Public suffixes that are two labels deep, so "example.co.in" reduces to
# "example" rather than "co". Not the full Mozilla PSL — the handful that
# actually matter for Indian and common international traffic, kept short
# because it must be reimplemented identically in Dart and TypeScript.
TWO_LEVEL_SUFFIXES = {
    "co.in", "net.in", "org.in", "gen.in", "firm.in", "ind.in", "gov.in", "ac.in",
    "edu.in", "res.in", "nic.in", "co.uk", "org.uk", "gov.uk", "ac.uk", "com.au",
    "net.au", "org.au", "co.jp", "co.kr", "com.br", "com.sg", "com.my", "co.za",
    "com.cn", "com.hk", "co.id", "com.pk", "com.bd", "com.np",
}

COMMON_TLDS = {
    "com", "org", "net", "in", "io", "gov", "edu", "co", "uk", "de", "fr", "jp",
    "au", "ca", "nl", "se", "es", "it", "br", "ru", "info", "biz", "app", "dev",
}

# Indian bank / UPI brand tokens. A host that contains one of these without
# being that brand's real domain is the classic phishing shape:
# "sbi.secure-verify.xyz".
BRAND_TOKENS = [
    "sbi", "hdfc", "icici", "axis", "kotak", "pnb", "bob", "canara", "unionbank",
    "paytm", "phonepe", "gpay", "googlepay", "bhim", "upi", "npci", "rbi",
    "amazonpay", "mobikwik", "freecharge", "yesbank", "idfc", "indusind",
]

SUSPICIOUS_WORDS = [
    "login", "signin", "secure", "verify", "verification", "update", "account",
    "kyc", "refund", "reward", "cashback", "wallet", "recover", "unlock",
    "confirm", "support", "helpdesk",
]

_IPV4 = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")
_DIGIT = re.compile(r"\d")


def shannon_entropy(text: str) -> float:
    if not text:
        return 0.0
    counts = {}
    for ch in text:
        counts[ch] = counts.get(ch, 0) + 1
    entropy = 0.0
    for count in counts.values():
        p = count / len(text)
        entropy -= p * math.log(p, 2)
    return entropy


def host_of(url: str) -> str:
    """Host portion of a URL, lowercased, without scheme, userinfo, or port.

    Hand-rolled rather than urlparse because the Dart and TypeScript ports must
    agree with it character for character, and each language's URL parser
    disagrees with the others on malformed input — which is most of what a
    phishing feed contains.
    """
    value = url.strip()

    scheme = value.find("://")
    if scheme != -1:
        value = value[scheme + 3:]

    for terminator in ("/", "?", "#"):
        cut = value.find(terminator)
        if cut != -1:
            value = value[:cut]

    # userinfo@host — the host is what comes after the LAST '@', which is
    # exactly the trick "https://sbi.co.in@evil.tld" relies on.
    at = value.rfind("@")
    if at != -1:
        value = value[at + 1:]

    if value.startswith("["):  # IPv6 literal
        end = value.find("]")
        if end != -1:
            return value[: end + 1].lower()

    colon = value.rfind(":")
    if colon != -1 and value[colon + 1:].isdigit():
        value = value[:colon]

    return value.lower().strip(".")


def registrable_parts(host: str) -> tuple[str, str]:
    """(domain label, tld) — "shop.example.co.in" -> ("example", "co.in")."""
    labels = [label for label in host.split(".") if label]
    if len(labels) < 2:
        return (labels[0] if labels else "", "")

    last_two = ".".join(labels[-2:])
    if len(labels) >= 3 and last_two in TWO_LEVEL_SUFFIXES:
        return (labels[-3], last_two)
    return (labels[-2], labels[-1])


def extract(url: str) -> dict:
    """Host-only features, in FEATURES order."""
    host = host_of(url)
    labels = [label for label in host.split(".") if label]
    domain, tld = registrable_parts(host)

    is_ip = bool(_IPV4.match(host)) or host.startswith("[")
    digits = len(_DIGIT.findall(host))

    # A brand token only counts when the host is NOT that brand's own domain.
    # "sbi.co.in" must not be flagged; "sbi.secure-verify.xyz" must be.
    brand_present = 0
    for token in BRAND_TOKENS:
        if token in host and domain != token:
            brand_present = 1
            break

    return {
        "host_len": len(host),
        "num_labels": len(labels),
        "num_hyphens": host.count("-"),
        "digit_ratio": (digits / len(host)) if host else 0.0,
        "max_label_len": max((len(label) for label in labels), default=0),
        "domain_entropy": shannon_entropy(domain),
        "is_ip_literal": 1 if is_ip else 0,
        "has_punycode": 1 if "xn--" in host else 0,
        "is_common_tld": 1 if tld.split(".")[-1] in COMMON_TLDS else 0,
        "tld_len": len(tld),
        "brand_token_present": brand_present,
        "has_suspicious_word": 1 if any(word in host for word in SUSPICIOUS_WORDS) else 0,
    }


def to_vector(url: str) -> list[float]:
    features = extract(url)
    return [float(features[name]) for name in FEATURES]
