"""Fetch the UCI SMS Spam Collection — the real-message backbone for the
scam-text model. No public UPI-fraud SMS dataset exists, so this general-purpose
spam corpus is augmented with synthetic India/UPI rows in build_text_dataset.py.
"""
import urllib.request
import zipfile
from pathlib import Path

URL = "https://archive.ics.uci.edu/static/public/228/sms+spam+collection.zip"
RAW_DIR = Path("ml/data/raw")


def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = RAW_DIR / "smsspamcollection.zip"

    print(f"Downloading {URL} ...")
    urllib.request.urlretrieve(URL, zip_path)

    with zipfile.ZipFile(zip_path) as z:
        z.extractall(RAW_DIR)

    print(f"Extracted to {RAW_DIR}")


if __name__ == "__main__":
    main()
