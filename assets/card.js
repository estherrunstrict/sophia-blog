// 책콩 카드: builds a book's collectible card and makes every [data-tilt] card lean toward the finger,
// with the foil and glare following the light. A card marked [data-gyro] also follows the iPad's own tilt.
// _includes/book-card.html renders the same markup on the server; keep the two in step.
(function () {
  'use strict';

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cardName(b) { return (b.card && b.card.name_ko) || b.buddy || '책콩'; }
  function pad3(n) { return ('00' + (n || 0)).slice(-3); }

  function make(b, total, base, mini) {
    var c = b.card || {};
    var r = c.rarity === 'SR' ? 'SR' : 'R';
    var el = document.createElement('div');
    el.className = 'tcard rarity-' + r + ' type-' + (b.book_type || '') + (mini ? ' is-mini' : '');
    el.setAttribute('data-tilt', '');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', cardName(b) + ' 카드, ' + (b.title || ''));
    var back = '<div class="tc-face tc-back" aria-hidden="true"><span class="tc-emblem">책콩<br>카드</span></div>';
    if (c.image) {
      // A real card: the picture is the card.
      el.innerHTML = '<div class="tc-inner"><div class="tc-face tc-front tc-real">' +
        '<img class="tc-photo" src="' + esc(mini ? (c.image_small || c.image) : c.image) + '" alt="" draggable="false" referrerpolicy="no-referrer">' +
        '<div class="tc-holo"></div><div class="tc-glare"></div></div>' + back + '</div>';
      if (!mini) wire(el);
      return el;
    }
    el.innerHTML =
      '<div class="tc-inner"><div class="tc-face tc-front"><div class="tc-window">' +
      '<img class="tc-art" src="' + esc((base || '') + c.art) + '" alt="" draggable="false">' +
      '<div class="tc-top"><span class="tc-name">' + esc(b.buddy) + '</span><span class="tc-stat"><b>' + esc(b.pages) + '</b>쪽</span></div>' +
      '<span class="tc-type">' + esc(b.book_type) + '</span>' +
      '<div class="tc-panel"><p class="tc-move">' + esc(c.move) + '</p><p class="tc-text">' + esc(b.power) + '</p>' +
      '<p class="tc-foot"><span class="tc-book">「' + esc(b.title) + '」 ' + esc(b.author) + '</span><span>No.' + pad3(c.number) + '/' + esc(total) + '</span><span class="tc-rare">' + (r === 'SR' ? '★★ SR' : '★ R') + '</span></p></div>' +
      '</div><div class="tc-holo"></div><div class="tc-glare"></div></div>' +
      '<div class="tc-face tc-back" aria-hidden="true"><span class="tc-emblem">책콩<br>카드</span></div></div>';
    if (!mini) wire(el);
    return el;
  }

  // px, py: 0..1 across the card, where the light is.
  function light(card, px, py) {
    card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
    card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
    card.style.setProperty('--hyp', Math.min(1, Math.hypot(px - 0.5, py - 0.5) * 1.6).toFixed(3));
    card.style.setProperty('--rx', ((0.5 - py) * 22).toFixed(2) + 'deg');
    card.style.setProperty('--ry', ((px - 0.5) * 26).toFixed(2) + 'deg');
  }
  function rest(card) {
    card.classList.remove('is-tilting');
    ['--mx', '--my', '--hyp', '--rx', '--ry'].forEach(function (k) { card.style.removeProperty(k); });
  }

  function wire(card) {
    if (card.dataset.tiltWired || card.classList.contains('is-mini')) return;
    card.dataset.tiltWired = '1';
    card.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'mouse' || e.buttons || e.pointerType === 'touch' || e.pointerType === 'pen') {
        var r = card.getBoundingClientRect();
        card.classList.add('is-tilting');
        light(card, clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1));
      }
    });
    ['pointerleave', 'pointercancel', 'pointerup'].forEach(function (t) {
      card.addEventListener(t, function () { rest(card); });
    });
  }

  // ---------- the iPad's tilt ----------
  var gyro = false, zero = null;
  function onTilt(e) {
    if (e.beta == null || e.gamma == null) return;
    if (!zero) zero = { b: e.beta, g: e.gamma };
    var dx = clamp((e.gamma - zero.g) / 25, -1, 1), dy = clamp((e.beta - zero.b) / 25, -1, 1);
    Array.prototype.forEach.call(document.querySelectorAll('.tcard[data-gyro], .rcard[data-gyro]'), function (c) {
      if (c.classList.contains('is-tilting')) return;
      c.classList.add('has-gyro');
      light(c, 0.5 + dx / 2, 0.5 + dy / 2);
    });
  }
  // iPadOS asks once for motion access; it must be called from a tap.
  function enableGyro() {
    if (gyro) return;
    var D = window.DeviceOrientationEvent;
    if (!D) return;
    function start() { gyro = true; window.addEventListener('deviceorientation', onTilt); }
    if (typeof D.requestPermission === 'function') {
      D.requestPermission().then(function (s) { if (s === 'granted') start(); }).catch(function () { /* declined: finger tilt still works */ });
    } else start();
  }
  function recenter() { zero = null; }

  // ---------- booster packs: one series per book type, printed with the book's card art ----------
  var SERIES = { 이야기: '이야기 숲', 생각: '생각 퍼즐', 과학: '과학 별빛', 역사: '역사 시간여행', 마음: '마음 무지개' };
  function series(b) {
    if (b && b.card && b.card.set) return b.card.set;
    var type = typeof b === 'string' ? b : b && b.book_type;
    return (SERIES[type] || '책콩') + ' 시리즈';
  }
  function makePack(b, base) {
    var c = b.card || {};
    var r = c.rarity === 'SR' ? 'SR' : 'R';
    var el = document.createElement('div');
    el.className = 'bpack type-' + (b.book_type || '') + ' rarity-' + r + (c.pack ? ' is-real' : '');
    el.setAttribute('data-tilt', '');
    if (c.pack) {
      // The real booster pack of the card's series.
      el.innerHTML = '<div class="bp-peek bp-peek-real" aria-hidden="true"><img src="' + esc(c.image_small || c.image) + '" alt="" draggable="false" referrerpolicy="no-referrer"></div><div class="bp-body bp-real">' +
        '<img class="bp-photo" src="' + esc(c.pack) + '" alt="" draggable="false" referrerpolicy="no-referrer"><span class="bp-crinkle"></span><span class="bp-shine"></span></div>';
      wire(el);
      return el;
    }
    el.innerHTML =
      '<div class="bp-peek" aria-hidden="true"></div>' +
      '<div class="bp-body">' +
      (c.art ? '<img class="bp-art" src="' + esc((base || '') + c.art) + '" alt="" draggable="false">' : '') +
      '<span class="bp-rays"></span>' +
      '<span class="bp-logo">책콩<br>카드</span>' +
      '<span class="bp-series">' + esc(series(b)) + '</span>' +
      '<span class="bp-rare">' + (r === 'SR' ? '★★ 슈퍼 레어' : '★ 레어') + ' 1장</span>' +
      '<span class="bp-shine"></span>' +
      '</div>';
    wire(el);
    return el;
  }

  window.BookCard = { make: make, makePack: makePack, series: series, cardName: cardName, wire: wire, enableGyro: enableGyro, recenter: recenter };
  function init() { Array.prototype.forEach.call(document.querySelectorAll('.tcard[data-tilt]'), wire); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
