/**
 * Offline validation tests for imagegen2 generate.cjs.
 *
 * These tests exercise argument parsing, local validation, and dry-run
 * request summaries. They never call the real OpenAI API.
 */

import { spawnSync } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import zlib from 'node:zlib';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, '../cli/generate.cjs');
const REFERENCE = path.resolve(__dirname, '../cli/reference.md');
const require = createRequire(import.meta.url);
const { Imagegen2Error, encodeRgbaPng, parsePng, chromaKeyPng } = require(SCRIPT);

const TEMP_DIR = mkdtempSync(path.join(tmpdir(), 'imagegen2-test-'));
const TEMP_PNG = path.join(TEMP_DIR, 'test.png');
const TEMP_JPG = path.join(TEMP_DIR, 'test.jpg');
const TEMP_WEBP = path.join(TEMP_DIR, 'test.webp');
const TEMP_TXT = path.join(TEMP_DIR, 'test.txt');
const MOCK_FETCH = path.join(TEMP_DIR, 'mock-fetch.mjs');
const MINI_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

writeFileSync(TEMP_PNG, MINI_PNG);
writeFileSync(TEMP_JPG, MINI_PNG);
writeFileSync(TEMP_WEBP, MINI_PNG);
writeFileSync(TEMP_TXT, 'not an image');
writeFileSync(MOCK_FETCH, `
globalThis.fetch = async () => {
  const status = Number(process.env.IMAGEGEN2_MOCK_STATUS || '200');
  const headers = new Headers({ 'content-type': 'application/json' });
  headers.set('x-request-id', process.env.IMAGEGEN2_MOCK_REQUEST_ID || 'req_mock');
  const body = process.env.IMAGEGEN2_MOCK_BODY_JSON ||
    JSON.stringify({ data: [{ b64_json: process.env.IMAGEGEN2_MOCK_B64_JSON || '' }] });
  return new Response(body, { status, headers });
};
`);

process.on('exit', () => { try { rmSync(TEMP_DIR, { recursive: true }); } catch {} });

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL: ${name}\n    ${err.message}`);
  }
}

function run(args, opts = {}) {
  const result = spawnSync('node', [...(opts.nodeArgs || []), SCRIPT, ...args], {
    encoding: 'utf8',
    cwd: opts.cwd || process.cwd(),
    env: opts.env || process.env,
    timeout: 10000,
  });
  return { stdout: result.stdout || '', stderr: result.stderr || '', status: result.status };
}

function parseJson(stdout) {
  return JSON.parse(stdout.trim());
}

function rgbaBuffer(pixels) {
  return Buffer.from(pixels.flat());
}

function crc32ForTest(buf) {
  let c = 0xffffffff;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function paethForTest(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function pngChunkForTest(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBuf.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32ForTest(Buffer.concat([typeBuf, data])), 8 + data.length);
  return out;
}

function encodeFilteredPngForTest({ width, height, colorType, raw, filters }) {
  const channels = colorType === 6 ? 4 : 3;
  assert.equal(raw.length, width * height * channels);
  assert.equal(filters.length, height);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;

  const rowBytes = width * channels;
  const scanlines = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const filter = filters[y];
    const row = raw.subarray(y * rowBytes, (y + 1) * rowBytes);
    const prev = y > 0 ? raw.subarray((y - 1) * rowBytes, y * rowBytes) : null;
    const outOffset = y * (rowBytes + 1);
    scanlines[outOffset] = filter;
    for (let x = 0; x < rowBytes; x++) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = prev ? prev[x] : 0;
      const upLeft = prev && x >= channels ? prev[x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) predictor = paethForTest(left, up, upLeft);
      scanlines[outOffset + 1 + x] = (row[x] - predictor + 256) & 0xff;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunkForTest('IHDR', ihdr),
    pngChunkForTest('IDAT', zlib.deflateSync(scanlines)),
    pngChunkForTest('IEND', Buffer.alloc(0)),
  ]);
}

console.log('\nimagegen2 generate.cjs - offline validation tests\n');

for (const agentDir of ['.codex/skills/imagegen2', '.claude/skills/imagegen2', '.gemini/skills/imagegen2']) {
  test(`${agentDir} bundles current CLI and reference files`, () => {
    const agentScript = path.resolve(__dirname, '..', agentDir, 'generate.cjs');
    const agentReference = path.resolve(__dirname, '..', agentDir, 'reference.md');
    assert.equal(readFileSync(agentScript, 'utf8'), readFileSync(SCRIPT, 'utf8'));
    assert.equal(readFileSync(agentReference, 'utf8'), readFileSync(REFERENCE, 'utf8'));
  });
}

test('--help documents gpt-image-2 and flexible options', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('gpt-image-2'));
  assert.ok(r.stdout.includes('3840x2160'));
  assert.ok(r.stdout.includes('--output-compression'));
  assert.ok(r.stdout.includes('--transparent-mode'));
  assert.ok(r.stdout.includes('--chroma-key'));
  assert.ok(r.stdout.includes('--chroma-tolerance'));
  assert.ok(r.stdout.includes('--dry-run'));
  assert.ok(r.stdout.includes('--image'));
  assert.ok(r.stdout.includes('--mask'));
  assert.ok(r.stdout.includes('--input-fidelity'));
  assert.ok(r.stdout.includes('transparent requires --transparent-mode'));
});

test('no arguments exits non-zero with "--prompt is required."', () => {
  const r = run([]);
  assert.notEqual(r.status, 0);
  assert.ok(r.stdout.includes('--prompt is required.'));
});

test('--prompt only exits non-zero with "--output is required."', () => {
  const r = run(['--prompt', 'test']);
  assert.notEqual(r.status, 0);
  assert.ok(r.stdout.includes('--output is required.'));
});

test('--prompt as last flag exits non-zero with value error', () => {
  const r = run(['--prompt']);
  assert.notEqual(r.status, 0);
  assert.ok(r.stdout.includes('--prompt requires a value.'));
});

test('--foo exits non-zero with unknown argument error', () => {
  const r = run(['--foo']);
  assert.notEqual(r.status, 0);
  assert.ok(r.stdout.includes('Unknown argument'));
});

test('--dry-run does not require OPENAI_API_KEY', () => {
  const r = run(['--dry-run', '--prompt', 'test', '--output', 'out.png'], {
    env: { ...process.env, OPENAI_API_KEY: '' },
  });
  assert.equal(r.status, 0, r.stdout);
  const body = parseJson(r.stdout);
  assert.equal(body.success, true);
  assert.equal(body.dryRun, true);
  assert.equal(body.model, 'gpt-image-2');
  assert.equal(body.mode, 'generation');
  assert.equal(body.params.quality, 'low');
});

test('--dry-run generation reports endpoint and request id', () => {
  const r = run([
    '--dry-run',
    '--prompt', 'test',
    '--output', 'out.png',
    '--size', '2048x1152',
    '--client-request-id', 'test-request-1',
  ]);
  assert.equal(r.status, 0, r.stdout);
  const body = parseJson(r.stdout);
  assert.equal(body.endpoint, 'https://api.openai.com/v1/images/generations');
  assert.equal(body.method, 'POST');
  assert.equal(body.clientRequestId, 'test-request-1');
  assert.equal(body.params.size, '2048x1152');
});

test('valid args without API key fail after validation with request id', () => {
  const r = run(['--prompt', 'test', '--output', 't.png', '--client-request-id', 'missing-key-test'], {
    env: { ...process.env, OPENAI_API_KEY: '' },
  });
  assert.notEqual(r.status, 0);
  const body = parseJson(r.stdout);
  assert.ok(body.error.includes('OPENAI_API_KEY'));
  assert.equal(body.clientRequestId, 'missing-key-test');
});

for (const size of ['1024x1024', '2048x1152', '3840x2160', '2160x3840', 'auto']) {
  test(`--size ${size} passes dry-run validation`, () => {
    const r = run(['--dry-run', '--prompt', 'test', '--output', 't.png', '--size', size]);
    assert.equal(r.status, 0, r.stdout);
    assert.equal(parseJson(r.stdout).params.size, size);
  });
}

for (const size of ['999x999', '3841x1024', '1024x1000', '4096x4096', '3840x1024']) {
  test(`--size ${size} exits non-zero`, () => {
    const r = run(['--dry-run', '--prompt', 'test', '--output', 't.png', '--size', size]);
    assert.notEqual(r.status, 0);
    assert.ok(r.stdout.includes('Invalid --size'), r.stdout);
  });
}

test('--quality ultra exits non-zero', () => {
  const r = run(['--dry-run', '--prompt', 'test', '--output', 't.png', '--quality', 'ultra']);
  assert.notEqual(r.status, 0);
  assert.ok(r.stdout.includes('Invalid --quality'));
});

test('--background fuzzy exits non-zero', () => {
  const r = run(['--dry-run', '--prompt', 'test', '--output', 't.png', '--background', 'fuzzy']);
  assert.notEqual(r.status, 0);
  assert.ok(r.stdout.includes('Invalid --background'));
});

test('--background transparent exits non-zero for gpt-image-2', () => {
  const r = run(['--dry-run', '--prompt', 'test', '--output', 't.png', '--background', 'transparent']);
  assert.notEqual(r.status, 0);
  assert.ok(r.stdout.includes('gpt-image-2 does not use native background'));
});

test('--background transparent fallback-model dry-runs as gpt-image-1.5', () => {
  const r = run([
    '--dry-run',
    '--prompt', 'test',
    '--output', 't.png',
    '--background', 'transparent',
    '--transparent-mode', 'fallback-model',
  ]);
  assert.equal(r.status, 0, r.stdout);
  const body = parseJson(r.stdout);
  assert.equal(body.model, 'gpt-image-1.5');
  assert.equal(body.fallbackModel, 'gpt-image-1.5');
  assert.equal(body.params.model, 'gpt-image-1.5');
  assert.equal(body.params.background, 'transparent');
});

test('--background transparent fallback-model rejects JPEG', () => {
  const r = run([
    '--dry-run',
    '--prompt', 'test',
    '--output', 't.jpg',
    '--background', 'transparent',
    '--transparent-mode', 'fallback-model',
  ]);
  assert.notEqual(r.status, 0);
  assert.ok(r.stdout.includes('JPEG does not support transparency'));
});

test('--background transparent chroma-key dry-runs as gpt-image-2 opaque PNG with postprocess summary', () => {
  const r = run([
    '--dry-run',
    '--prompt', 'test',
    '--output', 't.png',
    '--background', 'transparent',
    '--transparent-mode', 'chroma-key',
    '--chroma-key', '#ff00ff',
  ]);
  assert.equal(r.status, 0, r.stdout);
  const body = parseJson(r.stdout);
  assert.equal(body.model, 'gpt-image-2');
  assert.equal(body.background, 'transparent');
  assert.equal(body.transparentMode, 'chroma-key');
  assert.equal(body.chromaKey, '#ff00ff');
  assert.equal(body.params.model, 'gpt-image-2');
  assert.equal(body.params.background, 'opaque');
  assert.equal(body.params.output_format, 'png');
  assert.ok(body.params.prompt.includes('Solid flat #ff00ff chroma-key background'));
  assert.deepEqual(body.postprocess, {
    type: 'chroma-key',
    chromaKey: '#ff00ff',
    tolerance: 16,
    status: 'pending-local-png-processing',
  });
});

test('--background transparent chroma-key rejects WEBP until alpha processing exists', () => {
  const r = run([
    '--dry-run',
    '--prompt', 'test',
    '--output', 't.webp',
    '--background', 'transparent',
    '--transparent-mode', 'chroma-key',
  ]);
  assert.notEqual(r.status, 0);
  assert.ok(r.stdout.includes('currently requires PNG output'));
});

test('--chroma-key validates hex color', () => {
  const r = run([
    '--dry-run',
    '--prompt', 'test',
    '--output', 't.png',
    '--chroma-key', 'green',
  ]);
  assert.notEqual(r.status, 0);
  assert.ok(r.stdout.includes('Invalid --chroma-key'));
});

test('--chroma-tolerance validates range', () => {
  const valid = run([
    '--dry-run',
    '--prompt', 'test',
    '--output', 't.png',
    '--background', 'transparent',
    '--transparent-mode', 'chroma-key',
    '--chroma-tolerance', '442',
  ]);
  assert.equal(valid.status, 0, valid.stdout);
  assert.equal(parseJson(valid.stdout).postprocess.tolerance, 442);

  const invalid = run([
    '--dry-run',
    '--prompt', 'test',
    '--output', 't.png',
    '--background', 'transparent',
    '--transparent-mode', 'chroma-key',
    '--chroma-tolerance', '443',
  ]);
  assert.notEqual(invalid.status, 0);
  assert.ok(invalid.stdout.includes('Invalid --chroma-tolerance'));
});

test('--transparent-mode without transparent background exits non-zero', () => {
  const r = run([
    '--dry-run',
    '--prompt', 'test',
    '--output', 't.png',
    '--transparent-mode', 'fallback-model',
  ]);
  assert.notEqual(r.status, 0);
  assert.ok(r.stdout.includes('only applies when --background transparent'));
});

test('unsupported output extension exits non-zero', () => {
  const r = run(['--dry-run', '--prompt', 'test', '--output', 't.bmp']);
  assert.notEqual(r.status, 0);
  assert.ok(r.stdout.includes('Unsupported file extension'));
});

test('--output-compression accepts JPEG output', () => {
  const r = run(['--dry-run', '--prompt', 'test', '--output', 't.jpg', '--output-compression', '50']);
  assert.equal(r.status, 0, r.stdout);
  assert.equal(parseJson(r.stdout).params.output_compression, 50);
});

test('--output-compression accepts WEBP output', () => {
  const r = run(['--dry-run', '--prompt', 'test', '--output', 't.webp', '--output-compression', '85']);
  assert.equal(r.status, 0, r.stdout);
  assert.equal(parseJson(r.stdout).params.output_compression, 85);
});

test('--output-compression rejects PNG output', () => {
  const r = run(['--dry-run', '--prompt', 'test', '--output', 't.png', '--output-compression', '50']);
  assert.notEqual(r.status, 0);
  assert.ok(r.stdout.includes('not PNG'));
});

test('--output-compression rejects out of range values', () => {
  const r = run(['--dry-run', '--prompt', 'test', '--output', 't.webp', '--output-compression', '101']);
  assert.notEqual(r.status, 0);
  assert.ok(r.stdout.includes('0-100'));
});

console.log('\n  --- reference image tests ---\n');

test('--image without value exits non-zero', () => {
  const r = run(['--dry-run', '--prompt', 'test', '--output', 't.png', '--image']);
  assert.notEqual(r.status, 0);
  assert.ok(r.stdout.includes('--image requires a value.'));
});

test('--image nonexistent file exits non-zero', () => {
  const r = run(['--dry-run', '--prompt', 'test', '--output', 't.png', '--image', '/nonexistent/file.png']);
  assert.notEqual(r.status, 0);
  assert.ok(r.stdout.includes('file not found'));
});

test('--image with non-image extension exits non-zero', () => {
  const r = run(['--dry-run', '--prompt', 'test', '--output', 't.png', '--image', TEMP_TXT]);
  assert.notEqual(r.status, 0);
  assert.ok(r.stdout.includes('unsupported extension'));
});

test('--image with valid PNG produces edit dry-run', () => {
  const r = run(['--dry-run', '--prompt', 'test', '--output', 't.png', '--image', TEMP_PNG]);
  assert.equal(r.status, 0, r.stdout);
  const body = parseJson(r.stdout);
  assert.equal(body.mode, 'edit');
  assert.equal(body.endpoint, 'https://api.openai.com/v1/images/edits');
  assert.equal(body.params.imageFields[0].field, 'image');
});

test('multiple --image flags use image[] in dry-run', () => {
  const r = run(['--dry-run', '--prompt', 'test', '--output', 't.png', '--image', TEMP_PNG, '--image', TEMP_JPG]);
  assert.equal(r.status, 0, r.stdout);
  const body = parseJson(r.stdout);
  assert.equal(body.params.imageFields.length, 2);
  assert.equal(body.params.imageFields[0].field, 'image[]');
});

test('17 --image flags exits non-zero', () => {
  const imageArgs = [];
  for (let i = 0; i < 17; i++) imageArgs.push('--image', TEMP_PNG);
  const r = run(['--dry-run', '--prompt', 'test', '--output', 't.png', ...imageArgs]);
  assert.notEqual(r.status, 0);
  assert.ok(r.stdout.includes('Too many --image'));
});

test('--mask without --image exits non-zero', () => {
  const r = run(['--dry-run', '--prompt', 'test', '--output', 't.png', '--mask', TEMP_PNG]);
  assert.notEqual(r.status, 0);
  assert.ok(r.stdout.includes('--mask requires at least one --image'));
});

test('--mask without value exits non-zero', () => {
  const r = run(['--dry-run', '--prompt', 'test', '--output', 't.png', '--image', TEMP_PNG, '--mask']);
  assert.notEqual(r.status, 0);
  assert.ok(r.stdout.includes('--mask requires a value.'));
});

test('--mask with non-PNG extension exits non-zero', () => {
  const r = run(['--dry-run', '--prompt', 'test', '--output', 't.png', '--image', TEMP_PNG, '--mask', TEMP_JPG]);
  assert.notEqual(r.status, 0);
  assert.ok(r.stdout.includes('unsupported extension'));
});

test('--mask with valid PNG is reported in dry-run', () => {
  const r = run(['--dry-run', '--prompt', 'test', '--output', 't.png', '--image', TEMP_PNG, '--mask', TEMP_PNG]);
  assert.equal(r.status, 0, r.stdout);
  const body = parseJson(r.stdout);
  assert.equal(body.params.mask, TEMP_PNG);
});

test('--input-fidelity high exits non-zero for gpt-image-2', () => {
  const r = run(['--dry-run', '--prompt', 'test', '--output', 't.png', '--image', TEMP_PNG, '--input-fidelity', 'high']);
  assert.notEqual(r.status, 0);
  assert.ok(r.stdout.includes('gpt-image-2 always uses high-fidelity image inputs'));
});

test('--image with valid WEBP passes validation', () => {
  const r = run(['--dry-run', '--prompt', 'test', '--output', 't.png', '--image', TEMP_WEBP]);
  assert.equal(r.status, 0, r.stdout);
});

console.log('\n  --- chroma-key post-processing tests ---\n');

test('chromaKeyPng removes exact key pixels and writes RGBA PNG', () => {
  const input = encodeRgbaPng({
    width: 2,
    height: 2,
    rgba: rgbaBuffer([
      [255, 0, 255, 255],
      [10, 20, 30, 255],
      [255, 0, 255, 255],
      [40, 50, 60, 255],
    ]),
  });
  const result = chromaKeyPng(input, { chromaKey: '#ff00ff', tolerance: 0 });
  assert.equal(result.stats.removedPixels, 2);
  assert.equal(result.stats.retainedVisiblePixels, 2);
  const parsed = parsePng(result.buffer);
  assert.equal(parsed.rgba[3], 0);
  assert.equal(parsed.rgba[7], 255);
  assert.equal(parsed.rgba[11], 0);
  assert.equal(parsed.rgba[15], 255);
});

test('chromaKeyPng preserves existing non-key alpha', () => {
  const input = encodeRgbaPng({
    width: 2,
    height: 1,
    rgba: rgbaBuffer([
      [255, 0, 255, 255],
      [10, 20, 30, 128],
    ]),
  });
  const parsed = parsePng(chromaKeyPng(input, { chromaKey: '#ff00ff', tolerance: 0 }).buffer);
  assert.equal(parsed.rgba[3], 0);
  assert.equal(parsed.rgba[7], 128);
});

test('chromaKeyPng uses tolerance for near-key pixels', () => {
  const input = encodeRgbaPng({
    width: 2,
    height: 1,
    rgba: rgbaBuffer([
      [250, 0, 250, 255],
      [240, 0, 240, 255],
    ]),
  });
  const parsed = parsePng(chromaKeyPng(input, { chromaKey: '#ff00ff', tolerance: 8 }).buffer);
  assert.equal(parsed.rgba[3], 0);
  assert.equal(parsed.rgba[7], 255);
});

test('parsePng decodes PNG filter types 1-4', () => {
  const raw = rgbaBuffer([
    [1, 2, 3, 255],
    [10, 20, 30, 255],
    [40, 50, 60, 255],
    [5, 7, 9, 255],
    [15, 25, 35, 255],
    [45, 55, 65, 255],
    [8, 6, 4, 255],
    [18, 28, 38, 255],
    [48, 58, 68, 255],
    [11, 12, 13, 255],
    [21, 31, 41, 255],
    [51, 61, 71, 255],
    [14, 15, 16, 255],
    [24, 34, 44, 255],
    [54, 64, 74, 255],
  ]);
  const input = encodeFilteredPngForTest({
    width: 3,
    height: 5,
    colorType: 6,
    raw,
    filters: [0, 1, 2, 3, 4],
  });
  assert.deepEqual(parsePng(input).rgba, raw);
});

test('chromaKeyPng supports 8-bit RGB PNG input', () => {
  const rgb = Buffer.from([
    255, 0, 255,
    10, 20, 30,
    250, 0, 250,
  ]);
  const input = encodeFilteredPngForTest({
    width: 3,
    height: 1,
    colorType: 2,
    raw: rgb,
    filters: [1],
  });
  const result = chromaKeyPng(input, { chromaKey: '#ff00ff', tolerance: 8 });
  assert.equal(result.stats.removedPixels, 2);
  assert.equal(result.stats.retainedVisiblePixels, 1);
  const parsed = parsePng(result.buffer);
  assert.deepEqual([...parsed.rgba], [
    255, 0, 255, 0,
    10, 20, 30, 255,
    250, 0, 250, 0,
  ]);
});

test('chromaKeyPng fails clearly when no key pixels are found', () => {
  const input = encodeRgbaPng({
    width: 1,
    height: 1,
    rgba: rgbaBuffer([[10, 20, 30, 255]]),
  });
  assert.throws(
    () => chromaKeyPng(input, { chromaKey: '#ff00ff', tolerance: 0 }),
    (err) => err instanceof Imagegen2Error && err.message.includes('found no pixels')
  );
});

test('parsePng fails clearly for non-PNG input', () => {
  assert.throws(
    () => parsePng(Buffer.from('not a png')),
    (err) => err instanceof Imagegen2Error && err.message.includes('missing PNG signature')
  );
});

test('parsePng rejects corrupt chunk CRCs', () => {
  const input = encodeRgbaPng({
    width: 1,
    height: 1,
    rgba: rgbaBuffer([[255, 0, 255, 255]]),
  });
  const corrupted = Buffer.from(input);
  corrupted[29] ^= 0xff; // First byte of IHDR CRC.
  assert.throws(
    () => parsePng(corrupted),
    (err) => err instanceof Imagegen2Error && err.message.includes('CRC mismatch')
  );
});

test('parsePng rejects missing IEND chunks', () => {
  const input = encodeRgbaPng({
    width: 1,
    height: 1,
    rgba: rgbaBuffer([[255, 0, 255, 255]]),
  });
  assert.throws(
    () => parsePng(input.subarray(0, input.length - 12)),
    (err) => err instanceof Imagegen2Error && err.message.includes('missing IEND')
  );
});

test('parsePng wraps invalid IDAT compression errors', () => {
  const input = encodeRgbaPng({
    width: 1,
    height: 1,
    rgba: rgbaBuffer([[255, 0, 255, 255]]),
  });
  const idatOffset = input.indexOf(Buffer.from('IDAT', 'ascii'));
  assert.ok(idatOffset > 0);
  const corrupted = Buffer.from(input);
  corrupted[idatOffset + 8] ^= 0xff; // Mutate compressed IDAT data.
  const dataStart = idatOffset + 4;
  const length = corrupted.readUInt32BE(idatOffset - 4);
  const dataEnd = dataStart + length;
  corrupted.writeUInt32BE(crc32ForTest(corrupted.subarray(idatOffset, dataEnd)), dataEnd);
  assert.throws(
    () => parsePng(corrupted),
    (err) => err instanceof Imagegen2Error && err.message.includes('failed to inflate IDAT data')
  );
});

console.log('\n  --- mocked API chroma-key tests ---\n');

test('mocked chroma-key success writes stdout and history postprocess metadata', () => {
  const cwd = mkdtempSync(path.join(TEMP_DIR, 'mock-success-'));
  const output = path.join(cwd, 'sprite.png');
  const image = encodeRgbaPng({
    width: 2,
    height: 1,
    rgba: rgbaBuffer([
      [255, 0, 255, 255],
      [10, 20, 30, 255],
    ]),
  });
  const r = run([
    '--prompt', 'mock sprite',
    '--output', output,
    '--background', 'transparent',
    '--transparent-mode', 'chroma-key',
    '--chroma-key', '#ff00ff',
    '--client-request-id', 'mock-success-request',
  ], {
    cwd,
    nodeArgs: ['--import', MOCK_FETCH],
    env: {
      ...process.env,
      OPENAI_API_KEY: 'test-key',
      IMAGEGEN2_MOCK_B64_JSON: image.toString('base64'),
      IMAGEGEN2_MOCK_REQUEST_ID: 'req_mock_success',
    },
  });
  assert.equal(r.status, 0, r.stdout || r.stderr);
  assert.ok(existsSync(output));
  const body = parseJson(r.stdout);
  assert.equal(body.success, true);
  assert.equal(body.model, 'gpt-image-2');
  assert.equal(body.background, 'transparent');
  assert.equal(body.transparentMode, 'chroma-key');
  assert.equal(body.clientRequestId, 'mock-success-request');
  assert.equal(body.openaiRequestId, 'req_mock_success');
  assert.deepEqual(body.postprocess, {
    type: 'chroma-key',
    status: 'completed',
    chromaKey: '#ff00ff',
    tolerance: 16,
    removedPixels: 1,
    retainedVisiblePixels: 1,
    width: 2,
    height: 1,
  });

  const history = parseJson(readFileSync(path.join(cwd, '.imagegen2-history.jsonl'), 'utf8'));
  assert.equal(history.prompt, 'mock sprite');
  assert.equal(history.params.requestBackground, 'opaque');
  assert.equal(history.params.chromaKey, '#ff00ff');
  assert.equal(history.params.chromaTolerance, 16);
  assert.deepEqual(history.postprocess, body.postprocess);
});

test('mocked chroma-key failure reports machine-readable postprocess fields', () => {
  const cwd = mkdtempSync(path.join(TEMP_DIR, 'mock-failure-'));
  const output = path.join(cwd, 'sprite.png');
  const image = encodeRgbaPng({
    width: 1,
    height: 1,
    rgba: rgbaBuffer([[10, 20, 30, 255]]),
  });
  const r = run([
    '--prompt', 'mock sprite',
    '--output', output,
    '--background', 'transparent',
    '--transparent-mode', 'chroma-key',
    '--chroma-key', '#ff00ff',
    '--chroma-tolerance', '0',
    '--client-request-id', 'mock-failure-request',
  ], {
    cwd,
    nodeArgs: ['--import', MOCK_FETCH],
    env: {
      ...process.env,
      OPENAI_API_KEY: 'test-key',
      IMAGEGEN2_MOCK_B64_JSON: image.toString('base64'),
      IMAGEGEN2_MOCK_REQUEST_ID: 'req_mock_failure',
    },
  });
  assert.notEqual(r.status, 0);
  assert.ok(!existsSync(output));
  const body = parseJson(r.stdout);
  assert.equal(body.success, false);
  assert.ok(body.error.includes('found no pixels'));
  assert.equal(body.clientRequestId, 'mock-failure-request');
  assert.equal(body.openaiRequestId, 'req_mock_failure');
  assert.equal(body.chromaKey, '#ff00ff');
  assert.equal(body.tolerance, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
