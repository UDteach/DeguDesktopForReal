#!/usr/bin/env python3
"""Key a Flow MP4 and encode a transparent VP9 overlay for Electron."""

from pathlib import Path
import argparse
import shutil
import subprocess

from key_chroma import keyed_frame, probe


ROOT = Path(__file__).resolve().parent.parent


def process(source: Path, target: Path) -> None:
    width, height, rate = probe(source)
    if (width, height) not in ((1280, 720), (1920, 1080)):
        raise ValueError(f"Unexpected Flow size: {width}x{height}")

    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f"{target.stem}.part.webm")
    decoder = subprocess.Popen(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(source),
         "-map", "0:v:0", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    encoder = subprocess.Popen(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
         "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{width}x{height}",
         "-r", rate, "-i", "pipe:0", "-an", "-c:v", "libvpx-vp9",
         "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "28",
         "-auto-alt-ref", "0", "-row-mt", "1", "-threads", "4",
         str(temporary)],
        stdin=subprocess.PIPE, stderr=subprocess.PIPE,
    )

    frame_bytes = width * height * 3
    count = 0
    assert decoder.stdout is not None and encoder.stdin is not None
    while raw := decoder.stdout.read(frame_bytes):
        if len(raw) != frame_bytes:
            raise RuntimeError(f"Incomplete frame in {source}")
        encoder.stdin.write(keyed_frame(raw, width, height))
        count += 1
    encoder.stdin.close()
    decoder.wait()
    encoder.wait()
    if decoder.returncode or encoder.returncode or not count:
        temporary.unlink(missing_ok=True)
        raise RuntimeError(
            f"ffmpeg failed for {source}: "
            f"{decoder.stderr.read().decode()} {encoder.stderr.read().decode()}"
        )

    tags = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream_tags=alpha_mode", "-of", "default=nw=1",
         str(temporary)],
        check=True, capture_output=True, text=True,
    ).stdout
    if "alpha_mode=1" not in tags:
        temporary.unlink(missing_ok=True)
        raise RuntimeError(f"VP9 alpha missing from {temporary}")
    temporary.replace(target)
    print(f"{count} frames, {width}x{height} -> {target}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Flow MP4 downloaded from Chrome")
    parser.add_argument("target", type=Path, help="assets/videos/<color>-<motion>.webm")
    parser.add_argument("--keep-source", action="store_true", help="copy MP4 to the local raw archive")
    args = parser.parse_args()
    source = args.source.expanduser().resolve()
    target = args.target.expanduser().resolve()
    if args.keep_source:
        archive = ROOT / "concept" / "flow-raw" / f"{target.stem}.mp4"
        archive.parent.mkdir(parents=True, exist_ok=True)
        if source != archive:
            shutil.copy2(source, archive)
    process(source, target)


if __name__ == "__main__":
    main()
