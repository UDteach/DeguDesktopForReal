#!/usr/bin/env python3
"""Turn the three Flow greenscreen clips into spill-free ProRes 4444 overlays."""

from pathlib import Path
import json
import subprocess
import sys

import numpy as np


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "concept" / "flow-raw"
OUTPUT = ROOT / "concept" / "flow-alpha-rekeyed"
NAMES = (
    "agouti-a-bottom-pop",
    "agouti-b-side-peek",
    "agouti-c-center-hop",
)


def probe(path: Path) -> tuple[int, int, str]:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height,r_frame_rate", "-of", "json", str(path)],
        check=True, capture_output=True, text=True,
    )
    stream = json.loads(result.stdout)["streams"][0]
    return stream["width"], stream["height"], stream["r_frame_rate"]


def keyed_frame(raw: bytes, width: int, height: int) -> bytes:
    source = np.frombuffer(raw, dtype=np.uint8).reshape(height, width, 3)
    color = source.astype(np.float32)
    corners = np.concatenate((
        color[:64, :64].reshape(-1, 3),
        color[:64, -64:].reshape(-1, 3),
    ))
    background = np.median(corners, axis=0)
    background_excess = background[1] - max(background[0], background[2])

    # Green excess distinguishes the chroma backdrop from brown/gray fur.
    excess = color[:, :, 1] - np.maximum(color[:, :, 0], color[:, :, 2])
    alpha = np.clip((background_excess - excess) / (background_excess - 12), 0, 1)
    alpha = np.clip((alpha - 0.10) / 0.90, 0, 1) ** 1.15
    dark_green = ((color[:, :, 0] < 45) & (color[:, :, 2] < 55) &
                  (color[:, :, 1] > np.maximum(color[:, :, 0], color[:, :, 2]) * 1.5))
    alpha[dark_green] = 0

    # Extend nearby opaque fur colors into the soft alpha fringe, replacing
    # green-contaminated RGB values without hardening the hair silhouette.
    pixels = source.copy()
    known = alpha >= 0.97
    for _ in range(8):
        remaining = ~known
        for sy, sx, dy, dx in (
            (slice(None, -1), slice(None), slice(1, None), slice(None)),
            (slice(1, None), slice(None), slice(None, -1), slice(None)),
            (slice(None), slice(None, -1), slice(None), slice(1, None)),
            (slice(None), slice(1, None), slice(None), slice(None, -1)),
        ):
            transfer = known[sy, sx] & remaining[dy, dx]
            pixels[dy, dx][transfer] = pixels[sy, sx][transfer]
            remaining[dy, dx][transfer] = False
            known[dy, dx][transfer] = True

    # Brown and gray fur do not need a green channel stronger than red. Fade
    # the outer matte toward the red/blue midpoint to remove an olive line.
    red = pixels[:, :, 0].astype(np.float32)
    blue = pixels[:, :, 2].astype(np.float32)
    edge_weight = np.clip((1 - alpha) / 0.10, 0, 1)
    green_limit = red - (red - blue) * 0.5 * edge_weight
    pixels[:, :, 1] = np.minimum(pixels[:, :, 1], green_limit).astype(np.uint8)
    rgba = np.empty((height, width, 4), dtype=np.uint8)
    rgba[:, :, :3] = pixels
    rgba[:, :, 3] = np.rint(alpha * 255).astype(np.uint8)
    return rgba.tobytes()


def convert(name: str) -> None:
    source = SOURCE / f"{name}.mp4"
    target = OUTPUT / f"{name}.mov"
    width, height, rate = probe(source)
    decoder = subprocess.Popen(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(source),
         "-map", "0:v:0", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    encoder = subprocess.Popen(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
         "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{width}x{height}",
         "-r", rate, "-i", "pipe:0", "-an", "-c:v", "prores_ks",
         "-profile:v", "4", "-pix_fmt", "yuva444p10le", "-alpha_bits", "16",
         str(target)],
        stdin=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    frame_bytes = width * height * 3
    count = 0
    assert decoder.stdout is not None and encoder.stdin is not None
    while True:
        raw = decoder.stdout.read(frame_bytes)
        if not raw:
            break
        if len(raw) != frame_bytes:
            raise RuntimeError(f"Incomplete frame in {source}")
        encoder.stdin.write(keyed_frame(raw, width, height))
        count += 1
    encoder.stdin.close()
    decoder.wait()
    encoder.wait()
    if decoder.returncode or encoder.returncode:
        raise RuntimeError(
            f"ffmpeg failed for {name}: "
            f"{decoder.stderr.read().decode()} {encoder.stderr.read().decode()}"
        )
    print(f"{name}: {count} frames -> {target}", flush=True)


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for clip_name in (sys.argv[1:] or NAMES):
        convert(clip_name)
