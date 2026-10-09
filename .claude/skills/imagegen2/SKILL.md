---
name: imagegen2
description: Generate or edit game-oriented raster assets using OpenAI GPT Image 2.5 (gpt-image-2.5-flare by default) through a bundled zero-dependency CLI. Ideal for sprites, tiles, UI elements, icons, portraits, backgrounds, concept art, and reference-image edits. Supports iteration and project asset organization.
disable-model-invocation: false
allowed-tools: "Bash(node .claude/skills/imagegen2/generate.cjs *), Bash(node */imagegen2/generate.cjs *), Bash(node cli/generate.cjs *), Bash(node generate.cjs *)"
argument-hint: <description> [--image path] [size: auto|WxH] [quality: low|medium|high|xhigh|max] [transparent] [format: png|webp|jpg]
---

# ImageGen2 for Claude Code

Use this skill when the user asks to generate, edit, or iterate on project-local
bitmap assets with OpenAI GPT Image 2.5.

The CLI is bundled next to this `SKILL.md`. Resolve it relative to the skill
directory when installed. In this repository, the canonical development copy is
also available at `cli/generate.cjs`.

```bash
node /path/to/imagegen2-skill/generate.cjs --prompt "..." --output "..." [options]
```

## Workflow

1. Resolve the user's request into a concrete prompt, output path, size,
   quality, and optional reference images.
2. Check whether the output file already exists. Use a versioned filename
   unless the user explicitly asked to replace it.
3. Use `--dry-run` for unfamiliar option combinations or reference-image edits.
4. Run the CLI and parse its JSON stdout.
5. Report the saved path, model, size, quality, and any transparency mode.

## Important Differences from the old imagegen skill

- Default model is `gpt-image-2.5-flare-2026-09-08` (fast). Use
  `--model gpt-image-2.5-sunburst` for slower, more detailed final art, and
  `--model gpt-image-2` only to match assets made before the 2.5 upgrade.
- Quality levels `xhigh` and `max` are available on GPT Image 2.5 models.
- History is `.imagegen2-history.jsonl`. Output JSON includes token `usage`.
- `--input-fidelity` is not supported; GPT Image 2.x models use high-fidelity
  image inputs automatically.
- Transparency:
  - `--background transparent` uses the model's native alpha by default. This
    is the right choice for sprites, icons, and soft edges like fire, smoke,
    glow, and fur. Native-alpha PNGs get a light local alpha cleanup
    (`postprocess.type: "alpha-cleanup"`); `--no-alpha-cleanup` skips it.
  - `--transparent-mode chroma-key` still requests an opaque solid key-color
    background from `--model` and removes it locally (hard binary alpha). Use
    it when a pipeline depends on it or with `gpt-image-2`, which has no
    native alpha.
  - `fallback-model` (native alpha via `gpt-image-1.5`) is legacy.
  Disclose which path was used.

## Examples

```bash
node /path/to/imagegen2-skill/generate.cjs \
  --prompt "32-bit pixel art cat wearing a top hat, centered, blank background, no text" \
  --output "./assets/sprites/cat-tophat.png" \
  --quality low \
  --size 1024x1024
```

```bash
node /path/to/imagegen2-skill/generate.cjs \
  --prompt "Create a potion icon matching this item style" \
  --output "./assets/items/potion.png" \
  --image "./assets/items/sword.png" \
  --quality low
```

```bash
node /path/to/imagegen2-skill/generate.cjs \
  --prompt "A cute 16-bit RPG kitten sprite, centered, no text, isolated on a transparent background, no shadows, no ground" \
  --output "./assets/sprites/kitten.png" \
  --background transparent \
  --quality low
```

```bash
node /path/to/imagegen2-skill/generate.cjs \
  --prompt "A clean pixel art health potion icon, standalone, no text, solid flat #ff00ff chroma-key background, no shadows, no gradients, no background objects" \
  --output "./assets/items/health-potion.png" \
  --background transparent \
  --transparent-mode chroma-key \
  --chroma-key '#ff00ff' \
  --quality low
```

Read `reference.md` for style presets and prompt templates when needed.
