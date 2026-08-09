"""Build the link-risk training set from the three downloaded feeds.

Every row is a HOST, not a URL, for the reason set out at the top of
url_features.py: the malicious feeds carry full URLs and the benign reference
carries bare domains, so comparing them as URLs would train a path detector and
report a fraudulent accuracy.

Three things this script is careful about, each of which would otherwise inflate
the headline number:

1. **Overlap.** Any host appearing in both the malicious and benign sets is
   dropped from the benign side. Tranco is a popularity list, not a safety list,
   and compromised popular sites appear in URLhaus regularly.

2. **Benign sampling.** Benign hosts are drawn uniformly across the whole
   Tranco top-1M, not from the top few thousand. The top of that list is
   short, famous, single-word .com domains — a benign set made of those is
   trivially separable and the resulting accuracy would mean nothing.

3. **Deduplication.** Feeds repeat the same host across many URLs; URLhaus in
   particular lists dozens of paths on one compromised server. Counting each of
   those as a separate example would let a handful of hosts dominate training.
"""
import csv
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from url_features import host_of  # noqa: E402

RAW_DIR = Path("ml/data/raw/url")
OUT_PATH = Path("ml/data/url_risk_dataset.csv")

# Benign rows per malicious row. Kept near 1 so neither class dominates and
# precision/recall stay directly comparable.
BENIGN_RATIO = 1.5
SEED = 42


def read_openphish() -> set[str]:
    path = RAW_DIR / "openphish.txt"
    if not path.exists():
        return set()
    hosts = set()
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        host = host_of(line)
        if host:
            hosts.add(host)
    return hosts


def read_urlhaus() -> set[str]:
    path = RAW_DIR / "urlhaus.csv"
    if not path.exists():
        return set()

    hosts = set()
    lines = [
        line for line in path.read_text(encoding="utf-8", errors="replace").splitlines()
        if line and not line.startswith("#")
    ]
    for row in csv.reader(lines):
        # id,dateadded,url,url_status,last_online,threat,tags,urlhaus_link,reporter
        if len(row) < 3:
            continue
        host = host_of(row[2])
        if host:
            hosts.add(host)
    return hosts


def read_tranco() -> list[str]:
    path = RAW_DIR / "tranco.csv"
    if not path.exists():
        return []

    hosts = []
    with path.open(encoding="utf-8", errors="replace") as handle:
        for row in csv.reader(handle):
            if len(row) >= 2 and row[1]:
                hosts.append(row[1].strip().lower())
    return hosts


def main():
    malicious = read_openphish() | read_urlhaus()
    if not malicious:
        raise SystemExit("No malicious hosts found — run ml/src/download_url_datasets.py first")

    benign_all = read_tranco()
    if not benign_all:
        raise SystemExit("No benign hosts found — run ml/src/download_url_datasets.py first")

    # Drop popular-but-compromised hosts from the benign side rather than
    # letting the same host carry both labels.
    overlap = malicious.intersection(benign_all)
    benign_pool = [host for host in benign_all if host not in malicious]

    target = int(len(malicious) * BENIGN_RATIO)
    rng = random.Random(SEED)
    benign = rng.sample(benign_pool, min(target, len(benign_pool)))

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["host", "label"])
        for host in sorted(malicious):
            writer.writerow([host, 1])
        for host in sorted(benign):
            writer.writerow([host, 0])

    print(f"malicious hosts (deduped): {len(malicious):,}")
    print(f"  from OpenPhish:          {len(read_openphish()):,}")
    print(f"  from URLhaus:            {len(read_urlhaus()):,}")
    print(f"benign pool (Tranco):      {len(benign_pool):,}")
    print(f"  dropped as overlapping:  {len(overlap):,}")
    print(f"benign sampled:            {len(benign):,}")
    print(f"\nWrote {OUT_PATH} ({len(malicious) + len(benign):,} rows)")


if __name__ == "__main__":
    main()
