# ImageGen2 Benchmark Prompts

The images in `examples/images/` were generated from these prompts with
`gpt-image-2.5-flare` at `--quality medium` (v2026.10.11). The skeleton edits
`skeleton-16bit-gpt-image-1.png` and `skeleton-16bit-gpt-image-2.png` are kept
from earlier releases for comparison. This set is meant to be reusable across
`imagegen`, `imagegen2`, and `nanogen` so outputs can be compared by prompt
category rather than by README image count.

## Suggested Output Names

```text
cat-tophat.png
health-potion.png
tactical-knight.png
isometric-grass-tile.png
settings-icon.png
forest-background.png
skeleton-16bit-gpt-image-2.5-flare.png
transparent-fire-dragon.png
transparent-arcane-orb.png
transparent-snow-owl.png
```

## Sprite

```text
32-bit pixel art. A tuxedo cat wearing a small black top hat, seated, centered,
blank opaque background, crisp readable silhouette, warm fur highlights, no
text, no watermark, no extra objects.
```

## Item Icon

```text
Modern pixel art. A glass health potion bottle with red liquid and cork stopper,
centered standalone game icon, crisp outline, bright highlight, blank opaque
background, no text, no watermark.
```

## Tactical RPG Unit

```text
Isometric tactical RPG sprite. A compact knight with blue cape and steel helmet,
readable on a grid, muted fantasy palette, dark outline, no text, no watermark.
```

## Terrain Tile

```text
Isometric pixel art grass terrain tile, 2:1 game tile feel, lush green grass
with small stones and flowers, seamless-looking edges, consistent top-left
lighting, blank opaque background, no text, no watermark.
```

## UI Icon

```text
Clean flat vector settings gear icon for a mobile game UI, rounded friendly
shape, teal and gold accents, centered, crisp edges, blank opaque background,
no text, no watermark.
```

## Background

```text
Hand-painted fantasy forest background, twilight lighting, layered trees,
soft mist, path leading into the distance, wide landscape composition, no text.
```

Background uses `--size 1536x1024`.

## Reference Edit

```text
16-bit SNES-era pixel art rendition of this skeleton figure. Preserve the
skeleton pose and overall silhouette from the photo, convert it into readable
classic game sprite art with limited palette, crisp pixel edges, subtle shading,
blank opaque background, no text, no watermark.
```

Uses `--image examples/images/skeleton-photo.jpg --size 1024x1536`.

## Native Transparency

All three use `--background transparent` (native alpha).

Fire dragon (`--size 1536x1024`):

```text
Hand-painted fantasy game sprite. A small crimson dragon in side view breathing
a roaring cone of orange fire with curling smoke and drifting embers, full body,
centered, isolated on a transparent background, no shadows, no ground, no text,
no watermark.
```

Arcane orb:

```text
Game VFX sprite. A floating arcane crystal orb crackling with violet and cyan
lightning, soft magical glow, swirling sparkles and wisps of mist, centered,
isolated on a transparent background, no shadows, no ground, no text, no
watermark.
```

Snowy owl:

```text
Painterly fantasy creature sprite. A fluffy snowy owl with fine soft feathers,
wings half spread, three-quarter view, full body, centered, isolated on a
transparent background, no shadows, no ground, no perch, no text, no watermark.
```
