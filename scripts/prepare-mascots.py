"""Extract the user-approved poses without generating or repainting characters.

Optional artwork tool, not a build dependency. Requires Pillow, NumPy and SciPy.
Coordinates refer to artwork/mascots-source.jpeg (1536 x 1024).
"""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage


ROOT = Path(__file__).resolve().parents[1]
CANVAS = (512, 384)
BASELINE = 358
POSES = {
    "anya-wave": (12, 25, 218, 332),
    "snowy-idle": (20, 350, 203, 564),
    "anya-correct": (425, 47, 564, 327),
    "snowy-paw": (387, 372, 550, 567),
    "anya-thinking": (722, 34, 902, 330),
    "snowy-thinking": (749, 346, 891, 568),
    "snowy-rest": (374, 858, 551, 998),
    "anya-hint": (910, 11, 1120, 330),
    "snowy-book": (917, 364, 1116, 568),
    "anya-celebrate": (1305, 15, 1532, 332),
    "snowy-celebrate": (1327, 343, 1529, 568),
    "anya-books": (220, 35, 403, 332),
    "snowy-sleep": (557, 826, 747, 998),
}
STATES = {
    "idle": ("anya-wave", "snowy-idle"),
    "thinking": ("anya-thinking", "snowy-thinking"),
    "correct": ("anya-correct", "snowy-paw"),
    "almost": ("anya-thinking", "snowy-rest"),
    "hint": ("anya-hint", "snowy-book"),
    "levelComplete": ("anya-celebrate", "snowy-celebrate"),
    "noLives": ("anya-books", "snowy-sleep"),
}


def cutout(sheet, box):
    rgb = np.array(sheet.crop(box).convert("RGB"))
    low = rgb.min(axis=2).astype(float)
    spread = rgb.max(axis=2).astype(float) - low
    # Only near-white areas connected to the crop boundary are background.
    # White clothing, shoes, eyes, and fur enclosed by their outlines stay opaque.
    candidates = (low >= 246) & (spread < 20)
    # Close one-pixel breaks in the JPEG outlines before finding the outside.
    # A lower white threshold would also erase the pale sleeve and sneaker edges.
    candidates = ~ndimage.binary_closing(~candidates, structure=np.ones((3, 3)), border_value=0)
    labels, _ = ndimage.label(candidates)
    edge_labels = np.unique(np.concatenate((labels[0], labels[-1], labels[:, 0], labels[:, -1])))
    outside = np.isin(labels, edge_labels[edge_labels != 0])
    foreground = ~outside

    # Remove isolated JPEG flecks, but keep small illustrated question-mark dots.
    components, _ = ndimage.label(foreground)
    for number, slices in enumerate(ndimage.find_objects(components), start=1):
        if slices is None:
            continue
        region = components[slices] == number
        height = slices[0].stop - slices[0].start
        if region.sum() < 9 or height < 3:
            foreground[slices][region] = False

    alpha = foreground.astype(float)
    distance = ndimage.distance_transform_edt(foreground)
    core = (distance > 4) | ((distance > 1) & (low < 180))
    edge = foreground & ~core
    # Estimate the foreground colour from the nearest opaque interior pixel.
    # This removes the JPEG's white fringe without making white fabric transparent.
    _, nearest = ndimage.distance_transform_edt(~core, return_indices=True)
    observed_delta = rgb.astype(float) - 255
    interior_delta = rgb[nearest[0], nearest[1]].astype(float) - 255
    denominator = np.square(interior_delta).sum(axis=2)
    estimated = np.divide((observed_delta * interior_delta).sum(axis=2), denominator,
                          out=np.ones_like(denominator), where=denominator > 30)
    alpha[edge] = np.clip(estimated[edge], 0, 1)
    alpha[alpha < 0.04] = 0
    # Remove the white matte only at antialiased silhouette edges.
    colors = rgb.astype(float)
    partial = (alpha > 0) & (alpha < 1)
    colors[partial] = (colors[partial] - 255 * (1 - alpha[partial, None])) / alpha[partial, None]
    colors[alpha == 0] = 0
    rgba = np.dstack((np.clip(colors, 0, 255).round().astype(np.uint8), (alpha * 255).round().astype(np.uint8)))
    image = Image.fromarray(rgba)
    bounds = image.getbbox()
    if not bounds:
        raise ValueError(f"Empty pose: {box}")
    if bounds[0] == 0 or bounds[1] == 0 or bounds[2] == image.width or bounds[3] == image.height:
        raise ValueError(f"Pose touches crop edge; inspect coordinates: {box}, {bounds}")
    return image.crop(bounds)


def compose(poses):
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    # Keep the original character proportions and a common baseline.
    if len(poses) == 1:
        pose = poses[0]
        height = 306
        poses = [pose.resize((round(pose.width * height / pose.height), height), Image.Resampling.LANCZOS)]
    gap = 10
    width = sum(pose.width for pose in poses) + gap * (len(poses) - 1)
    left = (CANVAS[0] - width) // 2
    for pose in poses:
        canvas.alpha_composite(pose, (left, BASELINE - pose.height))
        left += pose.width + gap
    if canvas.getbbox()[3] > BASELINE:
        raise ValueError("Artwork exceeds the shared baseline")
    return canvas


def preview(images, directory):
    directory.mkdir(parents=True, exist_ok=True)
    colors = ((236, 234, 255), (255, 255, 255), (40, 46, 70))
    board = Image.new("RGB", (CANVAS[0] * len(images), (CANVAS[1] + 36) * len(colors)), "white")
    draw = ImageDraw.Draw(board)
    for row, color in enumerate(colors):
        for col, (name, image) in enumerate(images.items()):
            x, y = col * CANVAS[0], row * (CANVAS[1] + 36)
            tile = Image.new("RGBA", CANVAS, (*color, 255))
            tile.alpha_composite(image)
            board.paste(tile.convert("RGB"), (x, y + 36))
            draw.text((x + 18, y + 11), name, fill="black")
    board.save(directory / "mascots-review.jpg", quality=94)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "artwork/mascots-source.jpeg")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "public/assets/mascots")
    parser.add_argument("--preview-dir", type=Path)
    args = parser.parse_args()
    sheet = Image.open(args.source)
    if sheet.size != (1536, 1024):
        raise ValueError(f"Unexpected source size: {sheet.size}")
    extracted = {name: cutout(sheet, box) for name, box in POSES.items()}
    images = {name: compose([extracted[pose] for pose in poses]) for name, poses in STATES.items()}
    args.output_dir.mkdir(parents=True, exist_ok=True)
    manifest = {"sourceSha256": hashlib.sha256(args.source.read_bytes()).hexdigest(), "canvas": CANVAS, "poses": POSES, "states": {}}
    for name, image in images.items():
        filename = f"{name}.png"
        image.save(args.output_dir / filename, optimize=True)
        manifest["states"][name] = {"file": filename, "poses": STATES[name], "bounds": image.getbbox(), "sha256": hashlib.sha256((args.output_dir / filename).read_bytes()).hexdigest()}
        print(f"{filename}: RGBA {image.width}x{image.height}, bounds={image.getbbox()}")
    (args.output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    if args.preview_dir:
        preview(images, args.preview_dir)


if __name__ == "__main__":
    main()
