#!/usr/bin/env python3
"""Build animated WebP previews for browsers that lose VP9 alpha in WebM."""

from pathlib import Path
import subprocess

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "docs" / "assets" / "demo"
WIDTH, HEIGHT, FPS = 640, 360, 18
FRAME_BYTES = WIDTH * HEIGHT * 4


def convert(source: Path) -> None:
    command = [
        "ffmpeg", "-v", "error", "-c:v", "libvpx-vp9", "-i", str(source),
        "-vf", f"fps={FPS},scale={WIDTH}:{HEIGHT}:flags=lanczos",
        "-pix_fmt", "rgba", "-f", "rawvideo", "-",
    ]
    process = subprocess.Popen(command, stdout=subprocess.PIPE)
    assert process.stdout is not None
    frames = []
    while data := process.stdout.read(FRAME_BYTES):
        if len(data) != FRAME_BYTES:
            raise RuntimeError(f"Incomplete frame in {source.name}")
        frames.append(Image.frombytes("RGBA", (WIDTH, HEIGHT), data))
    if process.wait() != 0 or not frames:
        raise RuntimeError(f"Could not decode {source.name}")

    target = source.with_suffix(".webp")
    frames[0].save(
        target,
        format="WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=round(1000 / FPS),
        loop=0,
        quality=78,
        method=5,
    )
    print(f"{target.relative_to(ROOT)}: {len(frames)} frames, {target.stat().st_size:,} bytes")


if __name__ == "__main__":
    for source in sorted(DEMO.glob("*.webm")):
        convert(source)
