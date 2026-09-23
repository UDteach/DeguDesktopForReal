#!/usr/bin/env python3
"""Check every release video and the coat ledger before packaging."""

import json
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parent.parent
MOTIONS = ("a-bottom-pop", "b-side-peek", "c-center-hop")


def probe(path: Path) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height:stream_tags=alpha_mode:format=duration",
         "-of", "json", str(path)],
        check=True, capture_output=True, text=True,
    )
    return json.loads(result.stdout)


def main() -> int:
    ledger = json.loads((ROOT / "variants" / "ledger.json").read_text())
    errors = []
    count = 0
    for variant in ledger["variants"]:
        if variant["status"] == "alias-of-blue":
            continue
        color = variant["id"]
        expected = [f"assets/videos/{color}-{motion}.webm" for motion in MOTIONS]
        if variant.get("videos") != expected:
            errors.append(f"{color}: ledger videos do not match the three motions")
        for relative in expected:
            path = ROOT / relative
            if not path.is_file():
                errors.append(f"missing {relative}")
                continue
            try:
                data = probe(path)
                stream = data["streams"][0]
                dimensions = (stream["width"], stream["height"])
                if dimensions not in ((1280, 720), (1920, 1080)):
                    errors.append(f"{relative}: unexpected size {dimensions}")
                if stream.get("tags", {}).get("alpha_mode") != "1":
                    errors.append(f"{relative}: VP9 alpha tag missing")
                duration = float(data["format"]["duration"])
                if not 3.5 <= duration <= 4.5:
                    errors.append(f"{relative}: unexpected duration {duration:.2f}s")
                count += 1
            except (subprocess.CalledProcessError, KeyError, ValueError) as exc:
                errors.append(f"{relative}: probe failed: {exc}")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"OK: {count} transparent videos across {count // 3} colors")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
