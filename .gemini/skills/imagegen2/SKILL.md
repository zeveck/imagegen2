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

Transparent backgrounds require:

```bash
--background transparent --transparent-mode fallback-model
```

This explicitly uses `gpt-image-1.5` because `gpt-image-2` does not currently
support native transparent backgrounds.

Reference images use repeatable `--image <path>` flags. Verify each path before
invoking the CLI.
