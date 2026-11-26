(function () {
  'use strict';

  var form = document.getElementById('add-book');
  var dataEl = document.getElementById('add-data');
  if (!form || !dataEl) return;

  var DATA = JSON.parse(dataEl.textContent);
  var DRAFT_KEY = 'readcheck:add-draft:v1';
  var live = document.getElementById('add-live');
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // ---------- helpers ----------
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
      [].concat(kid).forEach(function (c) {
        if (c == null || c === false) return;
        el.append(typeof c === 'object' ? c : document.createTextNode(String(c)));
      });
    });
    return el;
  }

  function say(text) { live.textContent = ''; setTimeout(function () { live.textContent = text; }, 30); }

  function norm(s) { return String(s || '').toLowerCase().replace(/[\s\p{P}]/gu, ''); }

  var shelfTitles = DATA.books.map(function (b) { return norm(b.title); });
  var shelfSlugs = DATA.books.map(function (b) { return b.slug; });
  function onShelf(title) {
    var t = norm(title);
    return t !== '' && shelfTitles.some(function (s) { return s === t; });
  }

  // Revised Romanization without sound-change rules: good enough for a readable address.
  var L = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
  var V = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
  var T = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'l', 'l', 'l', 'l', 'l', 'l', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
  function romanize(text) {
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c >= 0xac00 && c <= 0xd7a3) {
        var n = c - 0xac00;
        out += L[Math.floor(n / 588)] + V[Math.floor((n % 588) / 28)] + T[n % 28];
      } else if (/[a-z0-9]/i.test(text[i])) {
        out += text[i].toLowerCase();
      } else {
        out += '-';
      }
    }
    return out.replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50).replace(/-$/, '');
  }

  function uniqueSlug(base) {
    var s = base || 'book';
    var n = 2;
    while (shelfSlugs.indexOf(s) !== -1) s = base + '-' + n++;
    return s;
  }

  function httpsCover(url) {
    if (!url) return '';
    return url.replace(/^http:/, 'https:').replace(/&edge=curl/, '');
  }

  function copyText(text, btn) {
    function done() { var old = btn.textContent; btn.textContent = '복사했어요'; say('복사했어요'); setTimeout(function () { btn.textContent = old; }, 1500); }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = h('textarea', { class: 'sr-only' }); ta.value = text; document.body.append(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* nothing more to try */ }
      ta.remove();
    }
  }

  // ---------- state ----------
  var EMPTY = { title: '', author: '', status: 'reading', started: DATA.today, finished: '', rating: 0, genre: '', pages: '',
    summary: '', quote: '', slug: '', cover: '', isbn: '', published: true, slugTouched: false };
  var book = Object.assign({}, EMPTY);
  var step = 1;

  try {
    var saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (saved && saved.book && typeof saved.book.title === 'string') { book = Object.assign({}, EMPTY, saved.book); step = saved.step || 1; }
  } catch (e) { /* no draft */ }

  function persist() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ book: book, step: step })); } catch (e) { /* unsaved is fine */ }
  }

  // ---------- steps ----------
  function showStep(n, focus) {
    step = n;
    $$('.step', form).forEach(function (s) { s.hidden = Number(s.getAttribute('data-step')) !== n; });
    $$('[data-step-tab]').forEach(function (t) {
      var k = Number(t.getAttribute('data-step-tab'));
      if (k === n) t.setAttribute('aria-current', 'step'); else t.removeAttribute('aria-current');
      t.classList.toggle('done', k < n);
    });
    if (n === 2) fillForm();
    if (n === 3) $('#quiz-command').textContent = '"' + (book.title || '책 제목') + '" 퀴즈 만들어. 사진은 media/inbox에 있어.';
    if (n === 4) renderSave();
    persist();
    if (focus) {
      var heading = $('.step[data-step="' + n + '"] h2', form);
      heading.setAttribute('tabindex', '-1'); heading.focus();
      window.scrollTo({ top: form.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' });
    }
  }

  function goTo(n) {
    if (n > 2 && step <= 2 && !validate()) return;
    showStep(n, true);
  }

  // ---------- step 1: search ----------
  var results = $('#search-results');
  var status = $('#search-status');

  function volumeToBook(v) {
    var info = v.volumeInfo || {};
    var isbn = (info.industryIdentifiers || []).filter(function (x) { return x.type === 'ISBN_13'; })[0];
    var desc = (info.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    var first = desc.split(/(?<=[.!?。])\s/)[0] || '';
    return {
      title: (info.title || '') + (info.subtitle ? ' ' + info.subtitle : ''),
      author: (info.authors || []).join(', '),
      pages: info.pageCount || '',
      genre: '',
      cover: httpsCover(info.imageLinks && (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail)),
      isbn: isbn ? isbn.identifier : '',
      summaryHint: first.length > 140 ? first.slice(0, 137) + '…' : first,
      publisher: info.publisher || '',
      year: (info.publishedDate || '').slice(0, 4)
    };
  }

  function googleBooks(q, lang) {
    var url = 'https://www.googleapis.com/books/v1/volumes?maxResults=12&printType=books&q=' + encodeURIComponent(q) +
      (lang ? '&langRestrict=' + lang : '') + (DATA.booksKey ? '&key=' + encodeURIComponent(DATA.booksKey) : '');
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { return (j.items || []).map(volumeToBook).filter(function (b) { return b.title; }); });
  }

  // Korean queries search Korean books; anything else (English titles) searches every language.
  function langFor(text) { return /[가-힣]/.test(text || '') ? 'ko' : ''; }

  // A real ISBN-13 starts with 978 or 979; Open Library's isbn list also holds ISBN-10s and odd ids.
  function isbn13(list) { return (list || []).filter(function (x) { return /^97[89]\d{10}$/.test(x); })[0] || ''; }

  // Open Library has fewer Korean books but no daily quota, so it backs up Google Books.
  // lang= only prefers that language's editions for the returned fields; it never drops a book.
  function openLibrary(q, lang) {
    var clean = q.replace(/(intitle|inauthor):/g, ' ').replace(/"/g, '').trim();
    var url = 'https://openlibrary.org/search.json?limit=12&fields=title,author_name,cover_i,number_of_pages_median,isbn,first_publish_year,publisher' +
      '&lang=' + (lang === 'ko' ? 'ko' : 'en') + '&q=' + encodeURIComponent(clean);
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
      return (j.docs || []).filter(function (d) { return d.title; }).map(function (d) {
        var isbn = isbn13(d.isbn);
        return {
          title: d.title, author: (d.author_name || []).join(', '), pages: d.number_of_pages_median || '', genre: '',
          cover: d.cover_i ? 'https://covers.openlibrary.org/b/id/' + d.cover_i + '-M.jpg' : '',
          isbn: isbn, summaryHint: '', publisher: (d.publisher || [])[0] || '', year: d.first_publish_year ? String(d.first_publish_year) : ''
        };
      });
    });
  }

  // 도서관 정보나루 (Data4Library) knows almost every Korean book in public libraries. It needs a free key
  // (data4library_key in _config.yml); without one the search starts at Google Books as before.
  // Authors arrive as "글·그림: 백희나;빛그림: 김향수": drop the role labels.
  function data4library(q) {
    var clean = q.replace(/(intitle|inauthor):/g, ' ').replace(/"/g, '').trim();
    var url = 'https://data4library.kr/api/srchBooks?format=json&pageNo=1&pageSize=12&authKey=' + encodeURIComponent(DATA.libraryKey) +
      '&keyword=' + encodeURIComponent(clean);
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
      var res = j.response || {};
      if (res.error) throw new Error(res.error);
      // Results come in loan-count order, so the author's best-loved book can outrank the one asked for.
      var key = norm(clean);
      var docs = (res.docs || []).map(function (x) { return x.doc || {}; }).filter(function (d) { return d.bookname; });
      var hit = function (d) { var t = norm(d.bookname); return key !== '' && (t.indexOf(key) !== -1 || key.indexOf(t) !== -1) ? 0 : 1; };
      docs = docs.map(function (d, i) { return { d: d, i: i }; })
        .sort(function (a, b) { return hit(a.d) - hit(b.d) || a.i - b.i; }).map(function (x) { return x.d; });
      return docs.map(function (d) {
        var authors = String(d.authors || '').split(';').map(function (a) { return a.replace(/^[^:]*:/, '').trim(); }).filter(Boolean);
        return {
          title: d.bookname.trim(), author: authors.join(', '), pages: '', genre: '',
          cover: httpsCover(d.bookImageURL || ''), isbn: /^97[89]\d{10}$/.test(d.isbn13 || '') ? d.isbn13 : '',
          summaryHint: '', publisher: d.publisher || '', year: d.publication_year || ''
        };
      });
    });
  }

  var googleDown = false;
  function fetchBooks(q, lang) {
    var first = lang === 'ko' && DATA.libraryKey ? data4library(q).catch(function () { return []; }) : Promise.resolve([]);
    return first.then(function (list) {
      if (list.length) return list;
      return googleBooks(q, lang).then(function (l) { googleDown = false; return l; }, function () { googleDown = true; return []; }).then(function (l) {
        return l.length ? l : openLibrary(q, lang);
      });
    });
  }

  // Only the newest search may draw: an Enter and a click close together start two.
  var searchSeq = 0;
  function search() {
    var q = $('#book-query').value.trim();
    if (!q) { $('#book-query').focus(); return; }
    var mine = ++searchSeq;
    status.textContent = '찾고 있어요…';
    results.textContent = '';
    fetchBooks(q, langFor(q)).then(function (list) {
      if (mine !== searchSeq) return;
      results.textContent = '';
      if (!list.length) { noResults(q); return; }
      status.textContent = '“' + q + '” 검색 결과 ' + list.length + '권이에요. 맞는 책을 골라요.';
      list.forEach(function (b) { results.append(resultItem(b)); });
    }).catch(function () { if (mine === searchSeq) { results.textContent = ''; noResults(q); } });
  }

  // No hit online: offer the recommendation that matches, the query as a manual entry, and the Claude Code route that finds covers.
  function noResults(q) {
    status.textContent = googleDown
      ? 'Google Books가 오늘 쓸 수 있는 검색 횟수를 다 써서, Open Library에서만 찾아봤는데 없어요.'
      : '“' + q + '”을 찾지 못했어요.';
    var key = norm(q);
    DATA.recommendations.filter(function (r) {
      var t = norm(r.title), a = norm(r.author);
      return key && (t.indexOf(key) !== -1 || key.indexOf(t) !== -1 || a.indexOf(key) !== -1);
    }).forEach(function (r) {
      results.append(resultItem({ title: r.title, author: r.author, genre: r.genre, status: 'reading', note: '추천 목록에 있는 책' }));
    });
    var cmd = '"' + q + '" 책 추가해';
    results.append(h('li', { class: 'no-result' },
      h('div', {},
        h('p', { class: 'result-title' }, '이렇게 해 보세요'),
        h('p', { class: 'muted' }, '제목만으로 바로 등록하거나, Claude Code에 부탁하면 알라딘에서 표지와 ISBN, 쪽수까지 찾아 꽂아 줘요.'),
        h('div', { class: 'copy-line' }, h('code', { id: 'cover-command' }, cmd),
          h('button', { type: 'button', class: 'action ghost small', 'data-copy': '#cover-command' }, '복사'))),
      h('button', { type: 'button', class: 'action small', onclick: function () {
        book = Object.assign({}, EMPTY, { title: q }); book.slug = uniqueSlug(romanize(q)); showStep(2, true);
      } }, '“' + q + '”(으)로 직접 입력')));
  }

  function resultItem(b) {
    var already = onShelf(b.title);
    return h('li', { class: 'result' },
      b.cover ? h('img', { src: b.cover, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : h('div', { class: 'result-nocover', 'aria-hidden': 'true' }, '📖'),
      h('div', { class: 'result-text' },
        h('p', { class: 'result-title' }, b.title),
        h('p', { class: 'muted' }, [b.author, b.publisher, b.year, b.pages ? b.pages + '쪽' : '', b.note].filter(Boolean).join(' · '))),
      already ? h('span', { class: 'chip' }, '이미 책장에 있어요')
        : h('button', { type: 'button', class: 'action small', onclick: function () { pick(b); } }, '이 책 고르기'));
  }

  function pick(b) {
    book = Object.assign({}, EMPTY, {
      title: b.title, author: b.author, genre: b.genre || '', pages: b.pages || '', cover: b.cover || '', isbn: b.isbn || '',
      summary: b.summary || b.summaryHint || '', status: b.status || 'reading', started: DATA.today
    });
    book.slug = uniqueSlug(romanize(book.title));
    say(book.title + '을 골랐어요');
    showStep(2, true);
    if (!book.cover) lookupCover();
  }

  // Recommendations carry title and author only; fill the cover and pages in the background.
  function lookupCover() {
    var want = book.title;
    fetchBooks('intitle:' + book.title + (book.author ? ' inauthor:' + book.author.split(',')[0] : ''), langFor(book.title)).then(function (list) {
      var hit = list.filter(function (x) { return x.cover; })[0];
      if (!hit || book.title !== want) return;
      book.cover = book.cover || hit.cover;
      book.pages = book.pages || hit.pages;
      book.isbn = book.isbn || hit.isbn;
      persist();
      if (step === 2) fillForm();
    }).catch(function () { /* the drawn cover is fine */ });
  }

  // ---------- recommendations ----------
  var level = '';
  function renderRecs() {
    var list = $('#rec-list');
    if (!list) return; // the 책 추가 page now shows the roadmap list (assets/add-next.js) instead
    list.textContent = '';
    DATA.recommendations.filter(function (r) { return !onShelf(r.title) && (!level || r.level === level); }).forEach(function (r, i) {
      list.append(h('li', { class: 'rec-card' },
        h('div', { class: 'book-cover cover-' + (r.title.length % 5) },
          h('span', { class: 'cover-title' }, r.title), h('span', { class: 'cover-author' }, r.author)),
        h('div', { class: 'rec-body' },
          h('span', { class: 'level' }, r.level),
          h('h3', {}, r.title),
          h('p', { class: 'muted' }, r.author),
          h('p', { class: 'rec-why' }, r.why),
          h('div', { class: 'rec-actions' },
            h('button', { type: 'button', class: 'action small', onclick: function () { pick({ title: r.title, author: r.author, genre: r.genre, status: 'reading' }); } }, '읽기 시작'),
            h('button', { type: 'button', class: 'action ghost small', onclick: function () { pick({ title: r.title, author: r.author, genre: r.genre, status: 'want' }); } }, '읽고 싶어요')))));
    });
    if (!list.children.length) list.append(h('li', { class: 'muted' }, '이 단계의 추천 책은 모두 책장에 있어요. 대단해요!'));
  }

  function personalRecs() {
    if (!$('#rec-personal')) return;
    var liked = DATA.books.filter(function (b) { return b.rating >= 4 && b.author; })
      .sort(function (a, b) { return b.rating - a.rating; });
    var authors = [];
    liked.forEach(function (b) { var a = b.author.split(',')[0].trim(); if (authors.indexOf(a) === -1) authors.push(a); });
    authors = authors.slice(0, 2);
    if (!authors.length) return;
    Promise.all(authors.map(function (a) { return fetchBooks('inauthor:"' + a + '"', langFor(a)).catch(function () { return []; }); }))
      .then(function (lists) {
        var seen = {};
        var picks = [].concat.apply([], lists).filter(function (b) {
          var k = norm(b.title);
          if (seen[k] || onShelf(b.title)) return false;
          seen[k] = true;
          return true;
        }).slice(0, 6);
        if (!picks.length) return;
        $('#rec-personal-title').textContent = authors.join(', ') + '의 다른 책';
        picks.forEach(function (b) { $('#rec-personal-list').append(resultItem(b)); });
        $('#rec-personal').hidden = false;
      });
  }

  // ---------- step 2: form ----------
  function buildStatus() {
    var box = $('#status-options');
    DATA.shelves.forEach(function (s) {
      var id = 'status-' + s.key;
      box.append(h('input', { type: 'radio', name: 'status', id: id, value: s.key }),
        h('label', { for: id }, h('i', { class: 'dot', style: '--dot:' + s.color, 'aria-hidden': 'true' }), s.label));
    });
    var stars = $('#rating-input');
    for (var i = 1; i <= 5; i++) {
      stars.append(h('input', { type: 'radio', name: 'rating', id: 'rating-' + i, value: String(i) }),
        h('label', { for: 'rating-' + i, title: i + '점' }, h('span', { 'aria-hidden': 'true' }, '★'), h('span', { class: 'sr-only' }, i + '점')));
    }
  }

  function fillForm() {
    ['title', 'author', 'started', 'finished', 'genre', 'pages', 'summary', 'quote', 'slug', 'cover'].forEach(function (k) {
      var el = form.elements[k];
      if (el && document.activeElement !== el) el.value = book[k] == null ? '' : book[k];
    });
    form.elements.published.checked = book.published !== false;
    $$('input[name=status]', form).forEach(function (r) { r.checked = r.value === book.status; });
    $$('input[name=rating]', form).forEach(function (r) { r.checked = Number(r.value) === Number(book.rating); });
    syncVisibility();
    renderCover();
  }

  function syncVisibility() {
    $$('[data-show-when]', form).forEach(function (el) { el.hidden = el.getAttribute('data-show-when') !== book.status; });
    $('#started-label').textContent = book.status === 'want' ? '읽기 시작한 날 (아직이면 비워요)' : '읽기 시작한 날';
  }

  function renderCover() {
    var box = $('#cover-preview');
    box.textContent = '';
    if (book.cover) {
      box.append(h('div', { class: 'book-cover has-image' }, h('img', { src: book.cover, alt: '', referrerpolicy: 'no-referrer' })));
    } else {
      box.append(h('div', { class: 'book-cover cover-' + ((book.title || '').length % 5) },
        h('span', { class: 'cover-title' }, book.title || '책 제목'), h('span', { class: 'cover-author' }, book.author || '지은이')),
        h('p', { class: 'muted small cover-hint' }, '표지를 못 찾았어요. Claude Code에 "' + (book.title || '책 제목') + '" 책 추가해라고 보내면 표지를 찾아 줘요.'));
    }
  }

  form.addEventListener('input', function (e) {
    var el = e.target;
    if (!el.name || el.id === 'book-query' || el.id === 'photo-check') return;
    if (el.name === 'published') book.published = el.checked;
    else if (el.name === 'rating') book.rating = Number(el.value);
    else if (el.name === 'status') {
      book.status = el.value;
      if (el.value === 'finished' && !book.finished) book.finished = DATA.today;
      if (el.value === 'want') book.started = '';
      else if (!book.started) book.started = DATA.today;
      fillForm();
    } else book[el.name] = el.value;
    if (el.name === 'slug') book.slugTouched = true;
    if (el.name === 'title' && !book.slugTouched) { book.slug = uniqueSlug(romanize(book.title)); form.elements.slug.value = book.slug; }
    if (el.name === 'title' || el.name === 'author' || el.name === 'cover') renderCover();
    persist();
  });

  function validate() {
    var errs = [];
    if (!book.title.trim()) errs.push('제목을 적어 주세요.');
    if (!book.author.trim()) errs.push('지은이를 적어 주세요.');
    if (!book.summary.trim()) errs.push('한두 문장 소개를 적어 주세요.');
    if (!book.slug) book.slug = uniqueSlug(romanize(book.title));
    if (!/^[a-z0-9][a-z0-9-]*$/.test(book.slug)) errs.push('책 주소는 영문 소문자, 숫자, -만 쓸 수 있어요.');
    else if (shelfSlugs.indexOf(book.slug) !== -1) errs.push('같은 주소의 책이 이미 있어요. 책 주소를 바꿔 주세요.');
    if (book.cover && !/^https:\/\//.test(book.cover)) errs.push('표지 그림 주소는 https://로 시작해야 해요.');
    if (book.status === 'finished' && !book.finished) errs.push('다 읽은 날을 적어 주세요.');
    var box = $('#form-errors');
    box.hidden = errs.length === 0;
    box.textContent = errs.join(' ');
    if (errs.length) { if (step !== 2) showStep(2, false); box.scrollIntoView({ block: 'center' }); }
    return errs.length === 0;
  }

  // ---------- step 4: save ----------
  function q(s) { return JSON.stringify(String(s).trim()); }

  function markdown() {
    var lines = ['---', 'title: ' + q(book.title), 'author: ' + q(book.author), 'status: ' + book.status];
    if (book.rating && book.status === 'finished') lines.push('rating: ' + Number(book.rating));
    if (book.genre.trim()) lines.push('genre: ' + q(book.genre));
    if (Number(book.pages) > 0) lines.push('pages: ' + Math.round(Number(book.pages)));
    if (book.started) lines.push('started: ' + book.started);
    if (book.finished && book.status === 'finished') lines.push('finished: ' + book.finished);
    lines.push('summary: ' + q(book.summary));
    if (book.quote.trim()) lines.push('quote: ' + q(book.quote));
    if (book.cover) lines.push('cover: ' + q(book.cover));
    if (book.isbn) lines.push('isbn: ' + q(book.isbn));
    lines.push('published: ' + (book.published !== false));
    lines.push('---', '');
    return lines.join('\n') + '\n';
  }

  function renderSave() {
    var md = markdown();
    $('#md-preview').textContent = md;
    var url = 'https://github.com/' + DATA.repo + '/new/main/' + (DATA.booksDir || '_books') + '?filename=' + encodeURIComponent(book.slug + '.md') + '&value=' + encodeURIComponent(md);
    $('#github-save').href = url;
    var shelf = DATA.shelves.filter(function (s) { return s.key === book.status; })[0] || {};
    var box = $('#save-book');
    box.textContent = '';
    var cover = $('#cover-preview').firstChild;
    box.append(cover ? cover.cloneNode(true) : '', h('div', {},
      h('p', { class: 'save-title' }, book.title),
      h('p', { class: 'muted' }, book.author),
      h('p', {}, h('i', { class: 'dot', style: '--dot:' + (shelf.color || '#999'), 'aria-hidden': 'true' }), ' ', shelf.label || ''),
      h('p', { class: 'muted' }, '주소: /reading/books/' + book.slug + '/')));
  }

  $('#github-save').addEventListener('click', function () {
    // The draft stays until the next visit confirms the book landed; clearing now would lose it if GitHub fails.
    try { localStorage.setItem(DRAFT_KEY + ':saved', book.slug); } catch (e) { /* ignore */ }
  });

  // ---------- photo check ----------
  $('#photo-check').addEventListener('change', function (e) {
    var box = $('#photo-previews');
    box.textContent = '';
    Array.prototype.forEach.call(e.target.files || [], function (f) {
      var url = URL.createObjectURL(f);
      box.append(h('li', {}, h('img', { src: url, alt: f.name, onload: function () { URL.revokeObjectURL(url); } })));
    });
    say((e.target.files || []).length + '장을 골랐어요');
  });

  // ---------- wiring ----------
  form.addEventListener('click', function (e) {
    var t = e.target.closest('button, a');
    if (!t) return;
    if (t.hasAttribute('data-goto')) { e.preventDefault(); goTo(Number(t.getAttribute('data-goto'))); }
    var action = t.getAttribute('data-action');
    if (action === 'search') search();
    if (action === 'manual') { book = Object.assign({}, EMPTY, { title: $('#book-query').value.trim() }); book.slug = uniqueSlug(romanize(book.title)); showStep(2, true); }
    if (action === 'reset') { try { localStorage.removeItem(DRAFT_KEY); } catch (err) { /* ignore */ } book = Object.assign({}, EMPTY); showStep(1, true); }
    if (t.hasAttribute('data-copy')) copyText($(t.getAttribute('data-copy')).textContent, t);
    if (t.classList.contains('filter')) {
      level = t.getAttribute('data-level');
      $$('.filter', form).forEach(function (f) { f.setAttribute('aria-pressed', String(f === t)); });
      renderRecs();
    }
  });
  // e.isComposing: the Enter that ends Korean IME composition is not a search.
  $('#book-query').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    search();
  });
  $$('[data-step-tab]').forEach(function (tab) {
    tab.addEventListener('click', function () { var n = Number(tab.getAttribute('data-step-tab')); if (n < step) showStep(n, true); });
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); });

  // A draft saved to GitHub that is now on the shelf is finished.
  try {
    var savedSlug = localStorage.getItem(DRAFT_KEY + ':saved');
    if (savedSlug && shelfSlugs.indexOf(savedSlug) !== -1) {
      localStorage.removeItem(DRAFT_KEY); localStorage.removeItem(DRAFT_KEY + ':saved');
      book = Object.assign({}, EMPTY); step = 1;
    }
  } catch (e) { /* ignore */ }

  buildStatus();
  renderRecs();
  personalRecs();
  showStep(location.hash === '#recommend' ? 1 : step, false);
  if (location.hash === '#recommend' && $('#recommend')) $('#recommend').scrollIntoView();
})();
