// 부스터 팩: 그 책 카드가 속한 실제 세트의 카드 목록(_data/card_pools)에서 9장을 무작위로 뽑고,
// 10번째 칸에는 그 책의 카드를 넣어요. 카드 앞면은 pokemontcg.io의 공식 스캔, 뒷면은 pokemon.com의
// 공식 카드 뒷면을 바로 불러와요. 저장소에는 카드 그림을 복사하지 않아요.
(function () {
  'use strict';

  // 카드 뒷면: 시몬은 pokemon.com의 공식 뒷면, 소피아는 Google Flow로 그린 뒷면(_kids/sophia/_config.yml의 card_back).
  var BACK = (window.KID && window.KID.card_back) || 'https://tcg.pokemon.com/assets/img/global/tcg-card-back-2x.jpg';
  // 포켓몬: C U R RR UR IR SIR HR ACE. 디즈니 로카나: C U R SR(슈퍼 레어) L(레전더리) EP(에픽) E(인챈티드) IC(아이코닉).
  var LABEL = { C: '커먼', U: '언커먼', R: '레어', RR: '더블 레어', UR: '울트라 레어', IR: '일러스트 레어', SIR: '스페셜 일러스트 레어', HR: '하이퍼 레어', ACE: '에이스 스펙',
    SR: '슈퍼 레어', L: '레전더리', EP: '에픽', E: '인챈티드', IC: '아이코닉' };
  var RANK = { C: 0, U: 1, R: 2, ACE: 3, RR: 4, UR: 5, IR: 6, HR: 7, SIR: 8, SR: 4, L: 5, EP: 6, E: 7, IC: 8 };
  var HITS = { RR: 1, UR: 1, IR: 1, SIR: 1, HR: 1, ACE: 1, SR: 1, L: 1, EP: 1, E: 1, IC: 1 };
  // 9번 칸이 좋은 카드로 바뀌는 확률. 실제 팩에서 알려진 대략적인 확률이에요.
  // 다 더하면 약 36%라서, 좋은 카드가 나올 때도 있고 안 나올 때도 있어요.
  var ODDS = [['SIR', 1 / 32], ['HR', 1 / 55], ['IR', 1 / 13], ['UR', 1 / 15], ['RR', 1 / 6]];
  var ODDS_LORCANA = [['IC', 1 / 400], ['E', 1 / 96], ['EP', 1 / 48], ['L', 1 / 14], ['SR', 1 / 5]];

  function rnd() {
    try { var a = new Uint32Array(1); window.crypto.getRandomValues(a); return a[0] / 4294967296; } catch (e) { return Math.random(); }
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function codeOf(card) {
    var l = (card && card.rarity_label) || '';
    if (/스페셜/.test(l)) return 'SIR';
    if (/인챈티드/.test(l)) return 'E';
    if (/아이코닉/.test(l)) return 'IC';
    if (/에픽/.test(l)) return 'EP';
    if (/레전더리/.test(l)) return 'L';
    if (/슈퍼/.test(l)) return 'SR';
    if (/하이퍼|골드/.test(l)) return 'HR';
    if (/일러스트/.test(l)) return 'IR';
    if (/울트라/.test(l)) return 'UR';
    if (/더블/.test(l)) return 'RR';
    return card && card.rarity === 'SR' ? 'IR' : 'R';
  }

  // pool: {set, img, cards: [[number, name, code, kind], ...]}; card: the book's card from _data/weekly.yml.
  // A Lorcana pool ({game: "lorcana"}) adds each card's picture id as a fifth value: pictures are at img + size + "/" + id + ".avif".
  function draw(pool, card) {
    var game = pool && pool.game || 'pokemon';
    var book = { id: card.tcg_id, name: card.name, code: codeOf(card), img: card.image_small || card.image, big: card.image || card.image_small, book: true, label: card.rarity_label, game: game };
    if (!pool || !pool.cards || !pool.cards.length) return [book];
    var used = {}; used[card.tcg_id] = 1;
    function id(row) { return pool.set + '-' + row[0]; }
    function entry(row, rev) {
      used[id(row)] = 1;
      var pic = row[4] ? { img: pool.img + 'normal/' + row[4] + '.avif', big: pool.img + 'large/' + row[4] + '.avif' } : { img: pool.img + row[0] + '.png', big: pool.img + row[0] + '_hires.png' };
      return { id: id(row), name: row[1], code: row[2], rev: !!rev, img: pic.img, big: pic.big, game: game };
    }
    function take(codes, rev) {
      var all = pool.cards.filter(function (r) { return codes.indexOf(r[2]) >= 0; });
      var fresh = all.filter(function (r) { return !used[id(r)]; });
      var list = fresh.length ? fresh : all;
      return list.length ? entry(list[Math.floor(rnd() * list.length)], rev) : null;
    }
    function reverse() { var r = rnd(); return take(r < 0.6 ? ['C'] : r < 0.9 ? ['U'] : ['R'], true) || take(['C', 'U'], true); }
    var out = [], i;
    for (i = 0; i < 4; i++) out.push(take(['C']));
    for (i = 0; i < 3; i++) out.push(take(['U']));
    out.push(reverse());
    var odds = game === 'lorcana' ? ODDS_LORCANA : ODDS, r = rnd(), acc = 0, hit = null;
    for (i = 0; i < odds.length; i++) { acc += odds[i][1]; if (r < acc) { hit = take([odds[i][0]]); break; } }
    out.push(hit || reverse());
    out = out.filter(Boolean);
    out.push(book);
    return out;
  }

  function isHit(e) { return !!(e && (e.book || HITS[e.code])); }
  function label(e) { return e.label || (e.rev ? (e.game === 'lorcana' ? '포일 ' + (LABEL[e.code] || '') : '리버스 홀로' + (e.code === 'R' ? ' 레어' : '')) : LABEL[e.code] || '카드'); }
  function rank(e) { return (e.book ? 20 : 0) + (RANK[e.code] || 0) + (e.rev ? 0.5 : 0); }
  function classes(e) { return 'code-' + e.code + ' g-' + (e.game || 'pokemon') + (e.rev ? ' is-rev' : '') + (isHit(e) ? ' is-hit' : '') + (e.book ? ' is-book' : ''); }

  // A 3D card with the official front and back, a thin core for its edge, and foil by rarity.
  function make(e, big) {
    var el = document.createElement('div');
    el.className = 'rcard ' + classes(e);
    el.setAttribute('data-tilt', '');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', e.name + ', ' + label(e));
    el.innerHTML = '<div class="rc-inner"><i class="rc-core"></i><i class="rc-core rc-core2"></i>' +
      '<div class="rc-face rc-front"><img src="' + esc(big ? e.big || e.img : e.img) + '" alt="" draggable="false" referrerpolicy="no-referrer">' +
      '<span class="rc-foil"></span><span class="rc-glitter"></span><span class="rc-glare"></span></div>' +
      '<div class="rc-face rc-back"><img src="' + BACK + '" alt="" draggable="false" referrerpolicy="no-referrer"></div></div>';
    return el;
  }

  function mini(e, count) {
    var el = document.createElement('span');
    el.className = 'rmini ' + classes(e);
    el.title = e.name + ' · ' + label(e);
    el.innerHTML = '<img src="' + esc(e.img) + '" alt="' + esc(e.name + ', ' + label(e)) + '" loading="lazy" referrerpolicy="no-referrer">' +
      (count > 1 ? '<b class="rm-count">×' + count + '</b>' : '');
    return el;
  }

  // Load the big pictures before the pack is torn, so the cards are ready when they come out.
  function preload(list) {
    var urls = [BACK].concat((list || []).map(function (e) { return e.big || e.img; }));
    urls.forEach(function (u) { var i = new Image(); i.referrerPolicy = 'no-referrer'; i.src = u; });
  }

  window.BoosterPack = { draw: draw, make: make, mini: mini, label: label, rank: rank, isHit: isHit, codeOf: codeOf, preload: preload, BACK: BACK };
})();
