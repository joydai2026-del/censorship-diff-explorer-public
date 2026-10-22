/*
 * Censorship Diff Explorer: the diff engine.
 *
 * Idea in one line: if a post is in today's snapshot and missing from the next
 * one, it was deleted somewhere in between.
 *
 * This file is plain JavaScript with no dependencies. It runs in Node (for the
 * command line and the tests) and in the browser (for the web page), so the
 * page and an agent always get the same answer from the same code.
 *
 * Everything here is a pure function: same input, same output, input untouched.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CDE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // China has one time zone (UTC+8) and no daylight saving, so a fixed
  // offset is exact. It is still a setting, so other platforms can reuse this.
  const DEFAULTS = Object.freeze({
    tzOffsetMinutes: 480,
    // A capture that loses more than this share of the posts it should still
    // see is treated as a broken scrape, not mass deletion. Set 1 to disable.
    maxDropRatio: 0.5,
    // The guard only kicks in once the previous capture had this many posts.
    minPostsForDropCheck: 5,
    // ...and only if more than this share of the vanished posts reappear in the
    // very next capture. Real censorship rarely restores posts, so a quick
    // return means the capture missed them, not that they were deleted.
    minReturnRatio: 0.25,
    lexicon: null,
  });

  const HOUR_MS = 3600 * 1000;
  const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

  /** Parse an ISO timestamp. It must say its time zone, or we refuse. */
  function parseTime(value, label) {
    const what = label || 'timestamp';
    if (typeof value !== 'string' || !HAS_ZONE.test(value.trim())) {
      throw new Error(`${what} "${value}" has no time zone. Write it like 2026-09-01T09:00:00+08:00 or ...Z`);
    }
    const ms = Date.parse(value.trim());
    if (Number.isNaN(ms)) throw new Error(`${what} "${value}" is not a valid time`);
    return ms;
  }

  /** Calendar date (YYYY-MM-DD) of an instant, in the given zone (default Beijing). */
  function localDate(value, tzOffsetMinutes) {
    const offset = tzOffsetMinutes === undefined ? DEFAULTS.tzOffsetMinutes : tzOffsetMinutes;
    const ms = typeof value === 'number' ? value : parseTime(value);
    return new Date(ms + offset * 60 * 1000).toISOString().slice(0, 10);
  }

  function addDays(dateStr, n) {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  /** Which topics does a piece of text touch? Plain substring match (Chinese has no spaces). */
  function tagText(text, lexicon) {
    const out = { tags: [], keywords: [] };
    if (!lexicon || !Array.isArray(lexicon.topics) || typeof text !== 'string') return out;
    const hay = text.toLowerCase();
    for (const topic of lexicon.topics) {
      let hit = false;
      for (const kw of topic.keywords || []) {
        const k = String(kw).toLowerCase();
        if (k && hay.includes(k)) {
          hit = true;
          if (!out.keywords.includes(kw)) out.keywords.push(kw);
        }
      }
      if (hit) out.tags.push(topic.id);
    }
    return out;
  }

  // Whitespace differences should not stop us spotting the same words re-posted.
  const normalize = (t) => String(t || '').replace(/\s+/g, ' ').trim();

  const round2 = (x) => Math.round(x * 100) / 100;

  function median(nums) {
    if (!nums.length) return null;
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : round2((s[mid - 1] + s[mid]) / 2);
  }

  function validate(snapshots) {
    if (!Array.isArray(snapshots)) throw new Error('snapshots must be an array of snapshot objects');
    return snapshots.map((s, i) => {
      if (!s || typeof s !== 'object') throw new Error(`snapshot #${i + 1} is not an object`);
      if (s.captured_at === undefined || s.captured_at === null || s.captured_at === '') {
        throw new Error(`snapshot #${i + 1} is missing captured_at (the time it was taken, like 2026-09-01T09:00:00+08:00)`);
      }
      const at = parseTime(s.captured_at, `snapshot #${i + 1} captured_at`);
      if (!Array.isArray(s.posts)) throw new Error(`snapshot ${s.captured_at} has no posts array`);
      if (s.accounts !== undefined && !Array.isArray(s.accounts)) throw new Error(`snapshot ${s.captured_at}: accounts must be a list`);
      s.posts.forEach((p, j) => {
        if (!p || (typeof p.id !== 'string' && typeof p.id !== 'number') || p.id === '') {
          throw new Error(`snapshot ${s.captured_at}, post #${j + 1} has no id`);
        }
        if (p.posted_at !== undefined && p.posted_at !== null) parseTime(p.posted_at, `post ${p.id} posted_at`);
        for (const field of ['text', 'gloss', 'account']) {
          if (p[field] !== undefined && p[field] !== null && typeof p[field] !== 'string') {
            throw new Error(`snapshot ${s.captured_at}, post ${p.id}: ${field} must be text`);
          }
        }
      });
      return { raw: s, at, index: i };
    });
  }

  const inScopeOf = (cap) => {
    const scope = Array.isArray(cap.raw.accounts) ? new Set(cap.raw.accounts) : null;
    return (acc) => !scope || scope.has(acc);
  };

  /**
   * Broken-capture guard. A scraper that fails half way makes it look like
   * everything was deleted. We call a capture broken only when (1) a large
   * share of the posts we expected to see are missing, AND (2) a fair share of
   * those posts come back in the very next capture. Real deletions stay gone,
   * so they are never thrown away. A big drop in the last capture cannot be
   * checked, so it is kept and flagged.
   *
   * "Expected to see" is tracked the same way the main pass tracks it: every
   * post still visible as of the last trusted capture, limited to the accounts
   * this capture says it covered.
   */
  function findBrokenCaptures(caps, opt, skipped, warnings) {
    const broken = new Set();
    if (opt.maxDropRatio >= 1) return broken;
    const visible = new Map(); // id -> account, as of the last trusted capture
    for (let i = 0; i < caps.length; i++) {
      const cap = caps[i];
      const now = new Set(cap.raw.posts.map((p) => String(p.id)));
      const inScope = inScopeOf(cap);
      const vanished = [];
      let expected = 0;
      for (const [id, acc] of visible) {
        if (!inScope(acc)) continue;
        expected += 1;
        if (!now.has(id)) vanished.push(id);
      }
      if (expected >= opt.minPostsForDropCheck && vanished.length / expected > opt.maxDropRatio) {
        const next = caps[i + 1];
        if (!next) {
          warnings.push(`${vanished.length} of ${expected} posts vanished in the last capture (${cap.raw.captured_at}). This could not be confirmed by a later capture.`);
        } else {
          const nextIds = new Set(next.raw.posts.map((p) => String(p.id)));
          const back = vanished.filter((id) => nextIds.has(id)).length;
          if (back / vanished.length > opt.minReturnRatio) {
            broken.add(cap);
            skipped.push({
              captured_at: cap.raw.captured_at,
              reason: `${vanished.length} of ${expected} posts vanished at once and ${back} came back in the next capture, so this looks like a broken capture and was ignored`,
            });
            continue;
          }
        }
      }
      const firstCopy = new Set();
      for (const p of cap.raw.posts) {
        const id = String(p.id);
        if (firstCopy.has(id)) continue; // same rule as the main pass: the first copy counts
        firstCopy.add(id);
        if (!visible.has(id)) visible.set(id, p.account || null);
      }
      for (const [id, acc] of [...visible]) if (inScope(acc) && !now.has(id)) visible.delete(id);
    }
    return broken;
  }

  /**
   * Compare snapshots in time order and report what disappeared.
   * @param {Array} snapshots  [{captured_at, posts:[{id, account, posted_at, text, gloss}], accounts?, sample?, notice?, platform?}]
   * @param {Object} options   see DEFAULTS
   */
  function diffSnapshots(snapshots, options) {
    const opt = Object.assign({}, DEFAULTS, options || {});
    const caps = validate(snapshots).sort((a, b) => a.at - b.at || a.index - b.index);
    const warnings = [];
    const skippedSnapshots = [];
    const meta = {
      sample: caps.some((c) => c.raw.sample === true),
      notice: (caps.find((c) => c.raw.notice) || { raw: {} }).raw.notice || null,
      platform: (caps.find((c) => c.raw.platform) || { raw: {} }).raw.platform || null,
      snapshotCount: caps.length,
      firstCapture: caps.length ? caps[0].raw.captured_at : null,
      lastCapture: caps.length ? caps[caps.length - 1].raw.captured_at : null,
      tzOffsetMinutes: opt.tzOffsetMinutes,
      topics: opt.lexicon && Array.isArray(opt.lexicon.topics)
        ? opt.lexicon.topics.map((t) => ({ id: t.id, label_en: t.label_en, label_zh: t.label_zh }))
        : [],
      skippedSnapshots,
      warnings,
    };

    const broken = findBrokenCaptures(caps, opt, skippedSnapshots, warnings);

    // id -> tracking record
    const track = new Map();
    // normalized text -> ids that have shown those words (any version)
    const textIndex = new Map();
    const indexText = (id, text) => {
      const key = normalize(text);
      if (!key) return;
      if (!textIndex.has(key)) textIndex.set(key, new Set());
      textIndex.get(key).add(id);
    };

    for (const cap of caps) {
      const s = cap.raw;
      const scope = Array.isArray(s.accounts) ? new Set(s.accounts) : null;
      const inScope = (acc) => !scope || scope.has(acc);

      // De-duplicate ids within this capture.
      const here = new Map();
      for (const p of s.posts) {
        const id = String(p.id);
        if (here.has(id)) {
          warnings.push(`duplicate post id ${id} in snapshot ${s.captured_at}; kept the first copy`);
          continue;
        }
        here.set(id, p);
      }

      if (broken.has(cap)) continue;

      // Posts present now.
      const fresh = [];
      for (const [id, p] of here) {
        let t = track.get(id);
        if (!t) {
          fresh.push(id);
          t = {
            id,
            account: p.account || null,
            posted_at: p.posted_at || null,
            postedMs: p.posted_at ? parseTime(p.posted_at) : null,
            gloss: p.gloss || null,
            first_seen: s.captured_at,
            firstMs: cap.at,
            last_seen: s.captured_at,
            lastMs: cap.at,
            versions: [{ text: p.text || '', seen_at: s.captured_at }],
            visible: true,
            gone_at: null,
            goneMs: null,
            restored_count: 0,
            repost_of: null,
            reposted_as: [],
          };
          track.set(id, t);
          indexText(t.id, p.text);
        } else {
          if (!t.visible) {
            t.restored_count += 1;
            t.visible = true;
            t.gone_at = null;
            t.goneMs = null;
          }
          const latest = t.versions[t.versions.length - 1].text;
          if ((p.text || '') !== latest) {
            t.versions.push({ text: p.text || '', seen_at: s.captured_at });
            indexText(t.id, p.text);
          }
          if (!t.gloss && p.gloss) t.gloss = p.gloss;
          t.last_seen = s.captured_at;
          t.lastMs = cap.at;
        }
      }

      // Posts that were visible and are missing now (only for crawled accounts).
      for (const t of track.values()) {
        if (t.visible && !here.has(t.id) && inScope(t.account)) {
          t.visible = false;
          t.gone_at = s.captured_at;
          t.goneMs = cap.at;
        }
      }

      // Re-posts, judged at the moment the new post first shows up: its first
      // words match any version of an older post that is missing right now.
      for (const id of fresh) {
        const t = track.get(id);
        const ids = textIndex.get(normalize(t.versions[0].text));
        if (!ids) continue;
        let best = null;
        for (const otherId of ids) {
          const o = track.get(otherId);
          if (o === t || o.visible || fresh.includes(otherId)) continue;
          if (!best || o.goneMs > best.goneMs) best = o;
        }
        if (best) {
          t.repost_of = best.id;
          best.reposted_as.push(t.id);
        }
      }
    }

    const lexicon = opt.lexicon;
    const posts = [];
    for (const t of track.values()) {
      const start = t.postedMs !== null ? t.postedMs : t.firstMs;
      const textAll = t.versions.map((v) => v.text).join('\n') + (t.gloss ? `\n${t.gloss}` : '');
      const tagged = tagText(textAll, lexicon);
      const rec = {
        id: t.id,
        account: t.account,
        text: t.versions[0].text,
        text_versions: t.versions.map((v) => ({ ...v })),
        gloss: t.gloss,
        posted_at: t.posted_at,
        first_seen: t.first_seen,
        last_seen: t.last_seen,
        status: t.visible ? 'visible' : 'deleted',
        deleted_by: t.visible ? null : t.gone_at,
        deleted_date: t.visible ? null : localDate(t.goneMs, opt.tzOffsetMinutes),
        // We only know the deletion happened between two captures, so give both ends.
        hours_alive_min: t.visible ? null : round2(Math.max(0, t.lastMs - start) / HOUR_MS),
        hours_alive_max: t.visible ? null : round2(Math.max(0, t.goneMs - start) / HOUR_MS),
        edited: t.versions.length > 1,
        restored_count: t.restored_count,
        reposted_as: [...t.reposted_as],
        repost_of: t.repost_of,
        tags: tagged.tags,
        keywords: tagged.keywords,
        _firstMs: t.firstMs,
        _lastMs: t.lastMs,
      };
      posts.push(rec);
    }

    posts.sort((a, b) => a._firstMs - b._firstMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const p of posts) {
      delete p._firstMs;
      delete p._lastMs;
    }

    const deleted = posts
      .filter((p) => p.status === 'deleted')
      .sort((a, b) => parseTime(a.deleted_by) - parseTime(b.deleted_by) || (a.id < b.id ? -1 : 1));

    // One entry per calendar day in the window, even when nothing was deleted.
    const kept = caps.filter((c) => !broken.has(c));
    const days = [];
    if (kept.length) {
      const first = localDate(kept[0].at, opt.tzOffsetMinutes);
      const last = localDate(kept[kept.length - 1].at, opt.tzOffsetMinutes);
      for (let d = first; d <= last; d = addDays(d, 1)) {
        days.push({ date: d, deleted: deleted.filter((p) => p.deleted_date === d) });
      }
    }

    const stats = {
      totalPosts: posts.length,
      deletedCount: deleted.length,
      stillVisible: posts.length - deleted.length,
      editedCount: posts.filter((p) => p.edited).length,
      repostCount: posts.filter((p) => p.repost_of !== null).length,
      restoredCount: posts.filter((p) => p.restored_count > 0).length,
      medianHoursAliveMax: median(deleted.map((p) => p.hours_alive_max)),
    };

    return { meta, days, deleted, posts, stats };
  }

  return { diffSnapshots, tagText, localDate, parseTime, DEFAULTS };
});
