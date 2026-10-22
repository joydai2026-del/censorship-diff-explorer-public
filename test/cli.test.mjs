// Tests for the command line path an agent would use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'cli', 'diff.mjs');
const run = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

function tempFolder(files) {
  const dir = mkdtempSync(join(tmpdir(), 'cde-test-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), typeof body === 'string' ? body : JSON.stringify(body));
  return dir;
}

test('runs on a folder of snapshots and prints JSON to stdout', () => {
  const dir = tempFolder({
    'b.json': { captured_at: '2026-09-02T09:00:00+08:00', posts: [] },
    'a.json': { captured_at: '2026-09-01T09:00:00+08:00', posts: [{ id: 'x', account: 'acc', text: '你好', posted_at: '2026-09-01T08:00:00+08:00' }] },
    'notes.txt': 'not json, should be ignored',
  });
  try {
    const r = run([dir]);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.deleted.length, 1);
    assert.equal(out.deleted[0].text, '你好');
    assert.equal(out.days[1].date, '2026-09-02');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--summary prints one plain line per day', () => {
  const dir = tempFolder({
    'a.json': { captured_at: '2026-09-01T09:00:00+08:00', posts: [{ id: 'x', text: 't' }] },
    'b.json': { captured_at: '2026-09-02T09:00:00+08:00', posts: [] },
  });
  try {
    const r = run([dir, '--summary']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /2026-09-01\s+0 deleted/);
    assert.match(r.stdout, /2026-09-02\s+1 deleted/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--out and --js write files, --topics tags posts, --tz-offset moves days', () => {
  const dir = tempFolder({
    'a.json': { captured_at: '2026-09-01T12:00:00Z', posts: [{ id: 'x', text: '黑烟', posted_at: '2026-09-01T11:00:00Z' }] },
    'b.json': { captured_at: '2026-09-01T16:30:00Z', posts: [] },
    'topics.json': { topics: [{ id: 'env', label_en: 'Env', label_zh: '环境', keywords: ['黑烟'] }] },
  });
  try {
    const snaps = join(dir, 'snaps');
    execFileSync('mkdir', [snaps]);
    execFileSync('mv', [join(dir, 'a.json'), join(dir, 'b.json'), snaps]);
    const out = join(dir, 'out.json');
    const js = join(dir, 'out.js');
    let r = run([snaps, '--topics', join(dir, 'topics.json'), '--out', out, '--js', js]);
    assert.equal(r.status, 0, r.stderr);
    const data = JSON.parse(readFileSync(out, 'utf8'));
    assert.deepEqual(data.deleted[0].tags, ['env']);
    assert.equal(data.deleted[0].deleted_date, '2026-09-02');
    assert.match(readFileSync(js, 'utf8'), /^window\.CDE_DATA = \{/);
    r = run([snaps, '--tz-offset', '0']);
    assert.equal(JSON.parse(r.stdout).deleted[0].deleted_date, '2026-09-01');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('bad input exits non-zero with a readable message', () => {
  const dir = tempFolder({ 'a.json': { captured_at: '2026-09-01 09:00', posts: [] } });
  try {
    let r = run([dir]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /a\.json|time zone/);
    r = run([]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Usage/);
    r = run([join(dir, 'missing-folder')]);
    assert.equal(r.status, 1);
    const bad = tempFolder({ 'a.json': '{not json' });
    r = run([bad]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /a\.json/);
    rmSync(bad, { recursive: true, force: true });
    r = run([dir, '--tz-offset', 'abc']);
    assert.equal(r.status, 2);
    r = run([dir, '--out']);
    assert.equal(r.status, 2, 'a flag missing its file name must not silently print to stdout');
    r = run([dir, '--topics', '--summary']);
    assert.equal(r.status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the sample data builds and is labeled as sample', () => {
  const r = run([join(root, 'data', 'sample', 'snapshots'), '--topics', join(root, 'data', 'topics.json')]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.meta.sample, true);
  assert.equal(out.meta.notice, 'Sample data for demo, not real posts');
  assert.equal(out.meta.skippedSnapshots.length, 1, 'the deliberately broken capture is ignored');
  assert.ok(out.deleted.length >= 15);
  assert.ok(!out.posts.some((p) => p.id === 's031'), 'the never-captured post cannot appear');
  assert.ok(out.deleted.some((d) => d.repost_of === 's003'));
  assert.ok(out.deleted.some((d) => d.edited));
  assert.ok(out.deleted.some((d) => d.restored_count > 0));
  // The 00:20 Beijing capture (16:20Z) files its deletions under Sep 6.
  assert.ok(out.deleted.some((d) => d.deleted_by === '2026-09-05T16:20:00Z' && d.deleted_date === '2026-09-06'));
});

// ---- Found in the hands-on UX audit (2026-10-21) ----

test('out-of-range --tz-offset and --max-drop are refused instead of giving wrong days', () => {
  const dir = tempFolder({ 'a.json': { captured_at: '2026-09-01T09:00:00+08:00', posts: [] } });
  try {
    let r = run([dir, '--tz-offset', '99999']);
    assert.equal(r.status, 2, 'a 69-day offset must not silently move every date');
    assert.match(r.stderr, /--tz-offset/);
    r = run([dir, '--tz-offset', '-721']);
    assert.equal(r.status, 2);
    r = run([dir, '--tz-offset', '840', '--summary']);
    assert.equal(r.status, 0, r.stderr);
    r = run([dir, '--max-drop', '-1']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--max-drop/);
    r = run([dir, '--max-drop', '5']);
    assert.equal(r.status, 2);
    r = run([dir, '--max-drop', '1', '--summary']);
    assert.equal(r.status, 0, r.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a folder with no snapshot files is an error, not an empty result', () => {
  const dir = tempFolder({ 'notes.txt': 'no json here' });
  try {
    const r = run([dir, '--summary']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no \.json/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a single snapshot still runs but says there is nothing to compare', () => {
  const dir = tempFolder({ 'a.json': { captured_at: '2026-09-01T09:00:00+08:00', posts: [{ id: 'x', text: 't' }] } });
  try {
    const r = run([dir, '--summary']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /only one snapshot/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
