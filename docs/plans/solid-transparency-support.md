# Solid Transparency Support Plan

## Goal

Support transparent PNG sprite output while preserving the `gpt-image-2`
generation path. The chosen implementation is explicit chroma-key cleanup:
request an opaque solid key-color background from `gpt-image-2`, then locally
remove matching pixels from the returned PNG.

Primary command:

```bash
node cli/generate.cjs \
  --prompt "A cute 16-bit RPG kitten sprite, centered, no text" \
  --output ./assets/kitten.png \
  --background transparent \
  --transparent-mode chroma-key \
  --chroma-key '#ff00ff' \
  --quality low
```

## Implemented Scope

- `--background transparent --transparent-mode chroma-key` keeps
  `model: "gpt-image-2"` and normalizes the API request to
  `background: "opaque"` and `output_format: "png"`.
- The CLI appends a prompt suffix asking for a solid flat chroma-key
  background with no shadows, gradients, or background objects.
- Local PNG post-processing supports 8-bit RGB/RGBA PNGs, PNG filters 0-4,
  chunk CRC validation, bounded inflate, RGB-distance tolerance, and RGBA PNG
  re-encoding.
- `--chroma-tolerance <0-442>` defaults to `24`.
- JPEG and WebP are rejected for chroma-key mode for now.
- Dry-run, stdout, and history expose chroma-key/postprocess metadata so
  agents can disclose that transparency is local cleanup rather than native
  model alpha.
- README, CLI reference, migration docs, and Codex/Claude/Gemini bundled skill
  docs were updated.
- Opt-in live smoke now includes a chroma-key generation and alpha assertion.

## Verification

Run:

```bash
node --check cli/generate.cjs
npm test
npm run test:all
```

Current local result:

```text
npm test: 60 passed, 0 failed
IMAGEGEN2_LIVE_TEST=1 npm run test:all: 60 passed, 0 failed; live smoke passed
```

Native `gpt-image-2` transparent-background behavior was probed on 2026-05-03
with `background: "transparent"` and `output_format: "png"`. The API returned
HTTP 400: "Transparent background is not supported for this model."

## Review Focus

- Confirm the zero-dependency PNG parser/encoder is acceptable for this repo.
- Confirm the supported PNG surface is intentionally narrow: 8-bit RGB/RGBA,
  non-interlaced, standard compression/filtering.
- Confirm chroma-key failures are clear and machine-readable.
- Decide whether WebP alpha should remain unsupported or become a later
  dependency-backed feature.
- Optionally run:

```bash
IMAGEGEN2_LIVE_TEST=1 npm run test:all
```
