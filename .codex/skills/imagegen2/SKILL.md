---
name: imagegen2
description: Generate or edit game-oriented raster assets using OpenAI gpt-image-2 through a bundled zero-dependency CLI. Use for sprites, tiles, icons, portraits, UI assets, backgrounds, reference-image edits, and iterative visual variants when the output should be a bitmap asset saved into the project.
---

# ImageGen2

Use this skill when the user wants project-local bitmap assets generated or
edited through the bundled CLI rather than Codex's built-in preview image tool.
Typical outputs are sprites, item icons, tiles, UI elements, portraits,
backgrounds, concept art, and reference-image edits.

The CLI is bundled next to this `SKILL.md`. Resolve it relative to the skill
directory when installed. In this repository, the canonical development copy is
also available at `cli/generate.cjs`.

```bash
node /path/to/imagegen2-skill/generate.cjs --prompt "..." --output "..." [options]
```

It writes machine-readable JSON to stdout and logs successful generations to
`.imagegen2-history.jsonl`.

## Workflow

1. Inspect the project for existing asset conventions before choosing a path.
   Prefer `rg --files assets generated-images . 2>/dev/null` over guessing.
2. Choose a non-destructive output path. Do not overwrite an existing image
   unless the user explicitly requested replacement; prefer `-v2`, `-alt1`,
   or a more specific filename.
3. Compose a concise production prompt. Preserve exact user text and explicit
   constraints. For game assets, specify style, subject, view, silhouette,
   background, palette, and intended use.
4. Use `--dry-run` first when changing CLI options, using reference images, or
   preparing a batch.
5. Run the CLI. For 3+ images, use `--quality low` unless the user asked for
   final quality.
6. Report the saved path, model, size, quality, and any transparency mode used.

## Common Commands

Pure generation:

```bash
node /path/to/imagegen2-skill/generate.cjs \
  --prompt "A 32-bit pixel art cat wearing a top hat, centered, blank background, no text" \
  --output "./assets/sprites/cat-tophat.png" \
  --quality low \
  --size 1024x1024
```

Reference-image edit:

```bash
node /path/to/imagegen2-skill/generate.cjs \
  --prompt "Create a new potion icon matching the style of the reference image" \
  --output "./assets/items/potion.png" \
  --image "./assets/items/sword.png" \
  --quality low
```

GPT Image 2 chroma-key transparency:

```bash
node /path/to/imagegen2-skill/generate.cjs \
  --prompt "A clean pixel art health potion icon, standalone, no text, solid flat #ff00ff chroma-key background, no shadows, no gradients, no background objects" \
  --output "./assets/items/health-potion.png" \
  --background transparent \
  --transparent-mode chroma-key \
  --chroma-key '#ff00ff' \
  --quality low
```

Native transparent fallback:

```bash
node /path/to/imagegen2-skill/generate.cjs \
  --prompt "A clean pixel art health potion icon, standalone, no shadow, no text" \
  --output "./assets/items/health-potion.png" \
  --background transparent \
  --transparent-mode fallback-model \
  --quality low
```

## CLI Parameters

| Parameter | Values | Default | Notes |
|-----------|--------|---------|-------|
| `--prompt` | string | required | Exact prompt sent to the image model |
| `--output` | `.png`, `.jpg`, `.jpeg`, `.webp` path | required | Parent directory is created automatically |
| `--model` | model id | `gpt-image-2` | Do not override unless explicitly needed |
| `--size` | `auto` or valid `WxH` | `1024x1024` | Edges <=3840, multiples of 16, ratio <=3:1 |
| `--quality` | `low`, `medium`, `high`, `auto` | `low` | Use low for drafts, high for keepers |
| `--background` | `auto`, `opaque`, `transparent` | `auto` | Transparent requires an explicit `--transparent-mode` |
| `--transparent-mode` | `reject`, `chroma-key`, `fallback-model` | `reject` | `chroma-key` keeps `gpt-image-2` and performs local PNG cleanup; `fallback-model` uses native alpha |
| `--chroma-key` | `#rrggbb` | `#00ff00` | Key color for chroma-key mode |
| `--chroma-tolerance` | `0`-`442` | `24` | RGB distance tolerance for chroma-key cleanup |
| `--output-compression` | `0`-`100` | none | JPEG/WebP only |
| `--image` | image path, repeatable | none | Up to 16 PNG/JPG/WEBP references |
| `--mask` | PNG path | none | Requires `--image`; API enforces dimensions/alpha |
| `--dry-run` | flag | false | Validates and prints request summary without API key |
| `--client-request-id` | ASCII string | UUID | Useful for troubleshooting |

## Reference Images

Resolve fuzzy image references before invoking the CLI.

- If the user gives a path, verify it exists.
- If the user gives a filename fragment, use `rg --files | rg -i '<fragment>'`.
- If the user references prior output, search `.imagegen2-history.jsonl` with
  targeted `rg`, for example `rg -i 'potion' .imagegen2-history.jsonl`.
- If multiple plausible matches exist, ask which image to use.
- Never pass an unverified path to `--image`.

`gpt-image-2` automatically processes image inputs at high fidelity. Do not use
`--input-fidelity`; the CLI rejects it for compatibility clarity.

## Transparent Backgrounds

The CLI treats transparent output as an explicit mode choice:

- `reject`: fail fast when transparent output is requested. This is the
  default.
- `chroma-key`: keep `gpt-image-2`, request an opaque solid key-color
  background, and locally remove matching PNG pixels.
- `fallback-model`: use `gpt-image-1.5` for native alpha.

Use `--transparent-mode chroma-key` for transparent PNG game sprites by
default, so generation stays on `gpt-image-2`. Choose key colors absent from
the subject, commonly `#ff00ff` or `#00ff00`. Add prompt constraints such as
"solid flat chroma-key background", "no shadows", "no gradients", and "no
background objects". Tell the user that transparency is local chroma-key
cleanup rather than native model alpha.

Use `--transparent-mode fallback-model` only when the user wants true native
alpha output or chroma-key cleanup is unsuitable. This explicitly uses
`gpt-image-1.5` for that request and records the fallback in CLI output and
history. Tell the user when this happens.

Do not use JPEG for transparent output. Chroma-key mode requires PNG output;
fallback native alpha supports PNG or WebP.

## Prompt Guidance

Load `reference.md` only when you need style presets or detailed prompt
templates. Keep generated prompts focused:

- Style: pixel art, 16-bit, flat vector, hand-painted, isometric, etc.
- Subject: exact object/character and identifying details.
- Composition: centered, full body, top-down, side view, icon crop.
- Game context: RPG item, tactical sprite, platformer tile, HUD button.
- Constraints: no text, no watermark, no extra objects, blank background.

## Output Hygiene

- Prefer `assets/sprites`, `assets/items`, `assets/tiles`, `assets/ui`,
  `assets/backgrounds`, `assets/effects`, `assets/portraits`, or
  `generated-images` depending on the project.
- Use versioned filenames for iterations.
- Preserve previous versions unless the user asks to delete them.
- For batches, report partial success clearly if any generation fails.
