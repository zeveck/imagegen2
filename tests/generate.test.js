/**
 * Offline validation tests for imagegen2 generate.cjs.
 *
 * These tests exercise argument parsing, local validation, and dry-run
 * request summaries. They never call the OpenAI API.
 */

import { spawnSync } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, '../cli/generate.cjs');
const REFERENCE = path.resolve(__dirname, '../cli/reference.md');

const TEMP_DIR = mkdtempSync(path.join(tmpdir(), 'imagegen2-test-'));
const TEMP_PNG = path.join(TEMP_DIR, 'test.png');
const TEMP_JPG = path.join(TEMP_DIR, 'test.jpg');
const TEMP_WEBP = path.join(TEMP_DIR, 'test.webp');
const TEMP_TXT = path.join(TEMP_DIR, 'test.txt');
const MINI_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

writeFileSync(TEMP_PNG, MINI_PNG);
writeFileSync(TEMP_JPG, MINI_PNG);
writeFileSync(TEMP_WEBP, MINI_PNG);
writeFileSync(TEMP_TXT, 'not an image');

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
  const result = spawnSync('node', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: opts.env || process.env,
    timeout: 10000,
  });
  return { stdout: result.stdout || '', stderr: result.stderr || '', status: result.status };
}

function parseJson(stdout) {
  return JSON.parse(stdout.trim());
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
