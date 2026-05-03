"""
Download the Israeli public-transportation GTFS feed, sanitize malformed CSV
rows, convert to Parquet, and write output to data/gtfs/ (relative to repo root).

Usage (from repo root):
    python .github/scripts/gtfs_to_parquet.py [--zip /path/to/feed.zip]
"""
from __future__ import annotations

import argparse
import csv
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

GTFS_URL = "https://gtfs.mot.gov.il/gtfsfiles/israel-public-transportation.zip"
DEFAULT_ZIP = Path("/tmp/ipt.zip")
DEFAULT_EXTRACT = Path("/tmp/ipt_gtfs")
DEFAULT_CLEAN = Path("/tmp/ipt_clean")
DEFAULT_OUT = Path("data/gtfs")


def sanitize_gtfs_dir(source: Path, target: Path) -> Path:
    """Normalize every .txt file so every row matches the header width."""
    target.mkdir(parents=True, exist_ok=True)
    for txt in sorted(source.glob("*.txt")):
        out = target / txt.name
        with txt.open("r", encoding="utf-8-sig", newline="") as fin, \
             out.open("w", encoding="utf-8", newline="") as fout:
            reader = csv.reader(fin)
            writer = csv.writer(fout, lineterminator="\n")
            try:
                header = next(reader)
            except StopIteration:
                continue
            width = len(header)
            writer.writerow(header)
            for row in reader:
                if len(row) < width:
                    row = row + [""] * (width - len(row))
                elif len(row) > width:
                    row = row[:width]
                writer.writerow(row)
    return target


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip", type=Path, default=DEFAULT_ZIP)
    parser.add_argument("--extract", type=Path, default=DEFAULT_EXTRACT)
    parser.add_argument("--clean", type=Path, default=DEFAULT_CLEAN)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    zip_path: Path = args.zip
    extract_path: Path = args.extract
    clean_path: Path = args.clean
    out_path: Path = args.out

    # --- download ---
    print(f"Downloading {GTFS_URL} -> {zip_path}", flush=True)
    urllib.request.urlretrieve(GTFS_URL, zip_path)  # noqa: S310
    print(f"Downloaded {zip_path.stat().st_size / 1_048_576:.1f} MB", flush=True)

    # --- extract ---
    if extract_path.exists():
        shutil.rmtree(extract_path)
    extract_path.mkdir(parents=True)
    print(f"Extracting to {extract_path} ...", flush=True)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(extract_path)

    # --- sanitize malformed CSV rows ---
    print(f"Sanitizing CSV files -> {clean_path} ...", flush=True)
    if clean_path.exists():
        shutil.rmtree(clean_path)
    sanitize_gtfs_dir(extract_path, clean_path)

    # --- convert to parquet ---
    try:
        from gtfs_parquet import parse_gtfs, write_parquet
    except ImportError:
        print("ERROR: gtfs-parquet is not installed. Run: pip install gtfs-parquet", file=sys.stderr)
        sys.exit(1)

    print(f"Parsing {clean_path} ...", flush=True)
    feed = parse_gtfs(clean_path)

    out_path.mkdir(parents=True, exist_ok=True)
    print(f"Writing parquet -> {out_path}", flush=True)
    write_parquet(feed, out_path, compression="zstd", compression_level=9)
    print("Done.", flush=True)


if __name__ == "__main__":
    main()
