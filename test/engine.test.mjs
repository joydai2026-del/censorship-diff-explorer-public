// Tests for the diff engine. Written before the engine itself.
// Every timestamp here is made up for the test. None of these are real posts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import engine from '../src/engine.js';

const { diffSnapshots, localDate, parseTime, tagText } = engine;

// Small helpers so each test reads like a story.
const post = (id, extra = {}) => ({
  id,
  account: extra.account || 'test_account_a',
  posted_at: extra.posted_at || '2026-09-01T08:00:00+08:00',
  text: extra.text || `post ${id}`,
  ...extra,
});
const snap = (captured_at, posts, extra = {}) => ({ captured_at, posts, ...extra });

test('a post seen on day 1 and gone on day 2 is deleted, bucketed on day 2', () => {
  const r = diffSnapshots([
    snap('2026-09-01T09:00:00+08:00', [post('p1'), post('p2')]),
    snap('2026-09-02T09:00:00+08:00', [post('p2')]),
  ]);
  assert.equal(r.deleted.length, 1);
  const d = r.deleted[0];
  assert.equal(d.id, 'p1');
  assert.equal(d.last_seen, '2026-09-01T09:00:00+08:00');
  assert.equal(d.deleted_by, '2026-09-02T09:00:00+08:00');
  assert.equal(d.deleted_date, '2026-09-02');
  // posted 08:00 day 1, last seen 09:00 day 1, missing by 09:00 day 2
  assert.equal(d.hours_alive_min, 1);
  assert.equal(d.hours_alive_max, 25);
  const day2 = r.days.find((x) => x.date === '2026-09-02');
  assert.deepEqual(day2.deleted.map((x) => x.id), ['p1']);
  const day1 = r.days.find((x) => x.date === '2026-09-01');
  assert.equal(day1.deleted.length, 0);
});

test('days list covers every date in the window, including days with zero deletions', () => {
  const r = diffSnapshots([
    snap('2026-09-01T09:00:00+08:00', [post('p1')]),
    snap('2026-09-02T09:00:00+08:00', [post('p1')]),
    snap('2026-09-04T09:00:00+08:00', []),
  ], { maxDropRatio: 1 });
  assert.deepEqual(r.days.map((d) => d.date), ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']);
  assert.equal(r.days[2].deleted.length, 0);
  assert.equal(r.days[3].deleted.length, 1);
});

test('a post still present in the last snapshot is not deleted', () => {
  const r = diffSnapshots([
    snap('2026-09-01T09:00:00+08:00', [post('p1')]),
    snap('2026-09-02T09:00:00+08:00', [post('p1'), post('p2')]),
  ]);
  assert.equal(r.deleted.length, 0);
  assert.equal(r.stats.totalPosts, 2);
  assert.equal(r.stats.stillVisible, 2);
});

test('never-seen: a post first appearing in the final snapshot is not judged, and absent posts never show up', () => {
  const r = diffSnapshots([
    snap('2026-09-01T09:00:00+08:00', [post('p1')]),
    snap('2026-09-02T09:00:00+08:00', [post('p1'), post('late')]),
  ]);
  assert.equal(r.deleted.length, 0);
  assert.ok(!r.deleted.some((d) => d.id === 'ghost'));
  const late = r.posts.find((p) => p.id === 'late');
  assert.equal(late.status, 'visible');
  assert.equal(late.first_seen, '2026-09-02T09:00:00+08:00');
});

test('edited: same id with new text is an edit, not a deletion, and keeps every version', () => {
  const r = diffSnapshots([
    snap('2026-09-01T09:00:00+08:00', [post('p1', { text: '原文 version one' })]),
    snap('2026-09-02T09:00:00+08:00', [post('p1', { text: '改过 version two' })]),
    snap('2026-09-03T09:00:00+08:00', []),
  ], { maxDropRatio: 1 });
  assert.equal(r.deleted.length, 1);
  const d = r.deleted[0];
  assert.equal(d.edited, true);
  assert.equal(d.text, '原文 version one', 'shows the original text first seen');
  assert.deepEqual(d.text_versions.map((v) => v.text), ['原文 version one', '改过 version two']);
  assert.equal(d.text_versions[1].seen_at, '2026-09-02T09:00:00+08:00');
  assert.equal(r.stats.editedCount, 1);
});

test('edited and still visible is counted as edited, not deleted', () => {
  const r = diffSnapshots([
    snap('2026-09-01T09:00:00+08:00', [post('p1', { text: 'a' })]),
    snap('2026-09-02T09:00:00+08:00', [post('p1', { text: 'b' })]),
  ]);
  assert.equal(r.deleted.length, 0);
  assert.equal(r.posts[0].edited, true);
});

test('re-posted: same text under a new id after the original vanished links both ways', () => {
  const text = '同一段文字 the same words';
  const r = diffSnapshots([
    snap('2026-09-01T09:00:00+08:00', [post('orig', { text })]),
    snap('2026-09-02T09:00:00+08:00', [post('again', { text: `  ${text}\n`, account: 'test_account_b', posted_at: '2026-09-01T20:00:00+08:00' })]),
    snap('2026-09-03T09:00:00+08:00', []),
  ], { maxDropRatio: 1 });
  const orig = r.deleted.find((d) => d.id === 'orig');
  const again = r.deleted.find((d) => d.id === 'again');
  assert.deepEqual(orig.reposted_as, ['again']);
  assert.equal(again.repost_of, 'orig');
  assert.equal(orig.deleted_date, '2026-09-02');
  assert.equal(again.deleted_date, '2026-09-03');
  assert.equal(r.stats.repostCount, 1);
});

test('identical text posted at the same time is not called a re-post', () => {
  const r = diffSnapshots([
    snap('2026-09-01T09:00:00+08:00', [post('x', { text: 'hello' }), post('y', { text: 'hello' })]),
    snap('2026-09-02T09:00:00+08:00', []),
  ], { maxDropRatio: 1 });
  assert.ok(r.deleted.every((d) => d.reposted_as.length === 0 && d.repost_of === null));
});

test('restored: a post that vanishes and comes back is not deleted, but the gap is recorded', () => {
  const r = diffSnapshots([
    snap('2026-09-01T09:00:00+08:00', [post('p1'), post('k')]),
    snap('2026-09-02T09:00:00+08:00', [post('k')]),
    snap('2026-09-03T09:00:00+08:00', [post('p1'), post('k')]),
  ]);
  assert.equal(r.deleted.length, 0);
  const p1 = r.posts.find((p) => p.id === 'p1');
  assert.equal(p1.restored_count, 1);
  assert.equal(r.stats.restoredCount, 1);
});

test('restored then removed again: deletion date is the final disappearance', () => {
  const r = diffSnapshots([
    snap('2026-09-01T09:00:00+08:00', [post('p1'), post('k')]),
    snap('2026-09-02T09:00:00+08:00', [post('k')]),
    snap('2026-09-03T09:00:00+08:00', [post('p1'), post('k')]),
    snap('2026-09-04T09:00:00+08:00', [post('k')]),
  ]);
  assert.equal(r.deleted.length, 1);
  assert.equal(r.deleted[0].deleted_date, '2026-09-04');
  assert.equal(r.deleted[0].restored_count, 1);
});

test('Beijing midnight: 23:59 UTC+8 and 00:01 UTC+8 land on different days', () => {
  // 15:59Z = 23:59 Beijing on Sep 1. 16:01Z = 00:01 Beijing on Sep 2.
  assert.equal(localDate('2026-09-01T15:59:00Z'), '2026-09-01');
  assert.equal(localDate('2026-09-01T16:01:00Z'), '2026-09-02');
  assert.equal(localDate('2026-09-02T00:00:00+08:00'), '2026-09-02');
  assert.equal(localDate('2026-09-01T23:59:59+08:00'), '2026-09-01');
  // The same instant written in New York time.
  assert.equal(localDate('2026-09-01T12:01:00-04:00'), '2026-09-02');
});

test('Beijing midnight: a deletion seen at 00:30 Beijing (16:30Z the day before) is filed under the Beijing date', () => {
  const r = diffSnapshots([
    snap('2026-09-01T12:00:00Z', [post('p1', { posted_at: '2026-09-01T10:00:00Z' })]),
    snap('2026-09-01T16:30:00Z', []),
  ], { maxDropRatio: 1 });
  assert.equal(r.deleted[0].deleted_date, '2026-09-02');
  assert.deepEqual(r.days.map((d) => d.date), ['2026-09-01', '2026-09-02']);
  assert.equal(r.deleted[0].hours_alive_max, 6.5);
});

test('snapshots given out of order are sorted by real instant, not by string', () => {
  // 01:00+08:00 on Sep 2 is EARLIER than 20:00Z on Sep 1 (= 04:00 Beijing Sep 2).
  const r = diffSnapshots([
    snap('2026-09-01T20:00:00Z', []),
    snap('2026-09-02T01:00:00+08:00', [post('p1', { posted_at: '2026-09-01T23:00:00+08:00' })]),
  ], { maxDropRatio: 1 });
  assert.equal(r.deleted.length, 1);
  assert.equal(r.deleted[0].deleted_by, '2026-09-01T20:00:00Z');
});

test('a custom time zone offset changes the day bucket', () => {
  assert.equal(localDate('2026-09-01T16:01:00Z', 0), '2026-09-01');
  const r = diffSnapshots([
    snap('2026-09-01T12:00:00Z', [post('p1', { posted_at: '2026-09-01T10:00:00Z' })]),
    snap('2026-09-01T16:30:00Z', []),
  ], { maxDropRatio: 1, tzOffsetMinutes: 0 });
  assert.equal(r.deleted[0].deleted_date, '2026-09-01');
});

test('timestamps without a time zone are rejected, so days are never guessed', () => {
  assert.throws(() => parseTime('2026-09-01T09:00:00'), /time zone/);
  assert.throws(() => diffSnapshots([snap('2026-09-01 09:00', [])]), /time zone/);
  assert.throws(() => diffSnapshots([snap('2026-09-01T09:00:00+08:00', [post('p1', { posted_at: '2026-09-01T08:00' })])]), /time zone/);
  assert.throws(() => parseTime('not a date+08:00'), /time/);
});

test('bad input shapes give clear errors', () => {
  assert.throws(() => diffSnapshots('nope'), /array/);
  assert.throws(() => diffSnapshots([{ captured_at: '2026-09-01T09:00:00Z' }]), /posts/);
  assert.throws(() => diffSnapshots([snap('2026-09-01T09:00:00Z', [{ text: 'no id' }])]), /id/);
});

test('empty input gives an empty, well-formed result', () => {
  const r = diffSnapshots([]);
  assert.deepEqual(r.days, []);
  assert.deepEqual(r.deleted, []);
  assert.equal(r.stats.totalPosts, 0);
});

test('a snapshot that suddenly loses most posts is treated as a broken capture and skipped', () => {
  const many = Array.from({ length: 10 }, (_, i) => post(`p${i}`));
  const r = diffSnapshots([
    snap('2026-09-01T09:00:00+08:00', many),
    snap('2026-09-02T09:00:00+08:00', []),
    snap('2026-09-03T09:00:00+08:00', many.slice(1)),
  ]);
  assert.equal(r.meta.skippedSnapshots.length, 1);
  assert.equal(r.meta.skippedSnapshots[0].captured_at, '2026-09-02T09:00:00+08:00');
  assert.equal(r.deleted.length, 1);
  assert.equal(r.deleted[0].id, 'p0');
  assert.equal(r.deleted[0].deleted_date, '2026-09-03');
});

test('the broken-capture guard is a setting and can be turned off', () => {
  const many = Array.from({ length: 10 }, (_, i) => post(`p${i}`));
  const r = diffSnapshots([
    snap('2026-09-01T09:00:00+08:00', many),
    snap('2026-09-02T09:00:00+08:00', []),
  ], { maxDropRatio: 1 });
  assert.equal(r.meta.skippedSnapshots.length, 0);
  assert.equal(r.deleted.length, 10);
});

test('a big drop that the next capture confirms is real deletion, not a broken capture', () => {
  const many = Array.from({ length: 10 }, (_, i) => post(`p${i}`));
  const r = diffSnapshots([
    snap('2026-09-01T09:00:00+08:00', many),
    snap('2026-09-02T09:00:00+08:00', many.slice(0, 3)),
    snap('2026-09-03T09:00:00+08:00', many.slice(0, 3)),
  ]);
  assert.equal(r.meta.skippedSnapshots.length, 0);
  assert.equal(r.deleted.length, 7);
  assert.ok(r.deleted.every((d) => d.deleted_date === '2026-09-02'));
});

test('skipping one broken capture does not cascade into skipping every later one', () => {
  const many = Array.from({ length: 10 }, (_, i) => post(`p${i}`));
  const r = diffSnapshots([
    snap('2026-09-01T09:00:00+08:00', many),
    snap('2026-09-02T09:00:00+08:00', many.slice(0, 1)), // broken
    snap('2026-09-03T09:00:00+08:00', many.slice(0, 4)), // real: 6 deleted
    snap('2026-09-04T09:00:00+08:00', many.slice(0, 4)),
  ]);
  assert.deepEqual(r.meta.skippedSnapshots.map((s) => s.captured_at), ['2026-09-02T09:00:00+08:00']);
  assert.equal(r.deleted.length, 6);
  assert.ok(r.deleted.every((d) => d.deleted_date === '2026-09-03'));
});

test('a big drop in the very last capture is kept but flagged, since nothing can confirm it', () => {
  const many = Array.from({ length: 10 }, (_, i) => post(`p${i}`));
  const r = diffSnapshots([
    snap('2026-09-01T09:00:00+08:00', many),
    snap('2026-09-02T09:00:00+08:00', []),
  ]);
  assert.equal(r.meta.skippedSnapshots.length, 0);
  assert.equal(r.deleted.length, 10);
  assert.ok(r.meta.warnings.some((w) => /could not be confirmed/.test(w)));
});

test('accounts not crawled in a snapshot are not counted as deleted', () => {
  const r = diffSnapshots([
    snap('2026-09-01T09:00:00+08:00', [post('a1', { account: 'acc_a' }), post('b1', { account: 'acc_b' })], { accounts: ['acc_a', 'acc_b'] }),
    snap('2026-09-02T09:00:00+08:00', [post('a1', { account: 'acc_a' })], { accounts: ['acc_a'] }),
    snap('2026-09-03T09:00:00+08:00', [post('a1', { account: 'acc_a' }), post('b1', { account: 'acc_b' })], { accounts: ['acc_a', 'acc_b'] }),
  ]);
  assert.equal(r.deleted.length, 0);
  assert.equal(r.posts.find((p) => p.id === 'b1').restored_count, 0);
});

test('duplicate ids inside one snapshot are merged with a warning', () => {
  const r = diffSnapshots([
    snap('2026-09-01T09:00:00+08:00', [post('p1'), post('p1')]),
    snap('2026-09-02T09:00:00+08:00', [post('p1')]),
  ]);
  assert.equal(r.stats.totalPosts, 1);
  assert.ok(r.meta.warnings.some((w) => /duplicate/i.test(w)));
});

test('missing posted_at falls back to first seen time for survival hours', () => {
  const r = diffSnapshots([
    snap('2026-09-01T09:00:00+08:00', [{ id: 'p1', account: 'a', text: 't' }]),
    snap('2026-09-01T15:00:00+08:00', []),
  ], { maxDropRatio: 1 });
  assert.equal(r.deleted[0].hours_alive_min, 0);
  assert.equal(r.deleted[0].hours_alive_max, 6);
  assert.equal(r.deleted[0].posted_at, null);
});

test('sample flag and notice are carried into the result metadata', () => {
  const r = diffSnapshots([
    snap('2026-09-01T09:00:00+08:00', [], { sample: true, notice: 'Sample data for demo, not real posts' }),
  ]);
  assert.equal(r.meta.sample, true);
  assert.equal(r.meta.notice, 'Sample data for demo, not real posts');
});

test('tagText finds Chinese and English keywords without word boundaries, case-insensitive', () => {
  const lexicon = { topics: [
    { id: 'env', label_en: 'Environment', label_zh: '环境', keywords: ['污染', 'pollution'] },
    { id: 'food', label_en: 'Food safety', label_zh: '食品安全', keywords: ['奶粉'] },
  ] };
  const t = tagText('河水被污染了 POLLUTION again', lexicon);
  assert.deepEqual(t.tags, ['env']);
  assert.deepEqual(t.keywords.sort(), ['pollution', '污染'].sort());
  assert.deepEqual(tagText('nothing here', lexicon), { tags: [], keywords: [] });
  assert.deepEqual(tagText('anything', undefined), { tags: [], keywords: [] });
});

test('deleted records carry tags from the lexicon, matched on text and gloss', () => {
  const lexicon = { topics: [{ id: 'env', label_en: 'Environment', label_zh: '环境', keywords: ['污染', 'smoke'] }] };
  const r = diffSnapshots([
    snap('2026-09-01T09:00:00+08:00', [post('p1', { text: '工厂排放', gloss: 'black smoke from the plant' })]),
    snap('2026-09-02T09:00:00+08:00', []),
  ], { lexicon, maxDropRatio: 1 });
  assert.deepEqual(r.deleted[0].tags, ['env']);
  assert.deepEqual(r.meta.topics.map((t) => t.id), ['env']);
});

test('stats report median survival hours over deleted posts', () => {
  const r = diffSnapshots([
    snap('2026-09-01T09:00:00+08:00', [
      post('a', { posted_at: '2026-09-01T08:00:00+08:00' }),
      post('b', { posted_at: '2026-09-01T07:00:00+08:00' }),
      post('c', { posted_at: '2026-09-01T03:00:00+08:00' }),
    ]),
    snap('2026-09-01T10:00:00+08:00', []),
  ], { maxDropRatio: 1 });
  // max hours: a=2, b=3, c=7. Median = 3.
  assert.equal(r.stats.medianHoursAliveMax, 3);
  assert.equal(r.stats.deletedCount, 3);
});

test('the function does not change its input', () => {
  const input = [
    snap('2026-09-01T09:00:00+08:00', [post('p1')]),
    snap('2026-09-02T09:00:00+08:00', []),
  ];
  const copy = JSON.parse(JSON.stringify(input));
  diffSnapshots(input, { maxDropRatio: 1 });
  assert.deepEqual(input, copy);
});

// ---- Found in the Codex adversarial review ----
const d = (day) => `2026-09-0${day}T09:00:00+08:00`;

test('re-post is judged by the text the new post first appeared with', () => {
  // b first appears with the same words, later edited: still a re-post.
  let r = diffSnapshots([snap(d(1), [post('a', { text: 'same' })]), snap(d(2), [post('b', { text: 'same' })]), snap(d(3), [post('b', { text: 'different' })])], { maxDropRatio: 1 });
  assert.equal(r.posts.find((p) => p.id === 'b').repost_of, 'a');
  // b first appears with other words and is edited to match later: not a re-post.
  r = diffSnapshots([snap(d(1), [post('a', { text: 'same' })]), snap(d(2), [post('b', { text: 'different' })]), snap(d(3), [post('b', { text: 'same' })])], { maxDropRatio: 1 });
  assert.equal(r.posts.find((p) => p.id === 'b').repost_of, null);
});

test('re-post needs the original to be gone already, not just unobserved', () => {
  const r = diffSnapshots([
    snap(d(1), [post('a', { text: 'same', account: 'A' })]),
    snap(d(2), [post('b', { text: 'same', account: 'B' })], { accounts: ['B'] }),
    snap(d(3), [post('b', { text: 'same', account: 'B' })], { accounts: ['A', 'B'] }),
  ], { maxDropRatio: 1 });
  assert.equal(r.posts.find((p) => p.id === 'b').repost_of, null);
});

test('duplicate ids do not water down the broken-capture check', () => {
  const many = Array.from({ length: 10 }, (_, i) => post(`p${i}`));
  const r = diffSnapshots([snap(d(1), [...many, ...many]), snap(d(2), []), snap(d(3), many.slice(1))]);
  assert.equal(r.meta.skippedSnapshots.length, 1);
  assert.equal(r.deleted[0].deleted_date, '2026-09-03');
});

test('a capture that covered other accounts does not reset the broken-capture check', () => {
  const many = Array.from({ length: 10 }, (_, i) => post(`p${i}`, { account: 'a' }));
  const r = diffSnapshots([
    snap(d(1), many, { accounts: ['a'] }),
    snap(d(2), [], { accounts: ['B'] }),
    snap(d(3), [], { accounts: ['a'] }), // broken
    snap(d(4), many.slice(1), { accounts: ['a'] }),
  ]);
  assert.deepEqual(r.meta.skippedSnapshots.map((x) => x.captured_at), [d(3)]);
  assert.equal(r.deleted.length, 1);
  assert.equal(r.stats.restoredCount, 0);
});

test('text, gloss, and account must be plain text', () => {
  assert.throws(() => diffSnapshots([snap(d(1), [post('x', { text: { oops: true } })])]), /text/);
  assert.throws(() => diffSnapshots([snap(d(1), [post('x', { gloss: 5 })])]), /gloss/);
  assert.throws(() => diffSnapshots([snap(d(1), [post('x', { account: ['a'] })])]), /account/);
  assert.throws(() => diffSnapshots([snap(d(1), [], { accounts: 'a' })]), /accounts/);
});

// ---- Found in the second Codex round ----
test('a re-post link survives the original coming back, and needs capture order', () => {
  let r = diffSnapshots([
    snap(d(1), [post('a', { text: 'same' })]),
    snap(d(2), [post('b', { text: 'same' })]),
    snap(d(3), [post('a', { text: 'same' }), post('b', { text: 'same' })]),
    snap(d(4), [post('b', { text: 'same' })]),
  ], { maxDropRatio: 1 });
  assert.equal(r.posts.find((p) => p.id === 'b').repost_of, 'a');
  assert.deepEqual(r.posts.find((p) => p.id === 'a').reposted_as, ['b']);
  // Same timestamp three times: A first, then B, then neither. No links either way.
  const at = d(1);
  r = diffSnapshots([snap(at, [post('a', { text: 'same' })]), snap(at, [post('a', { text: 'same' }), post('b', { text: 'same' })]), snap(at, [])], { maxDropRatio: 1 });
  assert.ok(r.posts.every((p) => p.repost_of === null && p.reposted_as.length === 0));
});

test('the guard and the main pass agree on which duplicate copy counts', () => {
  const five = Array.from({ length: 5 }, (_, i) => post(`p${i}`, { account: 'A' }));
  const dupes = Array.from({ length: 5 }, (_, i) => post(`p${i}`, { account: 'B' }));
  const r = diffSnapshots([
    snap(d(1), [...five, ...dupes]),
    snap(d(2), [], { accounts: ['A'] }),
    snap(d(3), five),
  ]);
  assert.equal(r.meta.skippedSnapshots.length, 1);
  assert.equal(r.stats.restoredCount, 0);
});

// ---- Found in the hands-on UX audit (2026-10-21) ----

test('a snapshot with no captured_at says the field is missing, not "undefined"', () => {
  assert.throws(() => diffSnapshots([{ hello: 'world' }]), (e) => /captured_at/.test(e.message) && /missing/.test(e.message) && !/undefined/.test(e.message));
});
