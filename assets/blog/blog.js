// Kids' blog: lock sheet, unlock state and diary rendering. No dependencies.
(() => {
  'use strict';
  const B = window.BLOG, T = B.t, KEY = 'blog-key', HOURS = 12;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);

  // ---- Spring: Apple's two knobs (damping ratio, response in seconds). Always continues from the
  // live value and velocity, so it can be grabbed, redirected or re-targeted at any moment.
  class Spring {
    constructor(onUpdate, damping = 1, response = 0.35) { this.x = 0; this.v = 0; this.target = 0; this.on = onUpdate; this.tune(damping, response); this.raf = 0; }
    tune(damping, response) { const w = (2 * Math.PI) / response; this.k = w * w; this.c = 2 * damping * w; }
    jump(x) { this.stop(); this.x = x; this.v = 0; this.target = x; this.on(x); }
    stop() { cancelAnimationFrame(this.raf); this.raf = 0; }
    to(target, velocity, done) {
      this.target = target; this.done = done; if (velocity !== undefined) this.v = velocity;
      if (reduced()) { this.stop(); this.x = target; this.v = 0; this.on(target); done && done(); return; }
      if (this.raf) return;
      let last = performance.now();
      const step = (now) => {
        let dt = Math.min(0.032, (now - last) / 1000); last = now;
        for (let i = 0; i < 4; i++) { const a = -this.k * (this.x - this.target) - this.c * this.v; this.v += a * dt / 4; this.x += this.v * dt / 4; }
        if (Math.abs(this.v) < 0.5 && Math.abs(this.x - this.target) < 0.5) { this.x = this.target; this.v = 0; this.raf = 0; this.on(this.x); const d = this.done; this.done = null; d && d(); return; }
        this.on(this.x); this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    }
  }
  // Where a flick is going, not where the finger let go (exponential decay, as in scroll views).
  const project = (v, rate = 0.998) => (v / 1000) * rate / (1 - rate);
  const rubber = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

  // ---- Feedback on touch-down, for everything that can be pressed.
  const pressables = '.pressable,.tile:not([aria-disabled="true"]),.key';
  addEventListener('pointerdown', (e) => { const el = e.target.closest && e.target.closest(pressables); if (el) el.classList.add('is-pressed'); }, { passive: true });
  for (const type of ['pointerup', 'pointercancel', 'pointerout']) addEventListener(type, (e) => { const el = e.target.closest && e.target.closest(pressables); if (el && (type !== 'pointerout' || !el.contains(e.relatedTarget))) el.classList.remove('is-pressed'); }, { passive: true });

  // ---- The lock: a key derived from the four digits opens the vault file. Nothing secret is in this script.
  const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const text = (b) => { let s = ''; for (const c of b) s += String.fromCharCode(c); return btoa(s); };
  let vaultPromise;
  const vault = () => vaultPromise || (vaultPromise = fetch(B.vault, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error('vault'); return r.json(); }));
  async function derive(pin, v) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: bytes(v.salt), iterations: v.iter }, base, 256));
  }
  async function unseal(raw, box) {
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(box.iv) }, key, bytes(box.ct))));
  }
  function savedKey() {
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.exp > Date.now()) return bytes(s.k); localStorage.removeItem(KEY); } catch (e) {}
    return null;
  }
  const remember = (raw) => { try { localStorage.setItem(KEY, JSON.stringify({ k: text(raw), exp: Date.now() + HOURS * 3600e3 })); } catch (e) {} };
  const forget = () => { try { localStorage.removeItem(KEY); } catch (e) {} };
  const safeNext = (p) => (typeof p === 'string' && /^\/[^/\\]/.test(p) ? p : null);
  function reflect() {
    const open = !!savedKey(); document.documentElement.classList.toggle('is-open', open);
    const pill = $('[data-lock-pill]'); if (pill) { pill.hidden = !open; }
  }

  // ---- Lock sheet
  function Sheet() {
    const scrim = $('.scrim'), sheet = $('.sheet'), dots = [...sheet.querySelectorAll('.dots i')], dotsBox = $('.dots', sheet), hint = $('.hint', sheet), keys = [...sheet.querySelectorAll('.key')];
    let H = 0, y = 0, sx = 0, pin = '', next = null, opener = null, busy = false, fails = 0, live = false;
    const wide = () => matchMedia('(min-width: 48rem)').matches;
    const paint = () => {
      const p = Math.max(0, Math.min(1, 1 - y / H));
      sheet.style.transform = wide() ? `translate(calc(-50% + ${sx}px), calc(-50% + ${y * 0.25}px)) scale(${0.94 + 0.06 * p})` : `translate(calc(-50% + ${sx}px), ${y}px)`;
      sheet.style.opacity = wide() ? String(p) : '1';
      scrim.style.opacity = String(p);
    };
    const drop = new Spring((v) => { y = v; paint(); }), shake = new Spring((v) => { sx = v; paint(); }, 0.28, 0.26);
    const show = () => { dots.forEach((d, i) => d.classList.toggle('on', i < pin.length)); };
    const say = (m) => { hint.textContent = m; };
    function open(target, from) {
      next = safeNext(target); opener = from || document.activeElement; pin = ''; busy = false; show(); dotsBox.className = 'dots'; say(T.enter);
      sheet.hidden = false; scrim.classList.add('is-live'); live = true; H = sheet.offsetHeight + 40;
      if (!drop.raf && y === 0) drop.jump(H);
      drop.tune(1, 0.38); drop.to(0); sheet.focus({ preventScroll: true }); vault().catch(() => say(T.offline));
    }
    function close(velocity) {
      live = false; scrim.classList.remove('is-live'); drop.tune(1, 0.32);
      drop.to(H, velocity, () => { sheet.hidden = true; y = 0; drop.x = 0; if (opener && opener.focus) opener.focus({ preventScroll: true }); });
    }
    async function submit() {
      busy = true; say(T.checking);
      try {
        const v = await vault(), raw = await derive(pin, v); await unseal(raw, v.ticket);
        remember(raw); reflect(); dotsBox.classList.add('ok'); say(T.welcome); navigator.vibrate && navigator.vibrate(12);
        setTimeout(() => { if (next) location.href = next; else close(); }, 320);
      } catch (e) {
        fails++; dotsBox.classList.add('bad'); navigator.vibrate && navigator.vibrate([18, 40, 18]);
        shake.jump(0); shake.to(0, 1500);
        const wait = fails >= 3 ? Math.min(30, 2 ** (fails - 2)) : 0;
        setTimeout(() => { pin = ''; show(); dotsBox.className = 'dots'; }, 380);
        if (!wait) { say(T.again); busy = false; return; }
        let left = wait; say(T.wait.replace('{n}', left));
        const timer = setInterval(() => { left--; if (left <= 0) { clearInterval(timer); busy = false; say(T.enter); } else say(T.wait.replace('{n}', left)); }, 1000);
      }
    }
    function press(k) {
      if (busy || !live) return;
      if (k === 'back') { pin = pin.slice(0, -1); show(); return; }
      if (k === 'close') { close(); return; }
      if (pin.length >= 4) return;
      pin += k; show(); if (pin.length === 4) submit();
    }
    keys.forEach((key) => key.addEventListener('click', () => press(key.dataset.k)));
    scrim.addEventListener('click', () => close());
    addEventListener('keydown', (e) => {
      if (!live) return;
      if (/^[0-9]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('back'); else if (e.key === 'Escape') close();
      else if (e.key === 'Tab') { const f = keys.filter((k) => !k.disabled), i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus(); }
    });
    // Drag the sheet 1:1 from wherever it currently is; resist past the top; throw it with a flick.
    let drag = null;
    sheet.addEventListener('pointerdown', (e) => {
      if (wide() || e.target.closest('.key') || !live) return;
      drop.stop(); sheet.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, grab: e.clientY - y, trail: [[e.timeStamp, e.clientY]], moved: false };
    });
    sheet.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const raw = e.clientY - drag.grab; if (!drag.moved && Math.abs(raw - y) < 10) return; drag.moved = true;
      y = raw < 0 ? -rubber(-raw, H) : raw; drop.x = y; paint();
      drag.trail.push([e.timeStamp, e.clientY]); if (drag.trail.length > 5) drag.trail.shift();
    });
    const release = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const t = drag.trail, a = t[0], b = t[t.length - 1], v = b[0] > a[0] ? ((b[1] - a[1]) / (b[0] - a[0])) * 1000 : 0; drag = null;
      const flicked = Math.abs(v) > 300; drop.tune(flicked ? 0.8 : 1, 0.3);
      if (y + project(v) > H * 0.5) close(v); else drop.to(0, v);
    };
    sheet.addEventListener('pointerup', release); sheet.addEventListener('pointercancel', release);
    return { open };
  }

  // ---- Stage parallax: each card follows the pointer on its own X and Y springs, from wherever it is.
  function parallax() {
    const stage = $('.stage'); if (!stage || reduced() || !matchMedia('(pointer: fine)').matches) return;
    const items = [...stage.querySelectorAll('[data-depth]')].map((el) => {
      const d = +el.dataset.depth, o = { x: 0, y: 0 }, set = () => { el.style.transform = `translate3d(${o.x}px,${o.y}px,0)`; };
      return { d, x: new Spring((v) => { o.x = v; set(); }, 1, 0.55), y: new Spring((v) => { o.y = v; set(); }, 1, 0.55) };
    });
    stage.addEventListener('pointermove', (e) => { const r = stage.getBoundingClientRect(), nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5; for (const it of items) { it.x.to(-nx * it.d); it.y.to(-ny * it.d * 0.6); } });
    stage.addEventListener('pointerleave', () => { for (const it of items) { it.x.to(0); it.y.to(0); } });
  }

  // ---- Pages
  function home() {
    const sheet = Sheet(); reflect(); parallax();
    document.querySelectorAll('[data-go]').forEach((tile) => tile.addEventListener('click', (e) => {
      e.preventDefault(); const go = tile.dataset.go;
      if (savedKey()) location.href = go; else sheet.open(go, tile);
    }));
    const pill = $('[data-lock-pill]'); if (pill) pill.addEventListener('click', () => { forget(); reflect(); });
    const q = new URLSearchParams(location.search);
    if (q.has('unlock') && !savedKey()) { const next = safeNext(q.get('next')) || B.sections[q.get('unlock')]; history.replaceState(null, '', location.pathname); if (next) sheet.open(next); }
  }
  async function diary() {
    const raw = savedKey(), list = $('#entries');
    if (!raw) { location.replace('/?unlock=diary'); return; }
    let data;
    try { const v = await vault(); data = await unseal(raw, v.diary); } catch (e) { forget(); location.replace('/?unlock=diary'); return; }
    const entries = (data.entries || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    list.textContent = '';
    if (!entries.length) { const box = document.createElement('div'); box.className = 'empty'; const img = new Image(); img.src = B.art + 'diary.webp'; img.alt = ''; const p = document.createElement('p'); p.textContent = T.empty; box.append(img, p); list.append(box); return; }
    let month = '';
    for (const en of entries) {
      const m = String(en.date).slice(0, 7);
      if (m !== month) { month = m; const h = document.createElement('p'); h.className = 'month'; h.textContent = new Intl.DateTimeFormat(B.lang, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(m + '-01T00:00:00Z')); list.append(h); }
      const card = document.createElement('article'); card.className = 'entry';
      const time = document.createElement('time'); time.dateTime = en.date; time.textContent = new Intl.DateTimeFormat(B.lang, { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(new Date(en.date + 'T00:00:00Z'));
      const h2 = document.createElement('h2'); h2.textContent = en.title || T.untitled; card.append(time, h2);
      if (typeof en.audio === 'string' && /^https:\/\//.test(en.audio)) {
        const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'none'; audio.src = en.audio; card.append(audio);
        if (typeof en.page === 'string' && /^https:\/\//.test(en.page)) { const alt = document.createElement('a'); alt.className = 'alt'; alt.href = en.page; alt.target = '_blank'; alt.rel = 'noopener noreferrer'; alt.textContent = T.listenElsewhere; card.append(alt); }
      }
      if (en.text) { const p = document.createElement('p'); p.textContent = en.text; card.append(p); }
      list.append(card);
    }
  }
  // ---- Schedule: a paper wall calendar. Entries are written in pen; each routine day carries its sticker.
  async function schedule() {
    const raw = savedKey(), leaf = $('#leaf'), note = $('#note'), cal = $('#cal');
    if (!raw) { location.replace('/?unlock=schedule'); return; }
    let data;
    try { const box = await fetch(B.schedule, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error('schedule'); return r.json(); }); data = await unseal(raw, box); }
    catch (e) { forget(); location.replace('/?unlock=schedule'); return; }
    const pics = new Map(), key = crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    const picture = (url) => pics.get(url) || (pics.set(url, fetch(url).then((r) => r.arrayBuffer()).then(async (buf) => {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(buf, 0, 12) }, await key, new Uint8Array(buf, 12));
      return URL.createObjectURL(new Blob([plain], { type: 'image/webp' }));
    })), pics.get(url));
    const seoul = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
    const pad = (n) => String(n).padStart(2, '0');
    const shift = (m, d) => { const x = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + d, 1)); return x.getUTCFullYear() + '-' + pad(x.getUTCMonth() + 1); };
    const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
    const tilt = (s, k = 2.4) => ((hash(s) - 0.5) * k).toFixed(2) + 'deg';
    const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const clock = (t) => t.replace(/^0/, '');
    const days = data.days || {};
    let month = seoul.slice(0, 7);
    if (month < data.first) month = data.first; if (month > data.last) month = data.last;
    let chosen = month === seoul.slice(0, 7) ? seoul : month + '-01';
    const wide = () => matchMedia('(min-width: 44rem)').matches;
    const cover = leaf.querySelector('.cover');

    function sticker(s, cls) {
      const img = el('img', 'sticker ' + cls + ' r-' + s.r); img.alt = s.n; img.decoding = 'async'; img.dataset.move = s.m;
      picture(s.i).then((u) => { img.src = u; }).catch(() => img.remove());
      return img;
    }
    function page(m) {
      const frag = document.createDocumentFragment();
      const head = el('header', 'cal-head');
      const prev = el('button', 'flip prev pressable'); prev.type = 'button'; prev.setAttribute('aria-label', T.prev); prev.textContent = '‹'; prev.disabled = m <= data.first;
      const next = el('button', 'flip next pressable'); next.type = 'button'; next.setAttribute('aria-label', T.next); next.textContent = '›'; next.disabled = m >= data.last;
      const title = el('h2', 'cal-title'); const y = +m.slice(0, 4), mo = +m.slice(5, 7);
      title.append(el('span', 'cal-m', String(mo)), el('span', 'cal-en', new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, mo - 1, 1))).toUpperCase()), el('span', 'cal-y', String(y)));
      prev.addEventListener('click', () => go(-1)); next.addEventListener('click', () => go(1));
      head.append(prev, title, next); frag.append(head);
      const grid = el('div', 'cal-grid'); grid.setAttribute('role', 'grid');
      T.weekdays.forEach((w, i) => grid.append(el('span', 'wd' + (i === 0 ? ' sun' : i === 6 ? ' sat' : ''), w)));
      const lead = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay(), count = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      for (let i = 0; i < lead; i++) grid.append(el('span', 'cell blank'));
      for (let d = 1; d <= count; d++) {
        const day = m + '-' + pad(d), info = days[day] || { e: [] }, dow = (lead + d - 1) % 7;
        const cell = el('button', 'cell' + (dow === 0 ? ' sun' : dow === 6 ? ' sat' : '') + (day === seoul ? ' today' : '') + (day < seoul ? ' past' : ''));
        cell.type = 'button'; cell.dataset.day = day; cell.setAttribute('aria-pressed', String(day === chosen));
        cell.setAttribute('aria-label', d + '일' + (info.e.length ? ', 일정 ' + info.e.length + '개' : '') + (info.s ? ', 스티커 ' + info.s.n : ''));
        const num = el('span', 'dn', String(d)); cell.append(num);
        if (day === seoul) cell.insertAdjacentHTML('beforeend', '<svg class="circle" viewBox="0 0 60 50" aria-hidden="true"><path d="M33 6C17 4 5 13 6 26s15 20 29 18 21-11 19-23C52 9 40 3 26 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>');
        const ink = el('span', 'ink'), shown = wide() ? 3 : 0;
        info.e.slice(0, shown).forEach((x, i) => { const l = el('span', 'w', (x[3] ? '' : clock(x[0]) + ' ') + x[2]); l.style.rotate = tilt(day + i, 2); ink.append(l); });
        if (info.e.length > shown) ink.append(shown ? el('span', 'w more', '+' + (info.e.length - shown)) : el('span', 'ticks', '•'.repeat(Math.min(info.e.length, 4))));
        cell.append(ink);
        if (info.s) { const s = sticker(info.s, 'small'); s.style.rotate = tilt(day + 's', 24); cell.append(s); }
        cell.addEventListener('click', () => choose(day, true));
        grid.append(cell);
      }
      while (grid.children.length % 7) grid.append(el('span', 'cell blank'));
      frag.append(grid);
      if (data.updated) frag.append(el('p', 'cal-foot', '↻ ' + new Intl.DateTimeFormat('ko', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date(data.updated))));
      return frag;
    }
    function paint(target) { target.replaceChildren(cover.cloneNode(true), page(month)); }
    function choose(day, user) {
      chosen = day;
      leaf.querySelectorAll('.cell[data-day]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.day === day)));
      const info = days[day] || { e: [] }, date = new Date(day + 'T00:00:00Z');
      note.hidden = false; note.replaceChildren(); note.style.rotate = tilt(day, 2.2);
      const h = el('h3', 'note-day', new Intl.DateTimeFormat('ko', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(date)); note.append(h);
      const list = el('ul', 'note-list');
      for (const x of info.e) { const li = el('li'); li.append(el('span', 'note-t', x[3] ? T.allDay : clock(x[0]) + (x[1] ? '–' + clock(x[1]) : '')), el('span', 'note-w', x[2])); list.append(li); }
      if (!info.e.length) list.append(el('li', 'note-empty', T.noEvents));
      note.append(list);
      const box = el('div', 'note-sticker');
      if (info.s) {
        const s = sticker(info.s, 'big'); box.append(s, el('p', 'note-mon', info.s.n), el('p', 'tag r-' + info.s.r, { common: 'Common', rare: 'Rare', epic: 'Super rare', ultra: 'Ultra rare' }[info.s.r]));
        s.addEventListener('click', () => { s.classList.remove('play'); void s.offsetWidth; s.classList.add('play'); });
        requestAnimationFrame(() => s.classList.add('play'));
      } else box.append(el('p', 'note-empty', day <= seoul ? T.noSticker : '✧'));
      note.append(box);
      if (user && !wide()) note.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' });
    }
    // Turning the page: the old leaf swings up over the spiral, as on a real wall calendar.
    let turning = false;
    function go(delta) {
      const to = shift(month, delta); if (turning || to < data.first || to > data.last) return;
      turning = true; const ghost = leaf.cloneNode(true); ghost.classList.add('ghost-leaf'); ghost.removeAttribute('id'); ghost.style.top = leaf.offsetTop + 'px'; ghost.setAttribute('aria-hidden', 'true');
      ghost.querySelectorAll('img.sticker').forEach((img, i) => { const live = leaf.querySelectorAll('img.sticker')[i]; if (live) img.src = live.src; });
      month = to; const first = Object.keys(days).find((d) => d.startsWith(to));
      chosen = to === seoul.slice(0, 7) ? seoul : first || to + '-01';
      const down = delta < 0;
      if (down) { cal.append(ghost); paint(ghost); ghost.style.transform = 'rotateX(-115deg)'; ghost.style.opacity = '0'; }
      else { cal.append(ghost); paint(leaf); }
      const turn = new Spring((v) => { ghost.style.transform = 'rotateX(' + v + 'deg)'; ghost.style.opacity = String(Math.max(0, 1 - Math.abs(v) / 115)); }, 1, 0.42);
      let ended = false;
      const end = () => { if (ended) return; ended = true; turn.stop(); if (down) paint(leaf); ghost.remove(); turning = false; choose(chosen); };
      turn.jump(down ? -115 : 0);
      // Opacity reaches nothing well before the spring's last fraction of a degree; finish there.
      turn.to(down ? 0 : -115, 0, end); setTimeout(end, 900);
    }
    addEventListener('keydown', (e) => { if (e.target.closest && e.target.closest('input,textarea')) return; if (e.key === 'ArrowRight' || e.key === 'PageDown') go(1); else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1); });
    // A sideways flick turns the page too; vertical scrolling stays with the browser.
    let sw = null;
    cal.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') sw = { x: e.clientX, y: e.clientY, t: e.timeStamp }; }, { passive: true });
    cal.addEventListener('pointerup', (e) => { if (!sw) return; const dx = e.clientX - sw.x, dy = e.clientY - sw.y, v = dx / Math.max(1, e.timeStamp - sw.t); sw = null; if (Math.abs(dx) > 1.4 * Math.abs(dy) && (Math.abs(dx) > 90 || Math.abs(v) > 0.5)) go(dx < 0 ? 1 : -1); }, { passive: true });
    let lastWide = wide(); addEventListener('resize', () => { if (wide() !== lastWide && !turning) { lastWide = wide(); paint(leaf); choose(chosen); } });
    paint(leaf); choose(chosen);
  }
  const lockPill = $('[data-lock-page]'); if (lockPill) lockPill.addEventListener('click', () => { forget(); location.href = '/'; });
  if (B.page !== 'home') { const p = $('[data-lock-pill]'); if (p) { p.hidden = false; p.addEventListener('click', () => { forget(); location.href = '/'; }); } document.querySelectorAll('.nav [data-go]').forEach((a) => a.removeAttribute('data-go')); }
  if (B.page === 'home') home(); else if (B.page === 'diary') diary(); else if (B.page === 'schedule') schedule();
})();
