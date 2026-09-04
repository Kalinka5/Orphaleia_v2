"""Remove a uniform blue screen while keeping a soft alpha edge.

Usage: python remove-blue-background.py source.png transparent.png
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

source, destination = map(Path, sys.argv[1:3])
image = Image.open(source).convert('RGB')
pixels = np.asarray(image, dtype=np.float32) / 255
# Estimate the actual generated key color from the four empty corners.
h, w = pixels.shape[:2]
margin = max(4, min(h, w) // 20)
corners = np.concatenate([pixels[:margin, :margin].reshape(-1, 3),
                          pixels[:margin, -margin:].reshape(-1, 3),
                          pixels[-margin:, :margin].reshape(-1, 3),
                          pixels[-margin:, -margin:].reshape(-1, 3)])
key = np.median(corners, axis=0)
key_dominance = key[2] - max(key[0], key[1])
if key_dominance < .25:
    raise ValueError('Source does not have a sufficiently blue uniform background.')
blue_dominance = pixels[:, :, 2] - np.maximum(pixels[:, :, 0], pixels[:, :, 1])
raw_alpha = 1 - blue_dominance / key_dominance
alpha = np.clip((raw_alpha - .035) / .915, 0, 1)
# Unmix the backdrop from edge pixels instead of retaining a blue fringe.
rgb = (pixels - (1 - alpha[:, :, None]) * key) / np.maximum(alpha[:, :, None], 1e-6)
rgba = np.dstack((np.clip(rgb, 0, 1), alpha))
rgba = np.rint(rgba * 255).astype(np.uint8)
rgba[rgba[:, :, 3] == 0, :3] = 0
result = Image.fromarray(rgba, 'RGBA')
result.save(destination, optimize=True)
preview = Image.new('RGBA', result.size, '#fdfbf7')
preview.alpha_composite(result)
preview.convert('RGB').resize((1280, round(1280*h/w))).save(destination.with_name(destination.stem+'-preview.jpg'), quality=94)
print({'key_rgb': np.rint(key*255).astype(int).tolist(), 'size': result.size,
       'transparent_fraction': round(float(np.mean(alpha == 0)), 3)})
