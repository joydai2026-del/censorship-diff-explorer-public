// Real headless-browser tests of the web page, at desktop and phone size.
// The page is opened straight from disk (file://), the same way a person would
// double-click web/index.html.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch, findChrome } from './helpers/cdp.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pageUrl = `${pathToFileURL(join(root, 'web', 'index.html')).href}?silent=1`;
const shots = join(root, 'test-output');
const skip = findChrome() ? false : 'no headless Chrome found (set CHROME_PATH)';

let browser;
before(async () => {
  if (skip) return;
  mkdirSync(shots, { recursive: true });
  browser = await launch();
});
after(async () => { if (browser) await browser.close(); });

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 375, height: 812, mobile: true, scale: 2 },
];

const $count = (sel) => `document.querySelectorAll(${JSON.stringify(sel)}).length`;
const $text = (sel) => `(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`;
const settle = 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))';

for (const vp of VIEWPORTS) {
  test(`${vp.name}: sample page shows the banner, chart, and posts`, { skip }, async () => {
    const page = await browser.newPage(vp);
    try {
      await page.goto(pageUrl);
      // Banner, in English by default.
      assert.match(await page.eval($text('[data-testid=sample-banner]')), /Sample data for demo, not real posts/);
      assert.equal(await page.eval('document.documentElement.lang'), 'en');
      // One bar per day in the sample window (Sep 1 to Sep 8).
      assert.equal(await page.eval($count('[data-testid=day-bar]')), 8);
      const total = await page.eval('[...document.querySelectorAll("[data-testid=day-bar]")].reduce((n, b) => n + Number(b.dataset.count), 0)');
      assert.equal(total, 19);
      // Starts on all days: every deleted post listed.
      assert.equal(await page.eval($count('[data-testid=post-card]')), 19);
      assert.match(await page.eval($text('[data-testid=stat-deleted]')), /19/);
      // Chinese text is marked as Chinese and uses a CJK font.
      const zh = await page.eval('(() => { const el = document.querySelector("[data-testid=post-text]"); return { lang: el.lang, font: getComputedStyle(el).fontFamily }; })()');
      assert.equal(zh.lang, 'zh-Hans');
      assert.match(zh.font, /PingFang SC|Noto Sans SC|Hiragino Sans GB|Microsoft YaHei/);
      // The broken capture is explained, not hidden.
      assert.match(await page.eval($text('[data-testid=notes]')), /ignored/i);
      // No sideways scrolling of the whole page.
      assert.ok(await page.eval('document.documentElement.scrollWidth <= window.innerWidth'), 'page scrolls sideways');
      await page.screenshot(join(shots, `${vp.name}-all.png`));
      await page.screenshot(join(shots, `${vp.name}-first-screen.png`), false);
      assert.deepEqual(page.errors, []);
    } finally { await page.close(); }
  });

  test(`${vp.name}: clicking a day shows only that day's deleted posts`, { skip }, async () => {
    const page = await browser.newPage(vp);
    try {
      await page.goto(pageUrl);
      // A real pointer click (or tap on mobile) at the bar's position on screen.
      const box = await page.eval('(() => { const b = document.querySelector("[data-testid=day-bar][data-date=\\"2026-09-06\\"]"); b.scrollIntoView({ block: "center" }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height - 4 }; })()');
      if (vp.mobile) await page.tap(box.x, box.y); else await page.click(box.x, box.y);
      await page.eval(settle);
      assert.equal(await page.eval($count('[data-testid=post-card]')), 7);
      assert.match(await page.eval($text('[data-testid=list-heading]')), /Sep 6/);
      assert.equal(await page.eval('document.querySelector("[data-testid=day-bar][data-date=\\"2026-09-06\\"]").getAttribute("aria-pressed")'), 'true');
      assert.match(location(await page.eval('location.hash')), /day=2026-09-06/);
      // Each card shows account, times, and how long it stayed up.
      const card = await page.eval($text('[data-testid=post-card]'));
      assert.match(card, /sample_/);
      assert.match(card, /Posted/);
      assert.match(card, /Gone by/);
      assert.match(card, /Online for/);
      // The 00:20 Beijing capture time is shown in Beijing time.
      assert.match(await page.eval('document.body.textContent'), /Sep 6, 00:20/);
      await page.screenshot(join(shots, `${vp.name}-day.png`));
      // Keyboard works too: Enter on another bar.
      await page.eval('(() => { const b = document.querySelector("[data-testid=day-bar][data-date=\\"2026-09-02\\"]"); b.focus(); b.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); })()');
      await page.eval(settle);
      assert.equal(await page.eval($count('[data-testid=post-card]')), 1);
      // "All days" goes back.
      await page.eval('document.querySelector("[data-testid=all-days]").click()');
      await page.eval(settle);
      assert.equal(await page.eval($count('[data-testid=post-card]')), 19);
      assert.deepEqual(page.errors, []);
    } finally { await page.close(); }
  });

  test(`${vp.name}: search and topic filter narrow the list`, { skip }, async () => {
    const page = await browser.newPage(vp);
    try {
      await page.goto(pageUrl);
      const type = (q) => page.eval(`(() => { const i = document.querySelector("[data-testid=search]"); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
      await type('奶粉');
      await page.eval(settle);
      assert.equal(await page.eval($count('[data-testid=post-card]')), 1);
      await type('WAGES'); // matches the English gloss, any case
      await page.eval(settle);
      assert.ok(await page.eval($count('[data-testid=post-card]')) >= 2);
      await type('no such words at all');
      await page.eval(settle);
      assert.equal(await page.eval($count('[data-testid=post-card]')), 0);
      assert.match(await page.eval($text('[data-testid=empty]')), /No deleted posts match/);
      await type('');
      await page.eval('document.querySelector("[data-testid=topic-chip][data-topic=food]").click()');
      await page.eval(settle);
      const n = await page.eval($count('[data-testid=post-card]'));
      assert.ok(n >= 1 && n < 19);
      assert.ok(await page.eval('[...document.querySelectorAll("[data-testid=post-card]")].every((c) => c.dataset.tags.split(" ").includes("food"))'));
      // The chart follows the filter.
      const total = await page.eval('[...document.querySelectorAll("[data-testid=day-bar]")].reduce((s, b) => s + Number(b.dataset.count), 0)');
      assert.equal(total, n);
      // English gloss can be hidden.
      await page.eval('document.querySelector("[data-testid=gloss-toggle]").click()');
      await page.eval(settle);
      assert.equal(await page.eval($count('[data-testid=post-gloss]')), 0);
      assert.deepEqual(page.errors, []);
    } finally { await page.close(); }
  });

  test(`${vp.name}: language switch shows Chinese labels`, { skip }, async () => {
    const page = await browser.newPage(vp);
    try {
      await page.goto(pageUrl);
      await page.eval('document.querySelector("[data-testid=lang-toggle]").click()');
      await page.eval(settle);
      assert.equal(await page.eval('document.documentElement.lang'), 'zh-Hans');
      assert.match(await page.eval($text('[data-testid=sample-banner]')), /示例数据/);
      assert.match(await page.eval($text('h1')), /删帖/);
      assert.ok(await page.eval('document.documentElement.scrollWidth <= window.innerWidth'));
      await page.screenshot(join(shots, `${vp.name}-zh.png`));
      assert.deepEqual(page.errors, []);
    } finally { await page.close(); }
  });
}

test('loading your own snapshot files runs the diff in the browser', { skip }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cde-ui-'));
  try {
    const a = join(dir, 'a.json');
    const b = join(dir, 'b.json');
    writeFileSync(a, JSON.stringify({ captured_at: '2026-09-01T09:00:00+08:00', posts: [
      { id: 'u1', account: 'my_test_account', text: '<img src=x onerror=alert(1)>工厂黑烟', posted_at: '2026-09-01T08:00:00+08:00' },
      { id: 'u2', account: 'my_test_account', text: '还在', posted_at: '2026-09-01T08:00:00+08:00' },
    ] }));
    writeFileSync(b, JSON.stringify({ captured_at: '2026-09-02T09:00:00+08:00', posts: [
      { id: 'u2', account: 'my_test_account', text: '还在', posted_at: '2026-09-01T08:00:00+08:00' },
    ] }));
    const page = await browser.newPage(VIEWPORTS[1]);
    try {
      await page.goto(pageUrl);
      await page.setFiles('[data-testid=file-input]', [a, b]);
      await page.eval('new Promise((r) => setTimeout(r, 300))');
      assert.equal(await page.eval($count('[data-testid=sample-banner]')), 0, 'banner hides for your own data');
      assert.equal(await page.eval($count('[data-testid=day-bar]')), 2);
      assert.equal(await page.eval($count('[data-testid=post-card]')), 1);
      // Text from files is shown as text, never run as HTML.
      assert.equal(await page.eval('document.querySelectorAll("[data-testid=post-card] img").length'), 0);
      assert.match(await page.eval($text('[data-testid=post-text]')), /<img src=x/);
      // Topic tags still work offline (keyword list ships with the page).
      assert.match(await page.eval('document.querySelector("[data-testid=post-card]").dataset.tags'), /environment/);
      // A broken file gives a friendly message instead of a blank page.
      const bad = join(dir, 'bad.json');
      writeFileSync(bad, JSON.stringify({ captured_at: '2026-09-03 09:00', posts: [] }));
      await page.setFiles('[data-testid=file-input]', [bad]);
      await page.eval('new Promise((r) => setTimeout(r, 300))');
      assert.match(await page.eval($text('[data-testid=load-error]')), /time zone/);
      assert.equal(await page.eval($count('[data-testid=post-card]')), 1, 'old view kept after a bad load');
      // Wrong field types are refused, and the page keeps working afterwards.
      const odd = join(dir, 'odd.json');
      writeFileSync(odd, JSON.stringify({ captured_at: '2026-09-03T09:00:00+08:00', posts: [{ id: 'z', account: { toString: null }, text: 'x' }] }));
      await page.setFiles('[data-testid=file-input]', [odd]);
      await page.eval('new Promise((r) => setTimeout(r, 300))');
      assert.match(await page.eval($text('[data-testid=load-error]')), /account must be text/);
      await page.eval('document.querySelector("[data-testid=lang-toggle]").click()');
      assert.equal(await page.eval($count('[data-testid=post-card]')), 1);
      assert.deepEqual(page.errors, []);
    } finally { await page.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('opening a shared link with #day= selects that day', { skip }, async () => {
  const page = await browser.newPage(VIEWPORTS[0]);
  try {
    await page.goto(`${pageUrl}#day=2026-09-04`);
    assert.equal(await page.eval($count('[data-testid=post-card]')), 4);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

// ---- Found in the hands-on UX audit (2026-10-21) ----

test('a shared link with an unknown #topic= is ignored instead of hiding every post', { skip }, async () => {
  const page = await browser.newPage(VIEWPORTS[0]);
  try {
    await page.goto(`${pageUrl}#topic=doesnotexist`);
    assert.equal(await page.eval($count('[data-testid=post-card]')), 19);
    assert.equal(await page.eval($count('[data-testid=topic-chip][data-topic=all][aria-pressed=true]')), 1);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('keyboard: choosing a day bar or a topic chip keeps focus on it', { skip }, async () => {
  const page = await browser.newPage(VIEWPORTS[0]);
  try {
    await page.goto(pageUrl);
    await page.eval(`(() => { const b = document.querySelector('[data-testid=day-bar][data-date="2026-09-03"]'); b.focus();
      b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
    assert.equal(await page.eval($count('[data-testid=post-card]')), 2);
    assert.equal(await page.eval('document.activeElement.dataset.date || document.activeElement.tagName'), '2026-09-03');
    await page.eval(`(() => { const c = document.querySelector('[data-testid=topic-chip][data-topic=environment]'); c.focus(); c.click(); })()`);
    assert.equal(await page.eval('document.activeElement.dataset.topic || document.activeElement.tagName'), 'environment');
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('own files: one file says there is nothing to compare; a bad file is named', { skip }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cde-ui-'));
  try {
    const one = join(dir, 'only.json');
    writeFileSync(one, JSON.stringify({ captured_at: '2026-09-01T09:00:00+08:00', posts: [{ id: 'u1', text: 'x' }] }));
    const shape = join(dir, 'not-a-snapshot.json');
    writeFileSync(shape, JSON.stringify({ hello: 'world' }));
    const page = await browser.newPage(VIEWPORTS[1]);
    try {
      await page.goto(pageUrl);
      await page.setFiles('[data-testid=file-input]', [one]);
      await page.eval('new Promise((r) => setTimeout(r, 300))');
      const empty = await page.eval($text('[data-testid=empty]'));
      assert.match(empty, /one capture/i);
      assert.doesNotMatch(empty, /another word/i, 'no search is active, so do not tell people to change it');
      assert.match(await page.eval($text('[data-testid=notes]')), /your 1 file\./);
      await page.setFiles('[data-testid=file-input]', [one, shape]);
      await page.eval('new Promise((r) => setTimeout(r, 300))');
      const err = await page.eval($text('[data-testid=load-error]'));
      assert.match(err, /not-a-snapshot\.json/);
      assert.doesNotMatch(err, /undefined/);
      assert.deepEqual(page.errors, []);
    } finally { await page.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Codex round 1: a zero day says so, and a topic id with a quote does not break focus', { skip }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cde-ui-'));
  try {
    const page = await browser.newPage(VIEWPORTS[0]);
    try {
      await page.goto(`${pageUrl}#day=2026-09-01`);
      assert.match(await page.eval($text('[data-testid=empty]')), /on this day/);
      const a = join(dir, 'a.json');
      const b = join(dir, 'b.json');
      writeFileSync(a, JSON.stringify({ captured_at: '2026-09-01T09:00:00+08:00', posts: [{ id: 'q1', text: 'say "hi" there' }] }));
      writeFileSync(b, JSON.stringify({ captured_at: '2026-09-02T09:00:00+08:00', posts: [] }));
      await page.eval(`window.CDE_LEXICON = { topics: [{ id: 'a"b', label_en: 'Quote', keywords: ['hi'] }] }`);
      await page.setFiles('[data-testid=file-input]', [a, b]);
      await page.eval('new Promise((r) => setTimeout(r, 300))');
      await page.eval(`(() => { const c = [...document.querySelectorAll('[data-testid=topic-chip]')].find((x) => x.dataset.topic === 'a"b'); c.focus(); c.click(); })()`);
      assert.equal(await page.eval('document.activeElement.dataset.topic'), 'a"b');
      assert.equal(await page.eval($count('[data-testid=post-card]')), 1);
      assert.deepEqual(page.errors, []);
    } finally { await page.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('mobile: buttons, chips, the checkbox row, and the file panel are at least 44px tall', { skip }, async () => {
  const page = await browser.newPage(VIEWPORTS[1]);
  try {
    await page.goto(pageUrl);
    const small = await page.eval(`[...document.querySelectorAll('[data-testid=lang-toggle], [data-testid=all-days], [data-testid=topic-chip], label.check, details.own > summary')]
      .map((e) => [e.dataset.testid || e.tagName, Math.round(e.getBoundingClientRect().height)]).filter(([, h]) => h < 44)`);
    assert.deepEqual(small, []);
  } finally { await page.close(); }
});

function location(hash) { return decodeURIComponent(hash); }
