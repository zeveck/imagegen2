---
name: imagegen2
description: Generate or edit game-oriented raster assets using OpenAI GPT Image 2.5 (gpt-image-2.5-flare by default) through the bundled zero-dependency CLI. Use for sprites, tiles, icons, portraits, UI assets, backgrounds, reference-image edits, and iterative visual variants saved into the project.
---

# ImageGen2 for Gemini

The CLI is bundled next to this `SKILL.md`. Resolve it relative to the skill
directory when installed. In this repository, the canonical development copy is
also available at `cli/generate.cjs`.

```bash
node /path/to/imagegen2-skill/generate.cjs --prompt "..." --output "..." [options]
```

Recommended workflow:

1. Inspect the project for asset naming and directory conventions.
2. Choose a non-destructive output path.
3. Compose a prompt with style, subject, composition, palette, and constraints.
4. Run `--dry-run` for validation when using reference images or unusual sizes.
5. Run the CLI, parse JSON stdout, and report the saved path.

The default model is `gpt-image-2.5-flare-2026-09-08`. Use
`--model gpt-image-2.5-sunburst` for slower, more detailed finals. Quality
levels `xhigh` and `max` are available on GPT Image 2.5 models.

For transparent sprites, icons, and effects, request native alpha:

```bash
--background transparent
```

Prompt for the subject "isolated on a transparent background, no shadows, no
ground". This is clearly better than chroma-key for fire, smoke, glow, and fur.
Native-alpha PNGs get a light local alpha cleanup; `--no-alpha-cleanup` skips
it.

For hard binary alpha, or with `gpt-image-2` (no native alpha), use local
chroma-key cleanup:

```bash
--background transparent --transparent-mode chroma-key --chroma-key '#ff00ff'
```

Prompt for a solid flat key background with no shadows, gradients, or
background objects. Local cleanup removes matching key pixels (detecting a
drifted key color on the image border), alpha-bleeds hidden RGB, and can
suppress strongly key-colored visible edge pixels. Disclose that this
transparency comes from local chroma-key cleanup rather than native model
alpha.

`--transparent-mode fallback-model` (native alpha via `gpt-image-1.5`) is
kept for compatibility only.

Reference images use repeatable `--image <path>` flags. Verify each path before
invoking the CLI.
