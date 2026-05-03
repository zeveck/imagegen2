#!/usr/bin/env node

// generate.cjs - Thin OpenAI gpt-image-2 API wrapper for imagegen2.
// Zero external dependencies. Requires Node.js 20+ for built-in fetch().
//
// NOTE: gpt-image-2 always returns b64_json. Do NOT send `response_format`.
// Use `output_format` for the image encoding (png/jpeg/webp).
//
// Usage:
//   node generate.cjs --prompt "..." --output "./path/to/image.png" [options]

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Load .env file if present (Node 20.12+ built-in, no dependencies).
// Search cwd first, then walk up from the script's own directory so the
// skill works regardless of where it's invoked from (worktrees, subdirs).
(function loadEnv() {
  const tried = new Set();
  const candidates = [process.cwd()];
  let dir = __dirname;
  while (dir && dir !== path.dirname(dir)) {
    candidates.push(dir);
    dir = path.dirname(dir);
  }
  for (const d of candidates) {
    const p = path.join(d, ".env");
    if (tried.has(p)) continue;
    tried.add(p);
    try {
      if (fs.existsSync(p)) {
        process.loadEnvFile(p);
        return;
      }
    } catch {}
  }
})();

// ---------------------------------------------------------------------------
// Early --help check (before argument parsing, so it works with any flags)
// ---------------------------------------------------------------------------

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
generate.cjs - OpenAI gpt-image-2 API wrapper

Usage:
  node generate.cjs --prompt "..." --output "./path/to/image.png" [options]

Required:
  --prompt <string>       Image generation prompt
  --output <path>         Output file path (.png, .jpg, .jpeg, or .webp)

Options:
  --size <size>           auto or WxH. Each edge <=3840, multiples of 16,
                          ratio <=3:1, total pixels 655360..8294400.
                          Common: 1024x1024, 1536x1024, 1024x1536,
                          2048x2048, 2048x1152, 3840x2160, 2160x3840
                          (default: 1024x1024)
  --quality <quality>     low | medium | high | auto (default: low)
  --background <bg>       transparent | opaque | auto (default: auto)
                          transparent requires --transparent-mode.
  --transparent-mode <m>  reject | fallback-model | chroma-key (default: reject)
                          fallback-model uses gpt-image-1.5 for native alpha;
                          chroma-key keeps gpt-image-2, requests an opaque
                          solid key background, then removes it locally.
  --chroma-key <hex>      Chroma-key color for local removal (default: #00ff00)
  --chroma-tolerance <n>  Chroma-key RGB distance tolerance, 0-442 (default: 16)
  --output-compression <n> JPEG/WEBP compression, 0-100. Not valid for PNG.
  --model <model>         Model name (default: gpt-image-2)
  --client-request-id <id> Override generated request ID
  --dry-run               Validate and print request summary without API call
  --help, -h              Show this help message

Reference images (triggers /v1/images/edits endpoint):
  --image <path>          Input image file (repeatable, max 16). PNG/JPG/WEBP, <50 MB.
  --mask <path>           PNG mask with alpha channel for inpainting (<4 MB).
  --input-fidelity <val>  Not supported with gpt-image-2. Image inputs are
                          processed at high fidelity automatically.

History (automatic by default):
  --history-id <string>   Override auto-derived ID (default: from output path)
  --history-parent <str>  Parent generation ID (for iterations)
  --no-history            Disable history logging for this generation

Environment:
  OPENAI_API_KEY          Required. Your OpenAI API key.

Examples:
  node generate.cjs --prompt "A pixel art sword" --output "./sword.png"
  node generate.cjs --prompt "Forest scene" --output "./bg.png" --size 3840x2160 --quality high
  node generate.cjs --prompt "Icon on a plain background" --output "./icon.png" --background opaque
  node generate.cjs --prompt "Game icon" --output "./icon.png" --background transparent --transparent-mode fallback-model
  node generate.cjs --prompt "Pixel sprite" --output "./sprite.png" --background transparent --transparent-mode chroma-key --chroma-key "#ff00ff"
  node generate.cjs --prompt "Make it blue" --output "./edit.png" --image "./orig.png"
  node generate.cjs --prompt "Match this style" --output "./new.png" --image "./ref1.png" --image "./ref2.png"
`.trim());
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fail(message, extra = {}) {
  process.stdout.write(JSON.stringify({ success: false, error: message, ...extra }) + "\n");
  process.exit(1);
}

function requireArgValue(flag, argv, index) {
  if (index >= argv.length || argv[index] === undefined) {
    fail(`${flag} requires a value.`);
  }
  return argv[index];
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    prompt: null,
    output: null,
    size: "1024x1024",
    quality: "low",
    background: "auto",
    model: "gpt-image-2",
    fallbackModel: null,
    transparentMode: "reject",
    chromaKey: "#00ff00",
    chromaTolerance: "16",
    outputCompression: null,
    images: [],           // Reference images for edits endpoint
    mask: null,           // PNG mask for inpainting
    inputFidelity: null,  // Unsupported by gpt-image-2
    clientRequestId: null,
    dryRun: false,
    historyId: null,      // null = auto-derive from output filename
    historyParent: null,
    noHistory: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case "--help":
      case "-h":
        break; // Already handled above
      case "--prompt":
        args.prompt = requireArgValue(flag, argv, ++i);
        break;
      case "--output":
        args.output = requireArgValue(flag, argv, ++i);
        break;
      case "--size":
        args.size = requireArgValue(flag, argv, ++i);
        break;
      case "--quality":
        args.quality = requireArgValue(flag, argv, ++i);
        break;
      case "--background":
        args.background = requireArgValue(flag, argv, ++i);
        break;
      case "--transparent-mode":
        args.transparentMode = requireArgValue(flag, argv, ++i);
        break;
      case "--chroma-key":
        args.chromaKey = requireArgValue(flag, argv, ++i);
        break;
      case "--chroma-tolerance":
        args.chromaTolerance = requireArgValue(flag, argv, ++i);
        break;
      case "--model":
        args.model = requireArgValue(flag, argv, ++i);
        break;
      case "--output-compression":
        args.outputCompression = requireArgValue(flag, argv, ++i);
        break;
      case "--image":
        args.images.push(requireArgValue(flag, argv, ++i));
        break;
      case "--mask":
        args.mask = requireArgValue(flag, argv, ++i);
        break;
      case "--input-fidelity":
        args.inputFidelity = requireArgValue(flag, argv, ++i);
        break;
      case "--client-request-id":
        args.clientRequestId = requireArgValue(flag, argv, ++i);
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--history-id":
        args.historyId = requireArgValue(flag, argv, ++i);
        break;
      case "--history-parent":
        args.historyParent = requireArgValue(flag, argv, ++i);
        break;
      case "--no-history":
        args.noHistory = true;
        break;
      default:
        fail(`Unknown argument: ${flag}. Use --help for usage information.`);
    }
  }

  return args;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_QUALITIES = new Set(["low", "medium", "high", "auto"]);
const VALID_BACKGROUNDS = new Set(["transparent", "opaque", "auto"]);
const VALID_TRANSPARENT_MODES = new Set(["reject", "fallback-model", "chroma-key"]);
const VALID_EXTENSIONS = { ".png": "png", ".jpg": "jpeg", ".jpeg": "jpeg", ".webp": "webp" };
const VALID_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const MAX_IMAGES = 16;
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;  // 50 MB
const MAX_MASK_BYTES = 4 * 1024 * 1024;    // 4 MB

const MIME_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

const VALID_MASK_EXTENSIONS = new Set([".png"]);
const CHROMA_KEY_PROMPT_SUFFIX = "Solid flat {color} chroma-key background filling the canvas, no shadows, no gradients, no background objects.";

function validateSize(size) {
  if (size === "auto") return;
  const match = /^([1-9][0-9]*)x([1-9][0-9]*)$/.exec(size);
  if (!match) {
    fail(`Invalid --size "${size}". Use auto or WxH, for example 1024x1024.`);
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  const maxEdge = Math.max(width, height);
  const minEdge = Math.min(width, height);
  const pixels = width * height;
  if (width > 3840 || height > 3840) {
    fail(`Invalid --size "${size}". Each edge must be <= 3840 for gpt-image-2.`);
  }
  if (width % 16 !== 0 || height % 16 !== 0) {
    fail(`Invalid --size "${size}". Width and height must be multiples of 16 for gpt-image-2.`);
  }
  if (maxEdge / minEdge > 3) {
    fail(`Invalid --size "${size}". Long-edge to short-edge ratio must be <= 3:1 for gpt-image-2.`);
  }
  if (pixels < 655360 || pixels > 8294400) {
    fail(`Invalid --size "${size}". Total pixels must be between 655360 and 8294400 for gpt-image-2.`);
  }
}

function validateImageFile(filePath, label, { maxBytes, allowedExtensions } = {}) {
  const exts = allowedExtensions || VALID_IMAGE_EXTENSIONS;
  const limit = maxBytes || MAX_IMAGE_BYTES;
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    fail(`${label} file not found: "${filePath}"`);
  }
  const ext = path.extname(resolved).toLowerCase();
  if (!exts.has(ext)) {
    const names = [...exts].join(", ");
    fail(`${label} has unsupported extension "${ext}". Must be: ${names}`);
  }
  const stat = fs.statSync(resolved);
  if (stat.size > limit) {
    fail(`${label} is ${(stat.size / 1024 / 1024).toFixed(1)} MB, exceeds ${limit / 1024 / 1024} MB limit.`);
  }
  return { resolved, ext, mime: MIME_TYPES[ext] };
}

function validate(args) {
  if (!args.prompt) fail("--prompt is required.");
  if (!args.output) fail("--output is required.");
  validateSize(args.size);
  if (!VALID_QUALITIES.has(args.quality))
    fail(`Invalid --quality "${args.quality}". Must be one of: ${[...VALID_QUALITIES].join(", ")}`);
  if (!VALID_BACKGROUNDS.has(args.background))
    fail(`Invalid --background "${args.background}". Must be one of: ${[...VALID_BACKGROUNDS].join(", ")}`);
  if (!VALID_TRANSPARENT_MODES.has(args.transparentMode))
    fail(`Invalid --transparent-mode "${args.transparentMode}". Must be one of: ${[...VALID_TRANSPARENT_MODES].join(", ")}`);
  if (!/^#[0-9a-fA-F]{6}$/.test(args.chromaKey)) {
    fail(`Invalid --chroma-key "${args.chromaKey}". Must be a hex color like #00ff00.`);
  }
  if (!/^[0-9]+$/.test(args.chromaTolerance)) {
    fail(`Invalid --chroma-tolerance "${args.chromaTolerance}". Must be an integer 0-442.`);
  }
  args.chromaTolerance = Number(args.chromaTolerance);
  if (args.chromaTolerance < 0 || args.chromaTolerance > 442) {
    fail(`Invalid --chroma-tolerance "${args.chromaTolerance}". Must be an integer 0-442.`);
  }

  const ext = path.extname(args.output).toLowerCase();
  if (!VALID_EXTENSIONS[ext]) {
    fail(`Unsupported file extension "${ext}". Use .png, .jpg, .jpeg, or .webp.`);
  }

  if (args.background === "transparent") {
    if (ext === ".jpg" || ext === ".jpeg") {
      fail("JPEG does not support transparency. Use .png or .webp with --background transparent.");
    }
    if (args.transparentMode === "reject") {
      fail('gpt-image-2 does not use native background "transparent" by default. Use --transparent-mode fallback-model for native alpha or --transparent-mode chroma-key for local PNG cleanup.');
    }
    if (args.transparentMode === "chroma-key") {
      if (ext !== ".png") {
        fail("--transparent-mode chroma-key currently requires PNG output. Use .png or --transparent-mode fallback-model.");
      }
    }
    if (args.transparentMode === "fallback-model") {
      args.fallbackModel = "gpt-image-1.5";
      args.model = "gpt-image-1.5";
    }
  } else if (args.transparentMode !== "reject") {
    fail("--transparent-mode only applies when --background transparent is requested.");
  }

  if (args.outputCompression !== null) {
    if (!/^[0-9]+$/.test(args.outputCompression)) {
      fail(`Invalid --output-compression "${args.outputCompression}". Must be an integer 0-100.`);
    }
    const compression = Number(args.outputCompression);
    if (compression < 0 || compression > 100) {
      fail(`Invalid --output-compression "${args.outputCompression}". Must be an integer 0-100.`);
    }
    if (ext === ".png") {
      fail("--output-compression is only valid with JPEG or WEBP output, not PNG.");
    }
    args.outputCompression = compression;
  }

  if (args.clientRequestId !== null) {
    if (args.clientRequestId.length > 512 || !/^[\x20-\x7E]+$/.test(args.clientRequestId)) {
      fail("--client-request-id must contain only ASCII printable characters and be 512 characters or fewer.");
    }
  }

  // --- Reference image validation ---

  if (args.images.length > MAX_IMAGES) {
    fail(`Too many --image flags (${args.images.length}). Maximum is ${MAX_IMAGES}.`);
  }

  // Resolve image paths in place
  for (let i = 0; i < args.images.length; i++) {
    const info = validateImageFile(args.images[i], `--image "${args.images[i]}"`, MAX_IMAGE_BYTES);
    args.images[i] = info.resolved;
  }

  // Mask requires --image
  if (args.mask && args.images.length === 0) {
    fail("--mask requires at least one --image.");
  }

  if (args.mask) {
    const info = validateImageFile(args.mask, "--mask", {
      maxBytes: MAX_MASK_BYTES,
      allowedExtensions: VALID_MASK_EXTENSIONS,
    });
    args.mask = info.resolved;
  }

  if (args.inputFidelity) {
    fail("gpt-image-2 always uses high-fidelity image inputs; --input-fidelity is not supported.");
  }
}

// ---------------------------------------------------------------------------
// Retry logic with exponential backoff
// ---------------------------------------------------------------------------

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const FETCH_TIMEOUT_MS = 120_000; // 2 minutes

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options, clientRequestId) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      const jitter = Math.random() * delay * 0.5;
      await sleep(delay + jitter);
    }

    let response;
    try {
      response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      if (err.name === "TimeoutError") {
        lastError = `Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`;
      } else {
        lastError = `Network error: ${err.message}`;
      }
      if (attempt < MAX_RETRIES) continue;
      fail(lastError, { clientRequestId });
    }

    if (response.ok) return response;

    let body;
    try {
      body = await response.json();
    } catch {
      body = { error: { message: `HTTP ${response.status} ${response.statusText}` } };
    }

    const errorMessage = body?.error?.message || `HTTP ${response.status}`;

    // Content policy — do NOT retry
    if (response.status === 400 && errorMessage.toLowerCase().includes("content policy")) {
      fail(`Content policy violation: ${errorMessage}`, {
        clientRequestId,
        openaiRequestId: response.headers?.get?.("x-request-id") || null,
      });
    }

    // Auth errors — do NOT retry
    if (response.status === 401) {
      fail(`Authentication failed: ${errorMessage}. Check your OPENAI_API_KEY.`, {
        clientRequestId,
        openaiRequestId: response.headers?.get?.("x-request-id") || null,
      });
    }

    // Billing/quota/verification — do NOT retry
    if (response.status === 402 || response.status === 403) {
      fail(`Access denied (HTTP ${response.status}): ${errorMessage}`, {
        clientRequestId,
        openaiRequestId: response.headers?.get?.("x-request-id") || null,
      });
    }

    // Retryable errors
    if (RETRYABLE_STATUS_CODES.has(response.status)) {
      lastError = `HTTP ${response.status}: ${errorMessage}`;
      if (attempt < MAX_RETRIES) continue;
      fail(`Failed after ${MAX_RETRIES + 1} attempts. Last error: ${lastError}`, {
        clientRequestId,
        openaiRequestId: response.headers?.get?.("x-request-id") || null,
      });
    }

    // Any other error
    fail(`API error (HTTP ${response.status}): ${errorMessage}`, {
      clientRequestId,
      openaiRequestId: response.headers?.get?.("x-request-id") || null,
    });
  }

  fail(`Failed after ${MAX_RETRIES + 1} attempts. Last error: ${lastError}`, { clientRequestId });
}

// ---------------------------------------------------------------------------
// Edit-mode FormData builder
// ---------------------------------------------------------------------------

// Build a multipart/form-data body for the /v1/images/edits endpoint.
// Uses Node's built-in FormData + Blob (no external deps).
// NOTE: Buffer-backed Blobs are replayable, so retries in fetchWithRetry
// work correctly. Do not switch to streams without revisiting retry safety.
function appendSharedFormFields(form, args, outputFormat) {
  const normalized = normalizeRequest(args, outputFormat);
  form.append("model", normalized.model);
  form.append("prompt", normalized.prompt);
  form.append("size", args.size);
  form.append("quality", args.quality);
  form.append("output_format", normalized.outputFormat);
  if (normalized.background !== "auto") {
    form.append("background", normalized.background);
  }
  if (args.outputCompression !== null) {
    form.append("output_compression", String(args.outputCompression));
  }
}

function buildEditForm(args, outputFormat) {
  const form = new FormData();
  appendSharedFormFields(form, args, outputFormat);

  // Single image: field name "image". Multiple: "image[]".
  const fieldName = args.images.length === 1 ? "image" : "image[]";
  for (const imgPath of args.images) {
    const ext = path.extname(imgPath).toLowerCase();
    const mime = MIME_TYPES[ext];
    const buf = fs.readFileSync(imgPath);
    const blob = new Blob([buf], { type: mime });
    form.append(fieldName, blob, path.basename(imgPath));
  }

  if (args.mask) {
    const maskBuf = fs.readFileSync(args.mask);
    const maskBlob = new Blob([maskBuf], { type: "image/png" });
    form.append("mask", maskBlob, path.basename(args.mask));
  }

  return form;
}

function buildHeaders(apiKey, clientRequestId, isMultipart = false) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "X-Client-Request-Id": clientRequestId,
  };
  if (!isMultipart) {
    headers["Content-Type"] = "application/json";
  }
  if (process.env.OPENAI_ORGANIZATION) {
    headers["OpenAI-Organization"] = process.env.OPENAI_ORGANIZATION;
  }
  if (process.env.OPENAI_PROJECT) {
    headers["OpenAI-Project"] = process.env.OPENAI_PROJECT;
  }
  return headers;
}

function buildGenerationBody(args, outputFormat) {
  const normalized = normalizeRequest(args, outputFormat);
  const requestBody = {
    model: normalized.model,
    prompt: normalized.prompt,
    size: args.size,
    quality: args.quality,
    output_format: normalized.outputFormat,
  };
  if (normalized.background !== "auto") {
    requestBody.background = normalized.background;
  }
  if (args.outputCompression !== null) {
    requestBody.output_compression = args.outputCompression;
  }
  return requestBody;
}

function chromaKeyPromptSuffix(color) {
  return CHROMA_KEY_PROMPT_SUFFIX.replace("{color}", color.toLowerCase());
}

function normalizeRequest(args, outputFormat) {
  if (args.background === "transparent" && args.transparentMode === "chroma-key") {
    return {
      model: "gpt-image-2",
      prompt: `${args.prompt}\n\n${chromaKeyPromptSuffix(args.chromaKey)}`,
      background: "opaque",
      outputFormat: "png",
    };
  }
  return {
    model: args.model,
    prompt: args.prompt,
    background: args.background,
    outputFormat,
  };
}

function buildPostprocessSummary(args) {
  if (args.background !== "transparent" || args.transparentMode !== "chroma-key") return null;
  return {
    type: "chroma-key",
    chromaKey: args.chromaKey.toLowerCase(),
    tolerance: args.chromaTolerance,
    status: "pending-local-png-processing",
  };
}

function buildDryRun(args, outputFormat, outputPath, clientRequestId) {
  const isEdit = args.images.length > 0;
  const endpoint = isEdit ? "https://api.openai.com/v1/images/edits" : "https://api.openai.com/v1/images/generations";
  const params = buildGenerationBody(args, outputFormat);
  if (isEdit) {
    params.imageFields = args.images.map((imgPath) => ({
      field: args.images.length === 1 ? "image" : "image[]",
      path: imgPath,
    }));
    if (args.mask) params.mask = args.mask;
  }
  return {
    success: true,
    dryRun: true,
    mode: isEdit ? "edit" : "generation",
    endpoint,
    method: "POST",
    model: args.model,
    background: args.background,
    transparentMode: args.transparentMode,
    ...(args.fallbackModel ? { fallbackModel: args.fallbackModel } : {}),
    ...(args.transparentMode === "chroma-key" ? { chromaKey: args.chromaKey } : {}),
    ...(buildPostprocessSummary(args) ? { postprocess: buildPostprocessSummary(args) } : {}),
    output: outputPath,
    outputFormat,
    clientRequestId,
    params,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);
  validate(args);

  // Ensure output directory exists
  const outputDir = path.dirname(path.resolve(args.output));
  if (!args.dryRun) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Determine output format from file extension
  const ext = path.extname(args.output).toLowerCase();
  const outputFormat = VALID_EXTENSIONS[ext]; // Already validated
  const outputPath = path.resolve(args.output);
  const clientRequestId = args.clientRequestId || crypto.randomUUID();

  if (args.dryRun) {
    process.stdout.write(JSON.stringify(buildDryRun(args, outputFormat, outputPath, clientRequestId)) + "\n");
    return;
  }

  if (args.background === "transparent" && args.transparentMode === "chroma-key") {
    fail("--transparent-mode chroma-key request normalization is available in --dry-run; PNG post-processing lands in the next implementation phase.", {
      clientRequestId,
      postprocess: buildPostprocessSummary(args),
    });
  }

  // Check API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    fail(
      "OPENAI_API_KEY environment variable is not set. " +
      "See https://platform.openai.com/api-keys to create one.",
      { clientRequestId }
    );
  }

  const isEdit = args.images.length > 0;
  let url, fetchOptions;

  if (isEdit) {
    // --- Edits endpoint (multipart/form-data) ---
    url = "https://api.openai.com/v1/images/edits";
    const form = buildEditForm(args, outputFormat);
    fetchOptions = {
      method: "POST",
      // Do NOT set Content-Type - fetch auto-sets the multipart boundary.
      headers: buildHeaders(apiKey, clientRequestId, true),
      body: form,
    };
  } else {
    // --- Generations endpoint (JSON) ---
    url = "https://api.openai.com/v1/images/generations";
    // NOTE: Do NOT include `response_format` - gpt-image-2 returns b64_json.
    const requestBody = buildGenerationBody(args, outputFormat);
    fetchOptions = {
      method: "POST",
      headers: buildHeaders(apiKey, clientRequestId, false),
      body: JSON.stringify(requestBody),
    };
  }

  // Call the API
  const response = await fetchWithRetry(url, fetchOptions, clientRequestId);
  const openaiRequestId = response.headers?.get?.("x-request-id") || null;

  // Parse response
  let data;
  try {
    data = await response.json();
  } catch (err) {
    fail(`Failed to parse API response as JSON: ${err.message}`);
  }

  // Extract the base64 image data
  // gpt-image-2 returns b64_json for Image API responses.
  const imageData = data?.data?.[0];
  if (!imageData || !imageData.b64_json) {
    fail("Unexpected API response: no image data (b64_json) returned.");
  }

  const imageBuffer = Buffer.from(imageData.b64_json, "base64");

  // Write to file
  try {
    fs.writeFileSync(outputPath, imageBuffer);
  } catch (err) {
    fail(`Failed to write image to "${outputPath}": ${err.message}`, { clientRequestId, openaiRequestId });
  }

  // Auto-derive history ID from output path if not provided
  // Uses relative path minus extension to avoid collisions (e.g.,
  // "assets/sprites/snake-idle" instead of just "snake-idle")
  const historyId = args.historyId ||
    args.output.replace(/\.[^.]+$/, "").replace(/^\.\//, "");

  // Build result
  const result = {
    success: true,
    output: outputPath,
    historyId: historyId,
    size: args.size,
    quality: args.quality,
    background: args.background,
    model: args.model,
    transparentMode: args.transparentMode,
    ...(args.fallbackModel ? { fallbackModel: args.fallbackModel } : {}),
    clientRequestId,
    openaiRequestId,
    ...(args.outputCompression !== null ? { outputCompression: args.outputCompression } : {}),
    bytes: imageBuffer.length,
  };

  if (isEdit) {
    result.inputImages = args.images;
    if (args.mask) result.mask = args.mask;
  }

  // Append to history file (best-effort — never fail the generation over this)
  if (!args.noHistory) {
    const historyEntry = {
      id: historyId,
      timestamp: new Date().toISOString(),
      prompt: args.prompt,
      output: args.output, // Keep as provided (relative path)
      params: {
        size: args.size,
        quality: args.quality,
        background: args.background,
        model: args.model,
        transparentMode: args.transparentMode,
        ...(args.fallbackModel ? { fallbackModel: args.fallbackModel } : {}),
        clientRequestId,
        openaiRequestId,
        ...(args.outputCompression !== null ? { outputCompression: args.outputCompression } : {}),
      },
      parentId: args.historyParent || null,
      bytes: imageBuffer.length,
      outputFormat: outputFormat,
    };

    if (args.images.length > 0) {
      historyEntry.inputImages = args.images;
    }
    if (args.mask) {
      historyEntry.mask = args.mask;
    }
    try {
      fs.appendFileSync(
        path.resolve(".imagegen2-history.jsonl"),
        JSON.stringify(historyEntry) + "\n"
      );
    } catch (err) {
      result.historyWarning = `Failed to write history: ${err.message}`;
    }
  }

  process.stdout.write(JSON.stringify(result) + "\n");
}

main().catch((err) => {
  fail(`Unexpected error: ${err.message}`);
});
