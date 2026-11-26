// 책 추가 page: pick the next two books from the roadmap list, each with its own booster pack.
(function () {
  'use strict';
  var NB = window.NextBooks;
  var board = document.querySelector('[data-next-slots]');
  if (!NB || !board || !NB.catalog.length) return;
  var cfg = JSON.parse((document.getElementById('next-data') || {}).textContent || '{}');
  var addData = document.getElementById('add-data');
  var shelf = addData ? (JSON.parse(addData.textContent).books || []).map(function (b) { return b.title; }) : [];
  var base = cfg.base || '';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  // The grades the list covers, in order (초5–고2 for Simon, 초1–초4 for Sophia).
  var GRADES = NB.catalog.reduce(function (a, b) { if (a.indexOf(b.grade) === -1) a.push(b.grade); return a; }, []);
  var KID = window.KID || {};

  function h(tag, props) {
    var el = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      var v = props[k];
      if (v === false || v == null) return;
      if (k === 'class') el.className = v;
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    Array.prototype.slice.call(arguments, 2).forEach(function (kid) {
      [].concat(kid).forEach(function (c) { if (c != null && c !== false) el.append(typeof c === 'object' ? c : document.createTextNode(String(c))); });
    });
    return el;
  }
  function eul(w) { var c = String(w).trim().slice(-1).charCodeAt(0); return w + (c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? '을' : '를'); }

  // This year's grade: the grade in _data/weekly.yml moves up one each March.
  var now = new Date(), schoolYear = now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1;
  var gi = Math.max(0, Math.min(GRADES.length - 1, Math.max(0, GRADES.indexOf(cfg.grade || GRADES[0])) + (schoolYear - (cfg.gradeYear || schoolYear))));
  var grade = GRADES[gi];
  var shown = grade;
  var pending = null; // a book waiting for a slot when both are full

  function cover(b, cls) {
    if (b.cover) return h('img', { class: cls, src: base + b.cover, alt: '', loading: 'lazy' });
    return h('span', { class: cls + ' drawn-cover cover-' + (b.title.length % 5), 'aria-hidden': 'true' }, h('b', {}, b.title), h('i', {}, b.author));
  }
  function packView(card, big) {
    var sid = String(card.tcg_id).split('-'), small = card.image_small || 'https://images.pokemontcg.io/' + sid[0] + '/' + sid[1] + '.png';
    return h('div', { class: 'np' + (big ? ' np-big' : '') },
      h('img', { class: 'np-pack', src: big ? card.pack : card.pack.replace('_in_1000x1000', '_in_200x200'), alt: card.set + ' 부스터 팩', loading: 'lazy' }),
      h('img', { class: 'np-card', src: small, alt: card.name_ko + ' 카드', loading: 'lazy' }));
  }

  // Reading order for this grade: own Must, the next grades' Must (two for Simon, one for Sophia: kid.ahead), then own Better.
  function queue() {
    var q = [];
    var ahead = KID.ahead == null ? 2 : KID.ahead, ks = [];
    for (var k0 = 0; k0 <= ahead; k0++) ks.push(k0);
    ks.forEach(function (k) { var g = GRADES[gi + k]; if (g) q = q.concat(NB.catalog.filter(function (b) { return b.tier === g + ' Must'; })); });
    return q.concat(NB.catalog.filter(function (b) { return b.tier === grade + ' Better'; }));
  }

  function state() {
    var st = NB.status(), read = NB.readTitles(shelf), slots = NB.slots();
    var current = st.phase === 'reading' ? st.book.slug : null;
    return { st: st, read: read, slots: slots, current: current, locked: NB.locked() };
  }
  function isRead(s, b) { return !!s.read[NB.norm(b.title)]; }

  function renderStatus(s) {
    var el = $('[data-next-status]'), st = s.st, filled = s.slots.filter(Boolean).length;
    el.textContent = '';
    el.className = 'next-status phase-' + st.phase;
    var go = function (text) { return h('a', { class: 'action spark small', href: base + '/reading/' }, text); };
    if (st.phase === 'reading') el.append(h('span', {}, h('b', {}, '「' + st.book.title + '」'), ' 읽는 중이에요. 다 읽기 전까지는 두 권을 언제든 바꿀 수 있어요.'));
    else if (st.phase === 'opening') el.append(h('span', {}, h('b', {}, '「' + st.book.title + '」'), ' 다 읽었어요! 팩을 뜯고 나면 골라 둔 책 중에서 다음 책을 골라요.'), go('팩 뜯으러 가기'));
    else if (st.phase === 'choose' && filled) el.append(h('span', {}, h('b', {}, '「' + st.book.title + '」'), ' 다 읽었어요! 이제 골라 둔 ' + (filled === 2 ? '두 권' : '책') + ' 중에서 다음 책을 골라요.'), go('다음 책 고르러 가기'));
    else if (st.phase === 'choose') el.append(h('span', {}, h('b', {}, '「' + st.book.title + '」'), ' 다 읽었어요! 아래 목록에서 다음 책 두 권을 골라 주세요.'));
    else el.append(h('span', {}, filled === 2 ? '두 권을 다 골랐어요! 책 읽기 화면에서 둘 중 하나를 골라 시작해요.' : filled === 1 ? '한 권 더 골라요.' : '아직 고른 책이 없어요. 아래 목록에서 두 권을 골라요.'));
    if (s.locked) el.append(h('small', { class: 'next-lock' }, '다 읽은 뒤에는 바꿀 수 없어요. 두 권 중에서 골라요.'));
  }

  function renderSlots(s) {
    [0, 1].forEach(function (i) {
      var li = board.children[i], slug = s.slots[i], b = slug && NB.find(slug);
      li.textContent = '';
      li.className = 'next-slot' + (b ? '' : ' is-empty') + (pending ? ' is-target' : '');
      var label = h('span', { class: 'slot-no' }, (i + 1) + '번 책');
      if (!b) {
        li.append(label, h('img', { class: 'slot-art', src: base + (KID.img || '/assets/img/') + 'next-slot.webp', alt: '', width: 160, height: 149 }),
          h('p', { class: 'slot-empty' }, pending ? '여기에 넣을까요?' : '아래 목록에서 ‘골라 두기’를 눌러요'));
      } else {
        var card = NB.card(slug);
        li.append(label,
          h('div', { class: 'slot-body' },
            cover(b, 'slot-cover'),
            h('div', { class: 'slot-text' },
              h('span', { class: 'chip tier' }, b.tier),
              h('h3', {}, b.title),
              h('p', { class: 'muted' }, [b.author, b.pages ? b.pages + '쪽' : ''].filter(Boolean).join(' · ')),
              h('p', { class: 'slot-power' }, b.power))),
          h('div', { class: 'slot-pack' },
            packView(card, true),
            h('p', {}, h('b', {}, card.set), ' 팩', h('br'), '확정 카드 ', h('b', {}, card.name_ko), h('span', { class: 'rare-tag rarity-SR' }, '스페셜 일러스트 레어'))));
      }
      if (pending) {
        li.append(h('button', { type: 'button', class: 'action spark small slot-put', onclick: function () { put(i, pending); } }, b ? '이 책 대신 넣기' : '여기에 넣기'));
      } else if (b && !s.locked) {
        li.append(h('button', { type: 'button', class: 'action ghost small slot-out', onclick: function () { NB.remove(slug); render(); } }, '빼기'));
      }
    });
    var cancel = $('[data-pending-cancel]');
    if (cancel) cancel.remove();
    if (pending) {
      var pb = NB.find(pending);
      board.parentNode.insertBefore(h('p', { class: 'pending-note', 'data-pending-cancel': '' },
        eul('「' + pb.title + '」') + ' 어느 자리에 넣을까요? ',
        h('button', { type: 'button', class: 'linkish', onclick: function () { pending = null; render(); } }, '그만두기')), board.nextSibling);
    }
  }

  function put(i, slug) {
    NB.put(i, slug);
    pending = null;
    render();
    var li = board.children[i];
    li.classList.add('is-new');
    setTimeout(function () { li.classList.remove('is-new'); }, 900);
  }

  function choose(slug) {
    var s = state();
    var free = s.slots.indexOf(null);
    if (free !== -1) { put(free, slug); board.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    pending = slug;
    render();
    board.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function renderTabs() {
    var box = $('[data-grade-tabs]');
    box.textContent = '';
    GRADES.forEach(function (g) {
      box.append(h('button', { type: 'button', class: 'filter', 'aria-pressed': String(g === shown), onclick: function () { shown = g; renderList(state()); renderTabs(); } },
        g === grade ? g + ' (지금)' : g));
    });
  }

  function renderList(s) {
    var wrap = $('[data-road-list]'), order = queue(), nextUp = [];
    order.forEach(function (b) { if (nextUp.length < 2 && !isRead(s, b) && b.slug !== s.current) nextUp.push(b.slug); });
    wrap.textContent = '';
    ['Must', 'Better'].forEach(function (t) {
      var list = NB.catalog.filter(function (b) { return b.tier === shown + ' ' + t; });
      if (!list.length) return;
      var ul = h('ul', { class: 'road-grid' });
      list.forEach(function (b) {
        var read = isRead(s, b), slot = s.slots.indexOf(b.slug), reading = b.slug === s.current;
        var card = NB.card(b.slug) || b.cards[0];
        var btn;
        if (reading) btn = h('span', { class: 'chip on' }, '지금 읽는 중');
        else if (read) btn = h('span', { class: 'chip done' }, '다 읽었어요');
        else if (slot !== -1) btn = h('span', { class: 'chip picked' }, (slot + 1) + '번으로 골라 뒀어요');
        else if (s.locked) btn = h('span', { class: 'chip' }, '다음 번에');
        else btn = h('button', { type: 'button', class: 'action small' + (pending === b.slug ? ' spark' : ''), onclick: function () { choose(b.slug); } }, '골라 두기');
        ul.append(h('li', { class: 'road-book' + (read ? ' is-read' : '') + (slot !== -1 ? ' is-picked' : '') },
          cover(b, 'road-cover'),
          h('div', { class: 'road-text' },
            nextUp.indexOf(b.slug) !== -1 ? h('span', { class: 'chip next' }, '순서상 다음') : null,
            h('h4', {}, b.title),
            h('p', { class: 'muted' }, b.author + (b.publisher && b.publisher.indexOf('번역') === -1 ? ' · ' + b.publisher : '')),
            h('p', { class: 'road-power' }, b.power),
            h('div', { class: 'road-foot' }, packView(card, false), h('span', { class: 'road-set' }, card.set, h('br'), h('b', {}, card.name_ko)), btn))));
      });
      wrap.append(h('h3', { class: 'road-tier' }, shown + ' ' + t, h('small', {}, t === 'Must' ? ' 꼭 읽기' : ' 더 읽기')), ul);
    });
  }

  function render() {
    var s = state();
    renderStatus(s);
    renderSlots(s);
    renderList(s);
  }

  // The manual form opens by itself when a draft is in progress or the link asks for it.
  var manual = document.getElementById('manual-add');
  if (manual && (location.hash === '#manual-add' || location.hash === '#recommend' || /[?&]manual\b/.test(location.search))) manual.open = true;
  try { var draft = JSON.parse(localStorage.getItem('readcheck:add-draft:v1') || 'null'); if (manual && draft && draft.step > 1 && draft.book && draft.book.title) manual.open = true; } catch (e) { /* ignore */ }

  renderTabs();
  render();
  window.addEventListener('storage', render);
})();
