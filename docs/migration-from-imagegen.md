# Migrating from zeveck/imagegen to imagegen2

`imagegen2` is based on `github.com/zeveck/imagegen`, but targets OpenAI
`gpt-image-2` and ships installable skill folders for Codex, Claude Code, and
Gemini.

## Main Changes

| Old `imagegen` | New `imagegen2` |
|----------------|-----------------|
| `.claude/skills/imagegen/generate.cjs` | `cli/generate.cjs` for repo development, or the bundled `generate.cjs` in the installed `imagegen2` skill folder |
| default model `gpt-image-1` | default model `gpt-image-2` |
| `.imagegen-history.jsonl` | `.imagegen2-history.jsonl` |
| fixed legacy sizes | flexible `gpt-image-2` sizes |
| `--input-fidelity high|low` | unsupported; `gpt-image-2` uses high fidelity automatically |
| `--background transparent` directly | requires `--transparent-mode fallback-model` |

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

New transparent output:

```bash
node cli/generate.cjs \
  --prompt "A game icon" \
  --output "./assets/ui/icon.png" \
  --background transparent \
  --transparent-mode fallback-model
```

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
