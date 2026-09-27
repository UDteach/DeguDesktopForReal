#!/usr/bin/env python3
"""Make smaller transparent WebM files for the GitHub Pages OBS overlay."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/videos"
TARGET = ROOT / "docs/assets/obs-videos"
TARGET.mkdir(parents=True, exist_ok=True)
sources = sorted(SOURCE.glob("*.webm"))
if len(sources) != 48:
    raise SystemExit(f"Expected 48 source videos, found {len(sources)}")


def encode(source):
    target = TARGET / source.name
    if target.exists() and target.stat().st_mtime >= source.stat().st_mtime:
        return target
    subprocess.run([
        "ffmpeg", "-y", "-v", "error", "-c:v", "libvpx-vp9", "-i", str(source),
        "-vf", "scale=1280:720:flags=lanczos", "-c:v", "libvpx-vp9",
        "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "35",
        "-auto-alt-ref", "0", "-row-mt", "1", "-threads", "4", "-an", str(target),
    ], check=True)
    frame = subprocess.run([
        "ffmpeg", "-v", "error", "-c:v", "libvpx-vp9", "-ss", "2", "-i", str(target),
        "-frames:v", "1", "-vf", "scale=160:90", "-pix_fmt", "rgba",
        "-f", "rawvideo", "pipe:1",
    ], check=True, capture_output=True).stdout
    if not frame or not any(alpha < 250 for alpha in frame[3::4]):
        target.unlink(missing_ok=True)
        raise RuntimeError(f"Transparency missing: {target.name}")
    return target


with ThreadPoolExecutor(max_workers=4) as pool:
    for task in as_completed(pool.submit(encode, source) for source in sources):
        print(task.result().name, flush=True)
print(f"Published {len(sources)} transparent videos.")
