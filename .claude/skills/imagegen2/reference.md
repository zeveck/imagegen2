# ImageGen2 Reference

Supplementary style presets, prompt templates, and practical guidance for the
`imagegen2` skill.

## Model Notes

`imagegen2` defaults to OpenAI GPT Image 2.5 Flare, pinned to the snapshot
`gpt-image-2.5-flare-2026-09-08` so output style does not shift when OpenAI
updates the alias.

| Model | Use it for | Notes |
|---|---|---|
| `gpt-image-2.5-flare` (default) | Almost everything | Fast (~10-15s at medium), native transparency |
| `gpt-image-2.5-sunburst` | Detailed final art | Same token price as Flare, ~1.6x slower |
| `gpt-image-2` | Matching assets made before the upgrade | No native transparency; no `xhigh`/`max`; ~3x slower and ~4x the cost of Flare at medium |
| `gpt-image-1.5` | Legacy native-alpha fallback | Used by `--transparent-mode fallback-model` |

Strengths:

- high-quality image generation and editing
- flexible image sizes up to 4K-class outputs
- high-fidelity image inputs by default
- native transparent backgrounds with soft, fringe-free edges on fire, smoke,
  fur, and glow
- good character consistency across reference-image edits

Limitations:

- exact layout and composition are not deterministic
- recurring character and brand consistency can still drift across many edits
- precise in-image text may still need retries
- `xhigh`/`max` quality is slow; Sunburst at `max` can take several minutes
  (the CLI allows 600s for those levels; raise `--timeout` if needed)

## Style Presets

Adapt these as starting points. Do not paste a preset blindly if the user gave
specific art direction.

### Pixel Art

> Pixel art style, clean pixels, limited color palette, readable silhouette,
> crisp edges, no text, no watermark.

Variants:

- **8-bit:** NES-era pixel art, 4-color sprite feel, simple shading.
- **16-bit:** SNES-era pixel art, richer palette, subtle shading.
- **32-bit:** late 1990s console pixel art, detailed sprite shading, readable
  at small sizes.
- **Modern pixel:** high-detail pixel-art look, vibrant palette, polished game
  asset.

### Flat Vector

> Clean flat vector illustration, solid colors, sharp edges, minimal shapes,
> UI-ready icon, no texture, no text.

### Hand-Painted

> Digital hand-painted game art, visible brushwork, rich color blending,
> polished concept-art lighting.

### Isometric

> Isometric perspective, 2:1 tile feel, consistent light from top-left, clean
> edge readability, game-ready terrain/object.

### Low-Poly 3D

> Low-poly 3D render, flat-shaded polygons, simplified geometry, studio
> lighting, clean silhouette.

### Watercolor

> Watercolor illustration, soft edges, subtle paper texture, gentle color bleed,
> storybook mood.

## Game Presets

### Platformer

> 2D side-view perspective, clear silhouette, high contrast, readable at small
> size, bright platform-game palette.

### Top-Down RPG

> Top-down RPG perspective, detailed but clean, tile-scale readability, fantasy
> adventure palette.

### Tactical RPG

> Isometric tactical RPG asset, muted fantasy palette, compact proportions,
> readable on a grid, dark outline, no text.

### Card Game

> Card illustration, portrait framing, strong central subject, readable focal
> point, polished fantasy painting.

### Mobile/Casual

> Bright casual game art, rounded shapes, friendly color palette, simple forms,
> high contrast, icon-friendly.

## Prompt Templates

### Sprite or Character

```text
<style>. <character description> in <pose>, facing <direction>.
Clear silhouette, readable at small size, <palette>. For a <genre> game.
No text, no watermark, no extra objects.
```

### Item or Icon

```text
<style>. <item name>, centered, standalone, crisp edges, readable as a game
icon. <key material/color details>. No text, no watermark, no extra objects.
```

### Tile or Terrain

```text
<style>. <terrain type> tile, top-down view, consistent lighting, clean edges,
texture detail suitable for a game map.
```

### Background

```text
<style>. <scene description>, <time of day>, <mood>, <perspective>, layered
depth, no text, no watermark.
```

## Size Guidance

- `1024x1024`: sprites, items, icons, square tiles
- `1536x1024`: landscape scenes, wide backgrounds
- `1024x1536`: portraits, tall characters
- `2048x2048`: higher-detail square final assets
- `3840x2160`: high-resolution landscape finals
- `2160x3840`: high-resolution portrait finals

Use larger sizes intentionally. They cost more and may take longer.

## Quality Guidance

- `low`: exploration, batches, first drafts
- `medium`: good single assets and selected variants
- `high`: final/keeper images, hero art, detailed backgrounds
- `xhigh`, `max`: GPT Image 2.5 only. Extra detail for hero art; Flare
  `max` costs about as much as `gpt-image-2` at `high` and is much slower
  than Flare `high`
- `auto`: when the prompt itself should drive the tradeoff

For exact current costs, use the OpenAI pricing page or image generation
calculator. Avoid hardcoding stale price promises into user-facing output.

## Reference Image Tips

- Use one strong reference image when preserving style matters.
- Use multiple references for a set of related icons or tiles.
- Put the most important subject/style reference first.
- GPT Image 2.x models automatically use high-fidelity image inputs; do not
  use `--input-fidelity` (the API rejects it).
- For iterative refinement, feed the prior output back with `--image`.

## Transparency Tips

- `--background transparent` uses the model's own alpha channel on GPT Image
  2.5 (`--transparent-mode auto`, the default). This is the best choice for
  most sprites, icons, and effects, and the only good choice for fire, smoke,
  glow, fur, and other soft edges, which chroma-key cannot cut cleanly.
- Ask for the subject "isolated on a transparent background, no shadows, no
  ground".
- Native-alpha PNGs are cleaned up locally by default: alpha >= 240 snaps to
  255 (the model leaves solid subjects at ~252), alpha <= 2 snaps to 0, and
  fully transparent pixels take nearby edge colors so resizing doesn't pull in
  the hidden backdrop. Pass `--no-alpha-cleanup` to keep raw model alpha.
  WebP output is not cleaned up.
- `--transparent-mode chroma-key` is still available for pipelines that want
  hard binary alpha or already depend on it. It requests an opaque solid
  key-color background from `--model`, removes matching pixels locally,
  alpha-bleeds hidden RGB, and suppresses strongly key-colored edge pixels. If
  the image border is dominated by a color within 96 RGB units of the requested
  key (models often paint `#ff00ff` as roughly `#ee04e4`), cleanup keys on that
  detected color and reports it as `postprocess.detectedKey`. Cleanup fails if
  most of the image border stays opaque. Chroma-key mode targets PNG output.
- For chroma-key, choose a key color absent from the subject, such as `#ff00ff`
  or `#00ff00`, and ask for a "solid flat chroma-key background", with "no
  shadows", "no gradients", and "no background objects". Keep
  `--chroma-tolerance` conservative. The default is `24`; valid values are
  `0` through `442`.
- `gpt-image-2` has no native transparency; with that model use chroma-key.
- `--transparent-mode fallback-model` (native alpha via `gpt-image-1.5`) is
  kept for compatibility; GPT Image 2.5 native alpha is better.
- Avoid JPEG for transparency.
