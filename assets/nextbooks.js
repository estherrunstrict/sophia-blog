// The two books the reader picks ahead of time for "next" (책 추가 page), kept on this iPad.
// Each picked book gets its own real booster pack: the book's first pack, or its second one when the other
// picked book already has that pack, so the two packs he chooses between are never the same.
// The reading page reads the same list: when a book is finished, Simon chooses one of these two.
(function () {
  'use strict';
  var KEY = 'readcheck:next:v1';
  var QUEST = 'readcheck:quest:v1';
  var IMG = 'https://images.pokemontcg.io/';
  var el = document.getElementById('catalog-data');
  var catalog = [];
  try { catalog = el ? JSON.parse(el.textContent) : []; } catch (e) { catalog = []; }
  var bySlug = {};
  catalog.forEach(function (b) { bySlug[b.slug] = b; });

  function load() {
    var s;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
    s = s || {};
    s.slots = Array.isArray(s.slots) ? s.slots.slice(0, 2) : [];
    while (s.slots.length < 2) s.slots.push(null);
    s.slots = s.slots.map(function (x) { return x && bySlug[x] ? x : null; });
    s.packs = s.packs || {};
    return s;
  }
  function store(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ } }
  function quest() { try { return JSON.parse(localStorage.getItem(QUEST) || 'null') || {}; } catch (e) { return {}; } }

  function setOf(card) { return String(card.tcg_id).split('-')[0]; }
  function packIndex(s, slug) { var i = s.packs[slug]; return i === 1 && bySlug[slug].cards[1] ? 1 : 0; }
  function cardOf(s, slug) { var b = bySlug[slug]; return b && b.cards[packIndex(s, slug)]; }

  // The book as the reading page knows books (same fields as _data/weekly.yml).
  function shape(b, card) {
    if (!b) return null;
    var sid = setOf(card), num = String(card.tcg_id).split('-')[1];
    // Pokémon cards are found by set and number on pokemontcg.io; other games give their pictures in the data.
    var big = card.image || IMG + sid + '/' + num + '_hires.png', small = card.image_small || IMG + sid + '/' + num + '.png';
    return {
      slug: b.slug, title: b.title, author: b.author, publisher: b.publisher, isbn: b.isbn || '', pages: b.pages || 0,
      size_mm: b.size || [150, 215, 14], cover: b.cover || '', book_type: '', genre: '', tier: b.tier, power: b.power,
      about: b.power, n: b.n, fromNext: true,
      card: {
        tcg_id: card.tcg_id, name: card.name, name_ko: card.name_ko, rarity_label: card.rarity_label || '스페셜 일러스트 레어', set: card.set,
        image: big, image_small: small, pack: card.pack,
        number: b.n, rarity: 'SR'
      }
    };
  }

  function norm(t) { return String(t || '').toLowerCase().replace(/[\s\p{P}]/gu, ''); }

  // Where Simon is: reading a book, about to open its pack, finished (time to choose), or not started.
  function status() {
    var q = quest(), h = q.history || [], last = h[h.length - 1];
    if (q.pick && !q.doneAt && q.pickBook) return { phase: 'reading', book: q.pickBook };
    if (last && last.card && !last.opened && !last.trial) return { phase: 'opening', book: last };
    if (last) return { phase: 'choose', book: last };
    return { phase: 'start' };
  }

  var api = {
    catalog: catalog,
    find: function (slug) { return bySlug[slug] || null; },
    slots: function () { return load().slots.slice(); },
    card: function (slug) { var s = load(); return bySlug[slug] ? cardOf(s, slug) : null; },
    book: function (slug) { var s = load(); return bySlug[slug] ? shape(bySlug[slug], cardOf(s, slug)) : null; },
    // The books to choose between, as reading-page books.
    pair: function () { var s = load(); return s.slots.filter(Boolean).map(function (x) { return shape(bySlug[x], cardOf(s, x)); }); },
    status: status,
    // Read already: finished on this iPad, or on the shelf (titles from the site).
    readTitles: function (shelf) {
      var q = quest(), out = {};
      (q.history || []).forEach(function (h) { if (!h.trial) out[norm(h.title)] = true; });
      (shelf || []).forEach(function (t) { out[norm(t)] = true; });
      return out;
    },
    norm: norm,
    // Picking and changing are open until the book being read is finished; after that, Simon chooses.
    locked: function () {
      var p = status().phase, s = load();
      return (p === 'opening' || p === 'choose') && s.slots[0] && s.slots[1];
    },
    put: function (i, slug) {
      var s = load();
      if (!bySlug[slug] || (i !== 0 && i !== 1)) return false;
      var j = s.slots.indexOf(slug);
      if (j !== -1) s.slots[j] = null;
      s.slots[i] = slug;
      var other = s.slots[1 - i];
      var otherSet = other ? setOf(cardOf(s, other)) : null;
      var cards = bySlug[slug].cards;
      s.packs[slug] = otherSet && cards[1] && setOf(cards[0]) === otherSet ? 1 : 0;
      store(s);
      return true;
    },
    remove: function (slug) {
      var s = load(), j = s.slots.indexOf(slug);
      if (j === -1) return;
      s.slots[j] = null;
      delete s.packs[slug];
      store(s);
    },
    // Simon chose this one: it leaves the list, the other stays for next time.
    take: function (slug) {
      var s = load(), j = s.slots.indexOf(slug);
      if (j === -1) return;
      s.slots[j] = null;
      store(s);
    }
  };
  window.NextBooks = api;
})();
