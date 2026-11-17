#!/usr/bin/env python3
"""Apply the gallery's exported edit JSON to local image files, in batch.

This is a *reference implementation* of what the viewer renders, so the JSON
from the editor's **Edits -> Export** action can be tested outside the browser:
does a saved edit reproduce on the original files, how fast is a batch, and is
the format enough to drive an offline pipeline?

It mirrors `src/lib/*` exactly, in this order:

1. Crop  (`src/lib/crop.ts`, CSS `.lightbox-crop img`)
   - frame takes the crop `ratio`, image is `object-fit: cover`
   - `x`/`y` are CSS `object-position` pans: 0 centred, ±1 the frame edge
   - `zoom` is `transform: scale()` about the frame centre (1..3)
2. Filter (`filterCss`, `brightness(%) contrast(%) saturate(%)`, CSS order)
3. Tint overlay   — `mix-blend-mode: color`,  opacity = tintStrength / 100,
                    colour = hsl(tintHue 80% 50%)
4. White balance  — `mix-blend-mode: soft-light`, opacity = |temp|/100 * 0.35,
                    warm rgb(255,176,92) / cool rgb(96,160,255)

Accepted JSON (same as `parseEditsJson`):

    {"version": 1, "exportedAt": "...",
     "items": {"<fileId>": {"adjust": {...}, "crop": {...}|null, "updatedAt": "..."}}}

or a bare `{"<fileId>": {...}}` map.

Edits are keyed by Drive file id, which is not in the filename, so map ids to
files with `--map` (a JSON object of `id -> path or basename`) or by naming the
files after the ids. With no map, an edit whose key equals a file's stem is
used. `--all-with <id>` applies one edit to every input file.

Examples:

    pip install pillow numpy

    python tools/apply_edits.py edits.json                     # tools/media_input -> media_output
    python tools/apply_edits.py edits.json photos/ out/
    python tools/apply_edits.py edits.json photos/ out/ --map map.json
    python tools/apply_edits.py edits.json photos/ out/ --all-with 1AbC... --size 2400
    python tools/apply_edits.py --selftest        # checks the math, no files needed

Timing is reported per image, which is the point of the exercise: a 24 MP JPEG
is usually a few hundred milliseconds, so a folder of edits is a batch job, not
a per-photo wait.
"""

from __future__ import annotations

import argparse
import colorsys
import json
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageOps

try:  # Pillow >= 10 renamed the enum
    RESAMPLE = Image.Resampling.LANCZOS
except AttributeError:  # pragma: no cover - older Pillow
    RESAMPLE = Image.LANCZOS

SCRIPT_DIR = Path(__file__).resolve().parent

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}

DEFAULT_ADJUST = {
    "brightness": 100.0,
    "contrast": 100.0,
    "saturation": 100.0,
    "temperature": 0.0,
    "tintHue": 0.0,
    "tintStrength": 0.0,
}

# Crop limits from src/lib/crop.ts.
CROP_MIN_RATIO = 0.25
CROP_MAX_RATIO = 4.0
CROP_MIN_ZOOM = 1.0
CROP_MAX_ZOOM = 3.0

WARM = np.array([255, 176, 92], dtype=np.float32) / np.float32(255.0)
COOL = np.array([96, 160, 255], dtype=np.float32) / np.float32(255.0)


# --------------------------------------------------------------------------- #
# JSON
# --------------------------------------------------------------------------- #


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def normalise_edit(value: Any) -> dict[str, Any] | None:
    """Accepts one `PhotoEdit` and fills defaults; None when it is not one."""
    if not isinstance(value, dict):
        return None
    adjust = value.get("adjust")
    if not isinstance(adjust, dict):
        return None
    if not all(is_number(adjust.get(key)) for key in DEFAULT_ADJUST):
        return None

    crop = value.get("crop")
    if crop is not None:
        if not isinstance(crop, dict) or not all(
            is_number(crop.get(key)) for key in ("ratio", "zoom", "x", "y")
        ):
            return None

    return {
        "adjust": {key: float(adjust[key]) for key in DEFAULT_ADJUST},
        "crop": None if crop is None else {key: float(crop[key]) for key in crop},
    }


def load_edits(path: Path) -> dict[str, dict[str, Any]]:
    parsed = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(parsed, dict):
        raise SystemExit(f"{path}: not a JSON object")
    items = parsed.get("items", parsed)
    if not isinstance(items, dict):
        raise SystemExit(f"{path}: no edit items found")

    edits: dict[str, dict[str, Any]] = {}
    for file_id, value in items.items():
        edit = normalise_edit(value)
        if edit is not None:
            edits[str(file_id)] = edit
    if not edits:
        raise SystemExit(f"{path}: no entries look like saved edits")
    return edits


def load_map(path: Path) -> dict[str, str]:
    parsed = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(parsed, dict):
        raise SystemExit(f"{path}: map must be a JSON object of id -> file")
    return {str(key): str(value) for key, value in parsed.items()}


# --------------------------------------------------------------------------- #
# Crop (object-fit: cover + object-position + transform: scale)
# --------------------------------------------------------------------------- #


def crop_box(
    width: int, height: int, crop: dict[str, Any]
) -> tuple[int, int, int, int]:
    """Source-pixel box the crop frame shows, matching the CSS pipeline."""
    ratio = min(CROP_MAX_RATIO, max(CROP_MIN_RATIO, crop["ratio"]))
    zoom = min(CROP_MAX_ZOOM, max(CROP_MIN_ZOOM, crop["zoom"]))
    pan_x = min(1.0, max(-1.0, crop["x"]))
    pan_y = min(1.0, max(-1.0, crop["y"]))

    # Frame in arbitrary units: width = ratio, height = 1.
    frame_w, frame_h = ratio, 1.0
    scale = max(frame_w / width, frame_h / height)  # cover
    shown_w, shown_h = width * scale, height * scale

    # object-position: p% aligns p% of the overflow. Pan ±1 hits an edge.
    pos_x = 0.5 + pan_x * 0.5
    pos_y = 0.5 + pan_y * 0.5
    offset_x = (frame_w - shown_w) * pos_x
    offset_y = (frame_h - shown_h) * pos_y

    # transform: scale(zoom) about the frame centre keeps a centred window.
    window_w, window_h = frame_w / zoom, frame_h / zoom
    left = frame_w / 2 - window_w / 2
    top = frame_h / 2 - window_h / 2

    src_left = (left - offset_x) / scale
    src_top = (top - offset_y) / scale
    src_right = (left + window_w - offset_x) / scale
    src_bottom = (top + window_h - offset_y) / scale

    x0 = int(round(max(0.0, min(width, src_left))))
    y0 = int(round(max(0.0, min(height, src_top))))
    x1 = int(round(max(0.0, min(width, src_right))))
    y1 = int(round(max(0.0, min(height, src_bottom))))

    # Degenerate roundings (tiny images, extreme zoom) still need a pixel.
    if x1 <= x0:
        x0, x1 = 0, width
    if y1 <= y0:
        y0, y1 = 0, height
    return x0, y0, x1, y1


def output_size(ratio: float, long_edge: int) -> tuple[int, int]:
    if ratio >= 1:
        return long_edge, max(1, round(long_edge / ratio))
    return max(1, round(long_edge * ratio)), long_edge


# --------------------------------------------------------------------------- #
# Colour (CSS filter + blend modes)
# --------------------------------------------------------------------------- #


def luminance(rgb: np.ndarray) -> np.ndarray:
    """Compositing-spec Lum(); the sRGB filter matrix uses different weights."""
    return (
        np.float32(0.3) * rgb[..., 0]
        + np.float32(0.59) * rgb[..., 1]
        + np.float32(0.11) * rgb[..., 2]
    )


def css_filter(rgb: np.ndarray, adjust: dict[str, float]) -> np.ndarray:
    """brightness() then contrast() then saturate(), in sRGB, CSS order."""
    out = rgb * np.float32(adjust["brightness"] / 100.0)
    out -= np.float32(0.5)
    out *= np.float32(adjust["contrast"] / 100.0)
    out += np.float32(0.5)

    # saturate() matrix weights (filter spec), not the blend Lum() weights.
    lum = (
        np.float32(0.213) * out[..., 0]
        + np.float32(0.715) * out[..., 1]
        + np.float32(0.072) * out[..., 2]
    )
    factor = np.float32(adjust["saturation"] / 100.0) - np.float32(1.0)
    out += factor * (out - lum[..., None])
    return np.clip(out, 0.0, 1.0, out=out)


def color_overlay(backdrop: np.ndarray, colour: np.ndarray) -> np.ndarray:
    """`mix-blend-mode: color` with a flat source colour.

    B(Cb, Cs) = SetLum(Cs, Lum(Cb)): hue and chrome come from `colour`, the
    luminance from the backdrop. Because the source is one flat colour, the
    blend is a single scalar luminance offset per channel, and ClipColor's two
    spec steps both scale the same term, so they collapse into one multiplier.
    """
    source_lum = luminance(colour)
    delta = (colour - source_lum).astype(np.float32)
    back_lum = luminance(backdrop)

    lowest = back_lum + delta.min()
    highest = back_lum + delta.max()

    low_den = back_lum - lowest
    low_den = np.where(np.abs(low_den) < 1e-12, np.float32(1.0), low_den)
    high_den = highest - back_lum
    high_den = np.where(np.abs(high_den) < 1e-12, np.float32(1.0), high_den)

    scale = np.where(lowest < 0.0, back_lum / low_den, np.float32(1.0))
    scale = scale * np.where(
        highest > 1.0, (np.float32(1.0) - back_lum) / high_den, np.float32(1.0)
    )

    out = back_lum[..., None] + delta[None, :] * scale[..., None]
    return np.clip(out, 0.0, 1.0, out=out)


def soft_light_overlay(backdrop: np.ndarray, colour: np.ndarray) -> np.ndarray:
    """`mix-blend-mode: soft-light` with a flat source colour."""
    curved = np.where(
        backdrop <= 0.25,
        ((np.float32(16.0) * backdrop - np.float32(12.0)) * backdrop + np.float32(4.0))
        * backdrop,
        np.sqrt(np.clip(backdrop, 0.0, 1.0)),
    )

    out = np.empty_like(backdrop)
    for channel in range(3):
        source = np.float32(colour[channel])
        back = backdrop[..., channel]
        if source <= 0.5:
            out[..., channel] = back * (
                1.0 + (2.0 * source - 1.0) * (1.0 - back)
            )
        else:
            out[..., channel] = back + (2.0 * source - 1.0) * (
                curved[..., channel] - back
            )
    return out


def apply_adjustments(rgb: np.ndarray, adjust: dict[str, float]) -> np.ndarray:
    """The exact stack the grid card and the lightbox both render."""
    out = css_filter(rgb, adjust)

    tint = np.float32(adjust["tintStrength"] / 100.0)
    if tint > 0.0:
        colour = np.array(
            colorsys.hls_to_rgb((adjust["tintHue"] % 360.0) / 360.0, 0.5, 0.8),
            dtype=np.float32,
        )
        out += tint * (color_overlay(out, colour) - out)

    temperature = adjust["temperature"]
    if temperature != 0.0:
        colour = WARM if temperature > 0 else COOL
        alpha = np.float32(abs(temperature) / 100.0 * 0.35)
        out += alpha * (soft_light_overlay(out, colour) - out)

    return np.clip(out, 0.0, 1.0, out=out)


# --------------------------------------------------------------------------- #
# One file
# --------------------------------------------------------------------------- #


def render(
    image: Image.Image, edit: dict[str, Any], long_edge: int
) -> Image.Image:
    # Browsers honour EXIF orientation when painting an <img>; Pillow does not,
    # so transpose first or portrait phone shots come out sideways.
    source = ImageOps.exif_transpose(image).convert("RGB")
    width, height = source.size

    crop = edit["crop"]
    if crop:
        source = source.crop(crop_box(width, height, crop))
        ratio = min(CROP_MAX_RATIO, max(CROP_MIN_RATIO, crop["ratio"]))
    else:
        ratio = width / height

    target = output_size(ratio, long_edge)
    source = source.resize(target, RESAMPLE)

    rgb = np.asarray(source, dtype=np.float32) / np.float32(255.0)
    out = apply_adjustments(rgb, edit["adjust"])
    return Image.fromarray(
        np.round(np.clip(out, 0.0, 1.0) * 255.0).astype(np.uint8)
    )


def save(image: Image.Image, path: Path, quality: int) -> None:
    suffix = path.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        image.save(path, quality=quality, subsampling=1, optimize=True)
    elif suffix == ".webp":
        image.save(path, quality=quality, method=4)
    else:
        image.save(path)


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #


def collect_inputs(folder: Path) -> list[Path]:
    return sorted(
        path
        for path in folder.iterdir()
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    )


def resolve_edit(
    image_path: Path,
    edits: dict[str, dict[str, Any]],
    id_to_name: dict[str, str],
    forced: str | None,
) -> tuple[str, dict[str, Any]] | None:
    if forced is not None:
        edit = edits.get(forced)
        return (forced, edit) if edit else None

    for file_id, name in id_to_name.items():
        if Path(name).stem == image_path.stem or Path(name).name == image_path.name:
            edit = edits.get(file_id)
            if edit:
                return file_id, edit

    edit = edits.get(image_path.stem)
    return (image_path.stem, edit) if edit else None


def run(args: argparse.Namespace) -> int:
    edits = load_edits(args.edits)
    id_to_name = load_map(args.map) if args.map else {}
    inputs = collect_inputs(args.photos)
    if not inputs:
        print(f"No images in {args.photos}", file=sys.stderr)
        return 1

    if args.all_with and args.all_with not in edits:
        print(f"--all-with {args.all_with} is not in the JSON", file=sys.stderr)
        return 1

    args.out.mkdir(parents=True, exist_ok=True)
    made, skipped = 0, 0
    started = time.perf_counter()

    for path in inputs:
        match = resolve_edit(path, edits, id_to_name, args.all_with)
        if match is None:
            if not args.all_with:
                skipped += 1
            continue

        file_id, edit = match
        destination = args.out / f"{path.stem}{args.extension}"
        if args.dry_run:
            print(f"[dry] {path.name} -> {destination.name}  ({file_id})")
            made += 1
            continue

        tick = time.perf_counter()
        with Image.open(path) as opened:
            rendered = render(opened, edit, args.size)
        save(rendered, destination, args.quality)
        elapsed = (time.perf_counter() - tick) * 1000
        made += 1
        print(f"{path.name} -> {destination.name}  {elapsed:.0f} ms  [{file_id}]")

    total = time.perf_counter() - started
    print(
        f"\n{made} written, {skipped} skipped without an edit, "
        f"{total:.2f} s total"
        + ("" if made == 0 else f" ({total / made * 1000:.0f} ms/photo)")
    )
    return 0


def selftest() -> int:
    """No files needed: checks the pipeline against the documented behaviour."""
    failures: list[str] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        print(("PASS  " if ok else "FAIL  ") + name + (f"  {detail}" if detail else ""))
        if not ok:
            failures.append(name)

    # A smooth gradient plus a colour patch, in 0..1.
    height, width = 96, 128
    gradient = np.linspace(0.1, 0.9, width, dtype=np.float64)
    rgb = np.repeat(gradient[None, :, None], height, axis=0)
    rgb = np.repeat(rgb, 3, axis=-1)
    rgb[:, :, 2] *= np.linspace(0.6, 1.0, width)

    # Neutral edit is a no-op.
    neutral = {**DEFAULT_ADJUST}
    same = apply_adjustments(rgb.astype(np.float32), neutral)
    check("neutral adjust is identity", np.allclose(same, rgb, atol=1e-6))

    # Brightness scales toward white, contrast toward mid grey.
    bright = apply_adjustments(rgb, {**neutral, "brightness": 120})
    check("brightness 120% is brighter", bright.mean() > rgb.mean())
    contrast = apply_adjustments(rgb, {**neutral, "contrast": 140})
    check("contrast 140% widens range", contrast.std() > rgb.std())

    # Saturation 0 matches the CSS matrix luminance.
    grey = apply_adjustments(rgb, {**neutral, "saturation": 0})
    check(
        "saturation 0% is grey",
        np.allclose(grey[..., 0], grey[..., 1], atol=1e-9)
        and np.allclose(grey[..., 1], grey[..., 2], atol=1e-9),
    )

    # Warm cast raises red vs blue, cool cast lowers it.
    warm = apply_adjustments(rgb, {**neutral, "temperature": 100})
    cool = apply_adjustments(rgb, {**neutral, "temperature": -100})
    warm_delta = (warm[..., 0] - warm[..., 2]).mean()
    cool_delta = (cool[..., 0] - cool[..., 2]).mean()
    base_delta = (rgb[..., 0] - rgb[..., 2]).mean()
    check("temperature +100 warms", warm_delta > base_delta)
    check("temperature -100 cools", cool_delta < base_delta)
    # The overlay is an alpha mix, so half the strength is half the shift.
    mid = apply_adjustments(rgb.astype(np.float32), {**neutral, "temperature": 50})
    check(
        "temperature opacity is linear in strength",
        np.allclose((mid - rgb) * 2.0, warm - rgb, atol=1e-5),
    )

    # Tint keeps backdrop luminance but shifts hue: a strong tint changes the
    # channels while the computed luminance stays close.
    tinted = apply_adjustments(
        rgb, {**neutral, "tintHue": 120, "tintStrength": 100}
    )
    check(
        "tint preserves luminance",
        float(np.abs(luminance(tinted) - luminance(rgb)).mean()) < 0.02,
    )

    # Filter then blend order: high saturation must not cancel the cast. This is
    # the regression the viewer had; the grid order keeps it visible.
    hot = apply_adjustments(
        rgb, {**neutral, "saturation": 180, "temperature": 80}
    )
    hot_delta = (hot[..., 0] - hot[..., 2]).mean()
    check(
        "temp survives high saturation (grid order)",
        hot_delta > (rgb[..., 0] - rgb[..., 2]).mean(),
        f"delta {hot_delta:.3f}",
    )

    # Crop geometry: the 1:1 frame is 500x500 source px, so 2x zoom shows the
    # centred 250x250 square of that frame.
    box = crop_box(1000, 500, {"ratio": 1.0, "zoom": 2.0, "x": 0.0, "y": 0.0})
    check("zoom 2 halves the frame", box == (375, 125, 625, 375), str(box))
    box = crop_box(1000, 500, {"ratio": 1.0, "zoom": 1.0, "x": 0.0, "y": 0.0})
    check("centred 1:1 crops the middle", box == (250, 0, 750, 500), str(box))
    box = crop_box(1000, 500, {"ratio": 1.0, "zoom": 1.0, "x": -1.0, "y": 0.0})
    check("x -1 aligns the left edge", box == (0, 0, 500, 500), str(box))
    box = crop_box(1000, 500, {"ratio": 1.0, "zoom": 1.0, "x": 1.0, "y": 0.0})
    check("x +1 aligns the right edge", box == (500, 0, 1000, 500), str(box))
    check(
        "16:9 output size honours the long edge",
        output_size(16 / 9, 1600) == (1600, 900),
    )

    print()
    if failures:
        print(f"{len(failures)} check(s) failed: {', '.join(failures)}")
        return 1
    print("All checks passed.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Apply exported gallery edit JSON to local images.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("edits", nargs="?", type=Path, help="exported edits JSON")
    parser.add_argument(
        "photos",
        nargs="?",
        type=Path,
        default=SCRIPT_DIR / "media_input",
        help="folder of originals (default tools/media_input, git-ignored)",
    )
    parser.add_argument(
        "out",
        nargs="?",
        type=Path,
        default=SCRIPT_DIR / "media_output",
        help="output folder (default tools/media_output, git-ignored)",
    )
    parser.add_argument(
        "--map", type=Path, help="JSON object of fileId -> path or basename"
    )
    parser.add_argument(
        "--all-with", metavar="FILE_ID", help="apply one edit to every input file"
    )
    parser.add_argument(
        "--size", type=int, default=1600, help="output long edge (default 1600)"
    )
    parser.add_argument("--quality", type=int, default=92, help="JPEG/WebP quality")
    parser.add_argument(
        "--format",
        dest="extension",
        default=".jpg",
        choices=[".jpg", ".png", ".webp"],
        help="output format (default .jpg, always a new file)",
    )
    parser.add_argument("--dry-run", action="store_true", help="print the plan only")
    parser.add_argument(
        "--selftest", action="store_true", help="run the built-in checks and exit"
    )

    args = parser.parse_args()
    if args.selftest:
        return selftest()
    if not args.edits:
        parser.error("an edits JSON path is required (or use --selftest)")
    if not args.edits.is_file():
        parser.error(f"{args.edits} is not a file")
    if not args.photos.is_dir():
        parser.error(f"{args.photos} is not a folder")
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
