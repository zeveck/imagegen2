# Migrating from zeveck/imagegen to imagegen2

`imagegen2` is based on `github.com/zeveck/imagegen`, but targets OpenAI
GPT Image 2.5 (`gpt-image-2.5-flare` by default) and ships installable skill
folders for Codex, Claude Code, and Gemini.

## Main Changes

| Old `imagegen` | New `imagegen2` |
|----------------|-----------------|
| `.claude/skills/imagegen/generate.cjs` | `cli/generate.cjs` for repo development, or the bundled `generate.cjs` in the installed `imagegen2` skill folder |
| default model `gpt-image-1` | default model `gpt-image-2.5-flare` |
| `.imagegen-history.jsonl` | `.imagegen2-history.jsonl` |
| fixed legacy sizes | flexible GPT Image 2.x sizes |
| `--input-fidelity high|low` | unsupported; GPT Image 2.x uses high fidelity automatically |
| `--background transparent` directly | still works directly, with native alpha from GPT Image 2.5; `--transparent-mode chroma-key` is available for local key-color cleanup |

## Command Examples

Old:

```bash
node .claude/skills/imagegen/generate.cjs \
  --prompt "A pixel art sword" \
  --output "./assets/items/sword.png"
```

New:

```bash
node cli/generate.cjs \
  --prompt "A pixel art sword" \
  --output "./assets/items/sword.png"
```

Old transparent output:

```bash
node .claude/skills/imagegen/generate.cjs \
  --prompt "A game icon" \
  --output "./assets/ui/icon.png" \
  --background transparent
```

New transparent output is the same command, now using GPT Image 2.5 native
alpha:

```bash
node cli/generate.cjs \
  --prompt "A game icon, isolated on a transparent background, no shadows" \
  --output "./assets/ui/icon.png" \
  --background transparent
```

Local chroma-key cleanup, for hard binary alpha:

```bash
node cli/generate.cjs \
  --prompt "A game icon, solid flat #ff00ff chroma-key background, no shadows, no gradients, no background objects" \
  --output "./assets/ui/icon.png" \
  --background transparent \
  --transparent-mode chroma-key \
  --chroma-key '#ff00ff'
```

Chroma-key mode is PNG-only.

Old reference edit:

```bash
node .claude/skills/imagegen/generate.cjs \
  --prompt "Make it blue" \
  --output "./assets/items/sword-blue.png" \
  --image "./assets/items/sword.png" \
  --input-fidelity high
```

New reference edit:

```bash
node cli/generate.cjs \
  --prompt "Make it blue" \
  --output "./assets/items/sword-blue.png" \
  --image "./assets/items/sword.png"
```

## Dry Runs

Use dry-run to validate commands without credentials or API calls:

```bash
node cli/generate.cjs \
  --dry-run \
  --prompt "A pixel art sword" \
  --output "./assets/items/sword.png" \
  --size 2048x1152
```

## Upgrading from imagegen2 0.1.0 (gpt-image-2) to v2026.10.11

imagegen2 v2026.10.11 switches the default model from `gpt-image-2` to
`gpt-image-2.5-flare`. Existing commands keep working:

| imagegen2 0.1.0 | imagegen2 v2026.10.11 |
|---------------|---------------|
| default model `gpt-image-2` | default model `gpt-image-2.5-flare`; set `IMAGEGEN2_MODEL` or pass `--model` to choose another |
| `--background transparent` alone failed (`--transparent-mode reject` default) | uses native alpha (`--transparent-mode auto` default); `reject` is still accepted |
| `--transparent-mode chroma-key` always used `gpt-image-2` | uses `--model` (default Flare); detects a drifted key color in the image corners and fails if 3+ of 4 corners stay opaque |
| `--quality low|medium|high|auto` | adds `xhigh` and `max` on GPT Image 2.5 models |
| fixed 120s request timeout, retried on timeout | `--timeout` per attempt (default 300s, 600s for `xhigh`/`max`), not retried on timeout |
| Claude skill copied from `.claude/skills/imagegen2` | Claude Code plugin (`/plugin install imagegen2 --marketplace zeveck/imagegen2`), or copy `skills/imagegen2` |
| output JSON without token usage or version | output JSON and history include `usage` and `imagegen2Version` |

Projects mid-way through a consistent asset set made with `gpt-image-2` can
stay on it by adding `IMAGEGEN2_MODEL=gpt-image-2` to the project's `.env`
until that set is done, so new assets match the old ones. Any exact snapshot,
such as `gpt-image-2.5-flare-2026-09-08`, works the same way.
