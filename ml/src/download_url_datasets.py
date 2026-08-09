"""Fetch the raw feeds for the link-risk model.

Unlike the QR/VPA model — which had to be trained on synthetic data because no
public dataset of fraudulent UPI QR payloads exists — malicious URLs are one of
the best-documented things in security. Three public feeds are used, and the
model is evaluated on real held-out data from them:

  OpenPhish (community feed)  live phishing URLs, small but current
  URLhaus (abuse.ch)          malware distribution URLs, including .apk drops
  Tranco top-1M               benign reference list, research-grade and stable

PhishTank is deliberately absent: its bulk download now requires a registered
API key, and a dataset step that cannot be re-run by whoever reads this repo is
worse than one source fewer.

Feeds are live, so re-running this on a different day yields a different corpus.
The exact snapshot used for the published metrics is recorded in
ml/models/url_risk_model.metrics.json.
"""
import io
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

RAW_DIR = Path("ml/data/raw/url")

FEEDS = {
    "openphish.txt": "https://openphish.com/feed.txt",
    "urlhaus.csv": "https://urlhaus.abuse.ch/downloads/csv_online/",
}
TRANCO_URL = "https://tranco-list.eu/top-1m.csv.zip"

# Some feeds reject the bare urllib UA.
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; RakshaPay-research/1.0)"}


def fetch(url: str, timeout: int = 120) -> bytes:
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    for name, url in FEEDS.items():
        print(f"Downloading {url} ...")
        (RAW_DIR / name).write_bytes(fetch(url))
        print(f"  -> {RAW_DIR / name} ({(RAW_DIR / name).stat().st_size:,} bytes)")

    print(f"Downloading {TRANCO_URL} ...")
    with zipfile.ZipFile(io.BytesIO(fetch(TRANCO_URL))) as archive:
        member = archive.namelist()[0]
        (RAW_DIR / "tranco.csv").write_bytes(archive.read(member))
    print(f"  -> {RAW_DIR / 'tranco.csv'} ({(RAW_DIR / 'tranco.csv').stat().st_size:,} bytes)")

    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    (RAW_DIR / "SNAPSHOT.txt").write_text(
        f"Feeds downloaded at {stamp}\n"
        + "\n".join(f"{name}: {url}" for name, url in FEEDS.items())
        + f"\ntranco.csv: {TRANCO_URL}\n"
    )
    print(f"\nSnapshot recorded at {stamp}")


if __name__ == "__main__":
    main()
