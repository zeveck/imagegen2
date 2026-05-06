---
name: imagegen2
description: Generate or edit game-oriented raster assets using OpenAI gpt-image-2 through the bundled zero-dependency CLI. Use for sprites, tiles, icons, portraits, UI assets, backgrounds, reference-image edits, and iterative visual variants saved into the project.
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

For transparent PNG sprites, prefer local chroma-key cleanup so generation
stays on `gpt-image-2`:

```bash
--background transparent --transparent-mode chroma-key --chroma-key '#ff00ff'
```

Prompt for a solid flat key background with no shadows, gradients, or
background objects. Disclose that this transparency comes from local chroma-key
cleanup rather than native model alpha.

For true native alpha, use the explicit fallback:

```bash
--background transparent --transparent-mode fallback-model
```

This uses `gpt-image-1.5`; use it only when native alpha is required or
chroma-key cleanup is unsuitable.

Reference images use repeatable `--image <path>` flags. Verify each path before
invoking the CLI.
