"""
Download the Israeli public-transportation GTFS feed, convert it to Parquet,
and write the output to data/gtfs/ (relative to the repo root).

Usage (from repo root):
    python .github/scripts/gtfs_to_parquet.py [--zip /path/to/feed.zip]
"""
from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

GTFS_URL = "https://gtfs.mot.gov.il/gtfsfiles/israel-public-transportation.zip"
DEFAULT_ZIP = Path("/tmp/ipt.zip")
DEFAULT_OUT = Path("data/gtfs")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip", type=Path, default=DEFAULT_ZIP,
                        help="Path to already-downloaded zip (skip download if exists)")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT,
                        help="Output directory for parquet files")
    args = parser.parse_args()

    zip_path: Path = args.zip
    out_path: Path = args.out

    # --- download ---
    print(f"Downloading {GTFS_URL} → {zip_path}", flush=True)
    urllib.request.urlretrieve(GTFS_URL, zip_path)  # noqa: S310 – URL is a compile-time constant
    print(f"Downloaded {zip_path.stat().st_size / 1_048_576:.1f} MB", flush=True)

    # --- convert ---
    try:
        from gtfs_parquet import parse_gtfs_zip, write_parquet
    except ImportError:
        print("ERROR: gtfs-parquet is not installed. Run: pip install gtfs-parquet", file=sys.stderr)
        sys.exit(1)

    print(f"Parsing {zip_path} ...", flush=True)
    feed = parse_gtfs_zip(zip_path)

    out_path.mkdir(parents=True, exist_ok=True)
    print(f"Writing parquet → {out_path}", flush=True)
    write_parquet(feed, out_path, compression="zstd", compression_level=9)
    print("Done.", flush=True)


if __name__ == "__main__":
    main()
