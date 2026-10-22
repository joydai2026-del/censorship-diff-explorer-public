/* Deleted Posts Explorer: the page. Reads the diff result and draws it.
 * All text from data files goes in with textContent, never innerHTML,
 * so a post that contains HTML is shown as words, not run. */
(function () {
  'use strict';

  const T = {
    en: {
      title: 'Deleted Posts Explorer',
      lede: 'See which posts disappeared each day.',
      skip: 'Skip to posts',
      langBtn: '中文', langAria: '切换到中文',
      bannerSample: 'Sample data for demo, not real posts.',
      bannerSampleMore: 'Every account, place, and post on this page is made up.',
      statDeleted: 'Posts deleted', statTracked: 'Posts tracked', statMedian: 'Typical time online (at most)', statIgnored: 'Captures ignored',
      hoursShort: (h) => (h === null ? 'n/a' : `about ${fmtHours(h)}`),
      chartTitle: 'Deleted posts per day', chartHint: "Tap a bar to see that day's posts.", allDays: 'Show all days',
      barAria: (d, n) => `${d}: ${n} deleted`,
      searchLabel: 'Search', searchPh: 'Search words, accounts, topics',
      topicAll: 'All topics', showGloss: 'Show English translation',
      headingAll: (n) => `All days · ${n} deleted ${n === 1 ? 'post' : 'posts'}`,
      headingDay: (d, n) => `${d} · ${n} deleted ${n === 1 ? 'post' : 'posts'}`,
      empty: 'No deleted posts match. Try another word or topic.',
      emptyNone: 'No posts were deleted between these captures.',
      emptyDay: 'No posts were deleted on this day.',
      emptyOne: 'Only one capture, so there is nothing to compare it with yet. Add a later capture to see what was deleted.',
      posted: 'Posted', lastSeen: 'Last seen', goneBy: 'Gone by', online: 'Online for',
      between: (a, b) => `between ${fmtHours(a)} and ${fmtHours(b)}`,
      unknown: 'not given',
      edited: 'Edited before deletion', versions: 'See every version',
      repostOf: (id) => `Re-post of ${id}`, repostedAs: (ids) => `Posted again as ${ids.join(', ')}`,
      restored: (n) => `Came back ${n === 1 ? 'once' : `${n} times`} first`,
      notesTitle: 'Good to know',
      noteMethod: (n) => `Built from ${n} captures. A post counts as deleted when it is in one capture and missing from the next. We only know it went missing somewhere between those two times.`,
      noteIgnored: (at, why) => `One capture was ignored (${at}): ${why}.`,
      noteWarn: (w) => `Warning: ${w}`,
      noteBlind: 'Posts that go up and come down between two captures are never seen, so they cannot appear here.',
      ownTitle: 'Use your own snapshot files',
      ownHelp: 'Pick two or more snapshot .json files (one per capture). Nothing leaves your computer: the comparison runs right here in the page.',
      ownLoaded: (n) => `Showing your ${n} ${n === 1 ? 'file' : 'files'}.`,
      loadError: (m) => `Could not use those files: ${m}`,
      foot: (tz) => `How it works: a post seen in one capture and missing from the next one is counted as deleted. Times are ${tz}.`,
      tzBeijing: 'Beijing time (UTC+8)',
      noData: 'No data loaded yet. Pick snapshot files below.',
    },
    zh: {
      title: '删帖观察 Deleted Posts Explorer',
      lede: '看看每天有哪些帖子消失了。',
      skip: '跳到帖子',
      langBtn: 'English', langAria: 'Switch to English',
      bannerSample: '示例数据，仅供演示，并非真实帖子。',
      bannerSampleMore: '本页所有账号、地名和帖子都是虚构的。 Sample data for demo, not real posts.',
      statDeleted: '被删帖子', statTracked: '追踪帖子', statMedian: '通常存活（最长）', statIgnored: '忽略的抓取',
      hoursShort: (h) => (h === null ? '无' : `约 ${fmtHoursZh(h)}`),
      chartTitle: '每天被删的帖子', chartHint: '点一下柱子，查看当天的帖子。', allDays: '显示全部日期',
      barAria: (d, n) => `${d}：删除 ${n} 条`,
      searchLabel: '搜索', searchPh: '搜索文字、账号、话题',
      topicAll: '全部话题', showGloss: '显示英文翻译',
      headingAll: (n) => `全部日期 · 删除 ${n} 条`,
      headingDay: (d, n) => `${d} · 删除 ${n} 条`,
      empty: '没有符合条件的被删帖子。换个词或话题试试。',
      emptyNone: '这几次抓取之间没有帖子被删。',
      emptyDay: '这一天没有帖子被删。',
      emptyOne: '只有一次抓取，还没有可以比较的。再加入一次之后的抓取，才能看到哪些帖子被删。',
      posted: '发布', lastSeen: '最后看到', goneBy: '消失于', online: '存活',
      between: (a, b) => `${fmtHoursZh(a)} 到 ${fmtHoursZh(b)} 之间`,
      unknown: '未提供',
      edited: '删除前被修改过', versions: '查看所有版本',
      repostOf: (id) => `转发自 ${id}`, repostedAs: (ids) => `之后被重发为 ${ids.join('、')}`,
      restored: (n) => `之前恢复过 ${n} 次`,
      notesTitle: '说明',
      noteMethod: (n) => `共 ${n} 次抓取。帖子在一次抓取中存在、下一次不见了，就算作被删。我们只知道它在这两个时间之间消失。`,
      noteIgnored: (at, why) => `有一次抓取被忽略（${at}）：${why}。`,
      noteWarn: (w) => `提醒：${w}`,
      noteBlind: '在两次抓取之间发出又被删掉的帖子永远看不到，所以不会出现在这里。',
      ownTitle: '使用你自己的快照文件',
      ownHelp: '选择两个或更多快照 .json 文件（每次抓取一个）。文件不会离开你的电脑，比较就在本页完成。',
      ownLoaded: (n) => `正在显示你的 ${n} 个文件。`,
      loadError: (m) => `无法使用这些文件：${m}`,
      foot: (tz) => `原理：一条帖子在一次抓取中出现、在下一次中消失，就算作被删。时间为${tz}。`,
      tzBeijing: '北京时间（UTC+8）',
      noData: '还没有数据。请在下方选择快照文件。',
    },
  };

  function fmtHours(h) {
    if (h < 1) return `${Math.round(h * 60)} min`;
    if (h < 48) return `${Math.round(h * 10) / 10} hours`.replace(/^1 hours$/, '1 hour');
    return `${Math.round((h / 24) * 10) / 10} days`;
  }
  function fmtHoursZh(h) {
    if (h < 1) return `${Math.round(h * 60)} 分钟`;
    if (h < 48) return `${Math.round(h * 10) / 10} 小时`;
    return `${Math.round((h / 24) * 10) / 10} 天`;
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ---- state -------------------------------------------------------------
  const state = {
    lang: 'en',
    data: window.CDE_DATA || null,
    own: 0,
    day: null,
    q: '',
    topic: null,
    gloss: true,
  };
  try {
    const saved = localStorage.getItem('cde-lang');
    if (saved === 'zh' || saved === 'en') state.lang = saved;
  } catch (e) { /* storage blocked: fine, use English */ }
  readHash();

  const t = (k, ...a) => {
    const v = T[state.lang][k];
    return typeof v === 'function' ? v(...a) : v;
  };

  // ---- time helpers (uses the zone the data was grouped in) -----------------
  function tzOffset() { return state.data ? state.data.meta.tzOffsetMinutes : 480; }
  function tzLabel() {
    const o = tzOffset();
    if (o === 480) return t('tzBeijing');
    const sign = o >= 0 ? '+' : '-';
    const a = Math.abs(o);
    return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, '0')}` : ''}`;
  }
  function shift(iso) { return new Date(Date.parse(iso) + tzOffset() * 60000); }
  function fmtDate(dateStr) {
    const [, m, d] = dateStr.split('-').map(Number);
    return state.lang === 'zh' ? `${m}月${d}日` : `${MONTHS[m - 1]} ${d}`;
  }
  function fmtTime(iso) {
    if (!iso) return t('unknown');
    const d = shift(iso);
    const day = fmtDate(d.toISOString().slice(0, 10));
    const hm = d.toISOString().slice(11, 16);
    return state.lang === 'zh' ? `${day} ${hm}` : `${day}, ${hm}`;
  }

  // ---- tiny DOM helper -------------------------------------------------------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const SVG = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v !== null && v !== undefined) el.setAttribute(k, v);
    for (const kid of kids) if (kid) el.append(kid);
    return el;
  }

  // ---- filtering ----------------------------------------------------------
  function topicLabel(id) {
    const tp = (state.data.meta.topics || []).find((x) => x.id === id);
    if (!tp) return id;
    return state.lang === 'zh' ? tp.label_zh || tp.label_en || id : tp.label_en || id;
  }
  function matches(p) {
    if (state.topic && !p.tags.includes(state.topic)) return false;
    if (!state.q) return true;
    const q = state.q.toLowerCase();
    const hay = [
      ...p.text_versions.map((v) => v.text), p.gloss, p.account, p.id,
      ...p.keywords, ...p.tags.map((id) => {
        const tp = (state.data.meta.topics || []).find((x) => x.id === id) || {};
        return `${tp.label_en || ''} ${tp.label_zh || ''}`;
      }),
    ].filter(Boolean).join('\n').toLowerCase();
    return hay.includes(q);
  }
  const filtered = () => state.data.deleted.filter(matches);

  // ---- rendering ------------------------------------------------------------
  function renderStatic() {
    document.documentElement.lang = state.lang === 'zh' ? 'zh-Hans' : 'en';
    document.title = state.lang === 'zh' ? '删帖观察' : 'Deleted Posts Explorer';
    for (const el of document.querySelectorAll('[data-i18n]')) {
      const v = T[state.lang][el.dataset.i18n];
      if (typeof v === 'string') el.textContent = v;
    }
    for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
    const lb = document.querySelector('[data-testid=lang-toggle]');
    lb.textContent = t('langBtn');
    lb.setAttribute('aria-label', t('langAria'));
    lb.lang = state.lang === 'zh' ? 'en' : 'zh-Hans';
    document.querySelector('.foot p').textContent = t('foot', tzLabel());
  }

  function renderBanner() {
    const slot = document.getElementById('banner-slot');
    slot.replaceChildren();
    if (!state.data) return;
    if (state.data.meta.sample) {
      slot.append(h('div', { class: 'banner', role: 'note', 'data-testid': 'sample-banner' },
        t('bannerSample'), h('small', { text: t('bannerSampleMore') })));
    }
  }

  function renderStats() {
    const st = state.data.stats;
    const box = document.getElementById('stats');
    const tile = (value, label, id) => h('div', { class: 'stat', 'data-testid': id }, h('b', { text: value }), h('span', { text: label }));
    box.replaceChildren(
      tile(String(st.deletedCount), t('statDeleted'), 'stat-deleted'),
      tile(String(st.totalPosts), t('statTracked'), 'stat-tracked'),
      tile(t('hoursShort', st.medianHoursAliveMax), t('statMedian'), 'stat-median'),
      tile(String(state.data.meta.skippedSnapshots.length), t('statIgnored'), 'stat-ignored'),
    );
  }

  function renderChart(list) {
    const days = state.data.days;
    const counts = new Map(days.map((d) => [d.date, 0]));
    for (const p of list) if (counts.has(p.deleted_date)) counts.set(p.deleted_date, counts.get(p.deleted_date) + 1);
    const max = Math.max(1, ...counts.values());
    const host = document.getElementById('chart');
    const avail = Math.max(280, host.clientWidth || 320);
    const slot = Math.max(36, Math.floor(avail / Math.max(1, days.length)));
    const W = Math.max(avail, slot * days.length);
    const H = 180;
    const top = 22;
    const base = H - 28;
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': t('chartTitle') });
    svg.append(s('line', { x1: 0, x2: W, y1: base + 0.5, y2: base + 0.5, class: 'chart-axis' }));
    days.forEach((d, i) => {
      const n = counts.get(d.date);
      const bh = n ? Math.max(4, Math.round(((base - top) * n) / max)) : 2;
      const x = i * slot;
      const bw = Math.min(44, slot - 10);
      const bx = x + (slot - bw) / 2;
      const label = fmtDate(d.date);
      const g = s('g', {
        class: 'bar-group', role: 'button', tabindex: '0', 'data-testid': 'day-bar', 'data-date': d.date,
        'data-count': String(n), 'aria-pressed': String(state.day === d.date), 'aria-label': t('barAria', label, n),
      });
      // A full-height invisible rectangle makes the whole column easy to tap.
      g.append(s('rect', { class: 'hit', x: x + 2, y: 0, width: slot - 4, height: H, rx: 6 }));
      g.append(s('rect', { class: 'bar', x: bx, y: base - bh, width: bw, height: bh, rx: 4 }));
      const c = s('text', { class: 'chart-count', x: x + slot / 2, y: base - bh - 6, 'text-anchor': 'middle' });
      c.textContent = String(n);
      g.append(c);
      const l = s('text', { class: 'chart-label', x: x + slot / 2, y: H - 8, 'text-anchor': 'middle' });
      l.textContent = label;
      g.append(l);
      const pick = () => setDay(state.day === d.date ? null : d.date);
      g.addEventListener('click', pick);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      svg.append(g);
    });
    host.replaceChildren(svg);
    const all = document.querySelector('[data-testid=all-days]');
    all.setAttribute('aria-pressed', String(state.day === null));
  }

  function renderChips() {
    const box = document.getElementById('chips');
    const base = state.data.deleted.filter((p) => !state.day || p.deleted_date === state.day);
    const chip = (id, label, n) => h('button', {
      type: 'button', class: 'chip', 'data-testid': 'topic-chip', 'data-topic': id || 'all',
      'aria-pressed': String(state.topic === id),
      onclick: () => { state.topic = state.topic === id ? null : id; update(); },
    }, label, n === null ? null : h('span', { class: 'n', text: String(n) }));
    const used = (state.data.meta.topics || []).filter((tp) => state.data.deleted.some((p) => p.tags.includes(tp.id)));
    box.replaceChildren(
      chip(null, t('topicAll'), null),
      ...used.map((tp) => chip(tp.id, topicLabel(tp.id), base.filter((p) => p.tags.includes(tp.id)).length)),
    );
    box.setAttribute('aria-label', t('topicAll'));
  }

  function card(p) {
    const badges = [];
    if (p.edited) badges.push(h('span', { class: 'badge flag', text: t('edited') }));
    if (p.repost_of) badges.push(h('span', { class: 'badge', text: t('repostOf', p.repost_of) }));
    if (p.reposted_as.length) badges.push(h('span', { class: 'badge', text: t('repostedAs', p.reposted_as) }));
    if (p.restored_count) badges.push(h('span', { class: 'badge', text: t('restored', p.restored_count) }));
    for (const id of p.tags) badges.push(h('span', { class: 'badge', text: `#${topicLabel(id)}` }));

    return h('article', { class: 'card', 'data-testid': 'post-card', 'data-id': p.id, 'data-tags': p.tags.join(' ') },
      h('p', { class: 'acct', text: p.account || t('unknown') }),
      h('p', { class: 'zh', lang: 'zh-Hans', 'data-testid': 'post-text', text: p.text }),
      state.gloss && p.gloss ? h('p', { class: 'en', lang: 'en', 'data-testid': 'post-gloss', text: p.gloss }) : null,
      h('dl', null,
        h('dt', { text: t('posted') }), h('dd', { text: fmtTime(p.posted_at) }),
        h('dt', { text: t('lastSeen') }), h('dd', { text: fmtTime(p.last_seen) }),
        h('dt', { text: t('goneBy') }), h('dd', { text: fmtTime(p.deleted_by) }),
        h('dt', { text: t('online') }), h('dd', { text: t('between', p.hours_alive_min, p.hours_alive_max) }),
      ),
      badges.length ? h('div', { class: 'badges' }, badges) : null,
      p.edited ? h('details', null, h('summary', { text: t('versions') }),
        h('ol', null, p.text_versions.map((v) => h('li', null, h('span', { lang: 'zh-Hans', text: v.text }), ` (${fmtTime(v.seen_at)})`)))) : null,
    );
  }

  function renderList(list) {
    const shown = list.filter((p) => !state.day || p.deleted_date === state.day);
    document.getElementById('list-heading').textContent = state.day
      ? t('headingDay', fmtDate(state.day), shown.length)
      : t('headingAll', shown.length);
    const box = document.getElementById('cards');
    // Only suggest changing the search when a search or topic is actually narrowing the list.
    const why = state.q || state.topic ? 'empty' : state.data.meta.snapshotCount < 2 ? 'emptyOne' : state.day ? 'emptyDay' : 'emptyNone';
    box.replaceChildren(...(shown.length ? shown.map(card) : [h('p', { class: 'empty', 'data-testid': 'empty', text: t(why) })]));
  }

  function renderNotes() {
    const m = state.data.meta;
    const items = [h('li', { text: t('noteMethod', m.snapshotCount) })];
    for (const sk of m.skippedSnapshots) items.push(h('li', { text: t('noteIgnored', fmtTime(sk.captured_at), sk.reason) }));
    for (const w of m.warnings) items.push(h('li', { text: t('noteWarn', w) }));
    items.push(h('li', { text: t('noteBlind') }));
    if (state.own) items.push(h('li', { text: t('ownLoaded', state.own) }));
    document.getElementById('notes').replaceChildren(h('h2', { text: t('notesTitle') }), h('ul', null, items));
  }

  function update() {
    renderStatic();
    renderBanner();
    if (!state.data) {
      document.getElementById('cards').replaceChildren(h('p', { class: 'empty', text: t('noData') }));
      return;
    }
    if (state.day && !state.data.days.some((d) => d.date === state.day)) state.day = null;
    // A link with a topic that has no chip would hide every post with no visible reason.
    if (state.topic && !state.data.deleted.some((p) => p.tags.includes(state.topic))) state.topic = null;
    // Bars and chips are rebuilt on every change; remember which one had keyboard focus.
    const f = document.activeElement;
    // Match by dataset, not a CSS selector, so ids from user files can hold any character.
    const kind = f && f.dataset ? f.dataset.testid : null;
    const refocus = kind === 'day-bar' ? ['day-bar', 'date', f.dataset.date] : kind === 'topic-chip' ? ['topic-chip', 'topic', f.dataset.topic] : null;
    const list = filtered();
    renderStats();
    renderChart(list);
    renderChips();
    if (refocus) {
      const el = [...document.querySelectorAll(`[data-testid=${refocus[0]}]`)].find((x) => x.dataset[refocus[1]] === refocus[2]);
      if (el) el.focus();
    }
    renderList(list);
    renderNotes();
    writeHash();
  }

  function setDay(d) { state.day = d; update(); }

  // ---- shareable links: #day=2026-09-06&q=word&topic=food ------------------------
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    const d = p.get('day');
    state.day = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
    state.q = p.get('q') || '';
    state.topic = p.get('topic') || null;
  }
  function writeHash() {
    const p = new URLSearchParams();
    if (state.day) p.set('day', state.day);
    if (state.q) p.set('q', state.q);
    if (state.topic) p.set('topic', state.topic);
    const next = p.toString();
    if (next !== location.hash.slice(1)) history.replaceState(null, '', next ? `#${next}` : location.pathname + location.search);
  }

  // ---- events -------------------------------------------------------------------
  const search = document.getElementById('search');
  search.value = state.q;
  search.addEventListener('input', () => { state.q = search.value.trim(); update(); });
  document.getElementById('gloss').addEventListener('change', (e) => { state.gloss = e.target.checked; update(); });
  document.querySelector('[data-testid=all-days]').addEventListener('click', () => setDay(null));
  document.querySelector('[data-testid=lang-toggle]').addEventListener('click', () => {
    state.lang = state.lang === 'en' ? 'zh' : 'en';
    try { localStorage.setItem('cde-lang', state.lang); } catch (e) { /* fine */ }
    update();
  });
  window.addEventListener('hashchange', () => { readHash(); search.value = state.q; update(); });
  let resizeTimer = null;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(update, 150); });

  // Your own files: read them, run the same engine, swap the view in.
  // If anything fails, the previous view stays. A newer pick always wins over a slower older one.
  let pickToken = 0;
  document.getElementById('file-input').addEventListener('change', async (e) => {
    const err = document.getElementById('load-error');
    err.textContent = '';
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const token = ++pickToken;
    const before = { data: state.data, own: state.own, day: state.day, topic: state.topic };
    try {
      const snaps = await Promise.all(files.map(async (f) => {
        try { return JSON.parse(await f.text()); } catch (x) { throw new Error(`${f.name}: ${x.message}`); }
      }));
      if (token !== pickToken) return;
      let result;
      try {
        result = window.CDE.diffSnapshots(snaps, { lexicon: window.CDE_LEXICON || null });
      } catch (x) {
        // Name the file that broke, the same way the command line does.
        const i = snaps.findIndex((snap) => { try { window.CDE.diffSnapshots([snap]); return false; } catch (y) { return true; } });
        throw new Error(i >= 0 ? `${files[i].name}: ${x.message}` : x.message);
      }
      Object.assign(state, { data: result, own: files.length, day: null, topic: null });
      update();
    } catch (x) {
      if (token !== pickToken) return;
      Object.assign(state, before);
      try { update(); } catch (y) { /* keep the message below visible */ }
      err.textContent = t('loadError', x.message);
    }
  });

  update();
})();
