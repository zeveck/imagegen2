# Changelog

imagegen2 uses date-based versions: `vYYYY.M.D` (for example `v2026.10.10`),
which are also valid semver. For a second release on the same day, use the next
day's date rather than a `-1` suffix, because semver sorts `2026.10.10-1`
before `2026.10.10`.

The running version is printed by `--version`, shown by `--help`, and reported
as `imagegen2Version` in every JSON result and history entry.

## v2026.10.11

GPT Image 2.5 upgrade. Existing commands keep working; defaults and a few
failure cases changed. See
[Upgrading from imagegen2 0.1.0](docs/migration-from-imagegen.md#upgrading-from-imagegen2-010-gpt-image-2-to-v20261011).

### Claude Code plugin

- imagegen2 is now a Claude Code plugin with its own marketplace:
  `/plugin install imagegen2 --marketplace zeveck/imagegen2`. Installed copies
  update with `claude plugin update imagegen2@imagegen2`. The plugin is
  rooted at `skills/`, so an install copies only the skill, not the repository.
- The Claude skill moved from `.claude/skills/imagegen2/` to
  `skills/imagegen2/`, and its `SKILL.md` runs the bundled CLI through
  `${CLAUDE_SKILL_DIR}`, so it works from a plugin install or a copied folder.
  Links to the old `.claude/skills/imagegen2` folder no longer resolve.

### New default model

- The default model is now `gpt-image-2.5-flare` (was `gpt-image-2`). In our
  comparison at `medium` quality it was about 3x faster and 4x cheaper per
  image, with native transparency and equal or better character consistency
  across reference-image edits.
- The default tracks OpenAI's latest Flare snapshot. Pin a project with
  `IMAGEGEN2_MODEL` in `.env` (for example
  `IMAGEGEN2_MODEL=gpt-image-2.5-flare-2026-09-08`, or `gpt-image-2` to finish
  an asset set made with the old model). `--model` overrides it per command;
  `latest` in either place means the default.
- `gpt-image-2.5-sunburst` is available for slower, more detailed final art.
- New `xhigh` and `max` quality levels on GPT Image 2.5 models.

### Transparency

- `--background transparent` now just works: the new default
  `--transparent-mode auto` uses the model's native alpha, which handles fire,
  smoke, glow, and fur far better than chroma-key. `native-alpha` is the
  explicit mode name.
- Native-alpha PNGs get a light local cleanup (near-opaque alpha snapped to
  255, near-clear to 0, hidden RGB alpha-bled). `--no-alpha-cleanup` skips it.
- `--transparent-mode chroma-key` keeps its meaning but now uses `--model`
  instead of always `gpt-image-2`.
- Chroma-key cleanup detects a drifted key color in the image corners (models
  often paint `#ff00ff` as roughly `#ee04e4`), reported as
  `postprocess.detectedKey`. This fixed 7 of 12 `gpt-image-2` animation frames
  that previously came back almost fully opaque.

### Behavior changes to know about

- Chroma-key now **fails** instead of writing the image when 3 or more of the
  4 image corners stay opaque, which means the background never keyed out.
  Previously this case silently "succeeded". A subject or ground strip touching
  one edge doesn't trigger it.
- Each API attempt times out after 300s (600s for `xhigh`/`max`), configurable
  with `--timeout` (up to 86400). Timeouts are no longer retried, because
  OpenAI may still finish and bill a timed-out request; rate-limit and server
  errors are still retried up to 3 times.
- If native-alpha cleanup can't process the returned PNG, the image is still
  saved as returned, with `postprocess.status: "failed"` and a top-level
  `warning`.
- Model names from `--model` and `IMAGEGEN2_MODEL` are trimmed and lowercased.
- `.env` loading: the CLI now loads every `.env` in the current directory and
  its parents, then in its own folder and its parents, nearest first, and a
  file never overrides a variable that is already set. A project's `.env` is
  found from any subfolder even when the CLI runs from a plugin install, and
  an unrelated parent `.env` (such as `~/.env`) can't hide a key set in a
  nearer one. Previously only the first `.env` found was loaded, checking the
  current directory itself and then the CLI's folder and its parents.
- With `--model gpt-image-2`, `--background transparent` still needs
  `--transparent-mode chroma-key`; the error names the options.

### Also

- JSON output and history include token `usage` and `imagegen2Version`, and
  `--version` prints the version.
- The README sample gallery is regenerated with `gpt-image-2.5-flare`, with
  native-alpha showcase images and a Flare column in the reference-edit
  comparison.
- Dev container refreshed from github.com/zeveck/devcontainers (`gh`,
  `glab`, `auth`, `dc`, Node 24). Agent history, memory, settings, and plugins
  survive rebuilds; sign-ins don't, and `dc volumes` manages the saved data.
- Docs, all three agent skill folders, tests, and the live smoke test are
  updated.

## 0.1.0

Initial `gpt-image-2` release with chroma-key and `gpt-image-1.5` fallback
transparency.
