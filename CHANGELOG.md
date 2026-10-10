# Changelog

imagegen2 uses date-based versions: `vYYYY.M.D` (for example `v2026.10.10`),
which are also valid semver. For a second release on the same day, use the next
day's date rather than a `-1` suffix, because semver sorts `2026.10.10-1`
before `2026.10.10`.

The running version is shown by `--help` and reported as `imagegen2Version` in
every JSON result and history entry.

## v2026.10.10

GPT Image 2.5 upgrade. Existing commands keep working; defaults and a few
failure cases changed. See
[Upgrading from imagegen2 0.1.0](docs/migration-from-imagegen.md#upgrading-from-imagegen2-010-gpt-image-2-to-v20261010).

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
- Chroma-key cleanup detects a drifted key color on the image border (models
  often paint `#ff00ff` as roughly `#ee04e4`), reported as
  `postprocess.detectedKey`. This fixed 7 of 12 `gpt-image-2` animation frames
  that previously came back almost fully opaque.

### Behavior changes to know about

- Chroma-key now **fails** instead of writing the image when most of the image
  border stays opaque. Previously this case silently "succeeded".
- Requests time out after 300s (600s for `xhigh`/`max`), configurable with
  `--timeout`. Timeouts are no longer retried, because OpenAI may still finish
  and bill a timed-out request.
- With `--model gpt-image-2`, `--background transparent` still needs
  `--transparent-mode chroma-key`; the error names the options.

### Also

- JSON output and history include token `usage` and `imagegen2Version`.
- Docs, all three agent skill folders, tests, and the live smoke test are
  updated.

## 0.1.0

Initial `gpt-image-2` release with chroma-key and `gpt-image-1.5` fallback
transparency.
