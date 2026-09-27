#!/usr/bin/env python3
"""Flatten the approved transparent OBS clips onto the Web trial's MP4 background."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/assets/obs-videos"
TARGET = ROOT / "docs/assets/trial-videos"
REPORT = ROOT / "qa/web-trial/mp4-assets.json"
BACKGROUND = (242, 238, 230)  # #f2eee6; also used by the trial UI.


def probe(path):
    return json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path),
    ]))


def frame(path, alpha=False):
    # FFmpeg's native VP9 decoder drops WebM alpha; explicitly use libvpx-vp9.
    decoder = ["-c:v", "libvpx-vp9"] if alpha else []
    return subprocess.check_output([
        "ffmpeg", "-v", "error", "-threads", "2", *decoder,
        "-ss", "2", "-i", str(path), "-frames:v", "1", "-pix_fmt",
        "rgba" if alpha else "rgb24", "-f", "rawvideo", "pipe:1",
    ])


def faststart(path):
    atoms = []
    with path.open("rb") as stream:
        while header := stream.read(8):
            size, kind = struct.unpack(">I4s", header)
            if size == 1:
                size = struct.unpack(">Q", stream.read(8))[0]
                size -= 8
            atoms.append(kind)
            if size < 8:
                break
            stream.seek(size - 8, 1)
    return b"moov" in atoms and b"mdat" in atoms and atoms.index(b"moov") < atoms.index(b"mdat")


def verify(source, target):
    source_info, target_info = probe(source), probe(target)
    source_video = source_info["streams"][0]
    video = target_info["streams"][0]
    assert len(target_info["streams"]) == 1, f"Unexpected extra stream: {target}"
    assert video["codec_name"] == "h264" and video["profile"] == "Constrained Baseline"
    assert video["level"] == 31 and video["pix_fmt"] == "yuv420p"
    assert (video["width"], video["height"]) == (source_video["width"], source_video["height"])
    assert video["r_frame_rate"] == source_video["r_frame_rate"] == "24/1"
    assert video["nb_frames"] == "96"
    assert abs(float(target_info["format"]["duration"]) - float(source_info["format"]["duration"])) < 0.001
    assert faststart(target), f"MP4 is not faststart: {target}"
    rgba, rgb = frame(source, alpha=True), frame(target)
    width, height = video["width"], video["height"]
    assert len(rgba) == width * height * 4 and len(rgb) == width * height * 3
    assert min(rgba[3::4]) == 0 and max(rgba[3::4]) == 255, f"Source alpha missing: {source}"
    # Sample original-size pixels, avoiding rescale-induced color conversion differences.
    transparent = [y * width + x for y in range(4, height, 8) for x in range(4, width, 8)
                   if rgba[(y * width + x) * 4 + 3] == 0]
    assert len(transparent) > 1000, f"Insufficient transparent background: {source}"
    means = [sum(rgb[index * 3 + channel] for index in transparent) / len(transparent)
             for channel in range(3)]
    black_pixels = sum(max(rgb[index * 3:index * 3 + 3]) < 30 for index in transparent)
    assert black_pixels == 0, f"Black background in flattened MP4: {target}"
    assert max(abs(mean - expected) for mean, expected in zip(means, BACKGROUND)) < 3
    return {
        "file": str((TARGET / source.with_suffix(".mp4").name).relative_to(ROOT)),
        "source": str(source.relative_to(ROOT)),
        "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
        "bytes": target.stat().st_size,
        "codec": video["codec_name"], "profile": video["profile"], "level": video["level"],
        "pixelFormat": video["pix_fmt"], "width": width, "height": height,
        "fps": video["r_frame_rate"], "frames": int(video["nb_frames"]),
        "durationSeconds": float(target_info["format"]["duration"]),
        "faststart": True, "audioStreams": 0,
        "sampleAtSeconds": 2, "sourceAlphaRange": [0, 255],
        "transparentSamples": len(transparent),
        "backgroundMeanRgb": [round(value, 3) for value in means],
        "blackBackgroundSamples": black_pixels,
    }


def process(source, check_only):
    target = TARGET / source.with_suffix(".mp4").name
    info = probe(source)
    video = info["streams"][0]
    assert (video["width"], video["height"], video["r_frame_rate"]) == (1280, 720, "24/1")
    assert info["format"]["duration"] == "4.000000"
    if check_only:
        return verify(source, target)
    temporary = target.with_suffix(".part.mp4")
    try:
        subprocess.run([
            "ffmpeg", "-y", "-v", "error", "-threads", "2", "-c:v", "libvpx-vp9", "-i", str(source),
            "-f", "lavfi", "-i", "color=c=0xf2eee6:s=1280x720:r=24:d=4,format=rgba",
            "-filter_complex_threads", "1", "-filter_complex",
            # WebM has millisecond timestamps. Normalize them to preserve all 96 frames.
            "[0:v]settb=1/24,setpts=N[fg];[1:v][fg]overlay=shortest=1:format=rgb:alpha=straight,"
            "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[v]",
            "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "23",
            "-profile:v", "baseline", "-level:v", "3.1", "-threads", "2", "-g", "48",
            "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
            "-color_range", "tv", "-movflags", "+faststart", str(temporary),
        ], check=True)
        result = verify(source, temporary)
        temporary.replace(target)
        return result
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-only", action="store_true", help="Verify existing outputs without re-encoding")
    parser.add_argument("--jobs", type=int, default=4, choices=range(1, 9))
    args = parser.parse_args()
    sources = sorted(SOURCE.glob("*.webm"))
    if len(sources) != 48:
        raise SystemExit(f"Expected 48 approved WebM clips, found {len(sources)}")
    TARGET.mkdir(parents=True, exist_ok=True)
    results = []
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        for future in as_completed(pool.submit(process, source, args.check_only) for source in sources):
            result = future.result()
            results.append(result)
            print(f"Verified {Path(result['file']).name}: {result['bytes']:,} bytes", flush=True)
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "background": "#f2eee6", "count": len(results),
        "totalBytes": sum(result["bytes"] for result in results),
        "files": sorted(results, key=lambda result: result["file"]),
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Verified {report['count']} clips; {report['totalBytes']:,} total bytes. Report: {REPORT}")


if __name__ == "__main__":
    main()
