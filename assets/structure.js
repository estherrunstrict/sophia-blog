(function () {
  'use strict';

  // Copy buttons on book pages ([data-copy-target] names the id of the text to copy).
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-copy-target]');
    if (!btn) return;
    var src = document.getElementById(btn.getAttribute('data-copy-target'));
    if (!src || !navigator.clipboard) return;
    navigator.clipboard.writeText(src.textContent).then(function () {
      var old = btn.textContent; btn.textContent = '복사했어요';
      setTimeout(function () { btn.textContent = old; }, 1500);
    });
  });

  var root = document.getElementById('structure-pad');
  if (!root) return;

  var W = 1600, H = 1200;
  var KEY = 'readcheck:structure:v1:' + root.getAttribute('data-book-id');
  var TITLE = root.getAttribute('data-book-title') || '';
  var INK = '#182c52', PAPER = '#fffdf7';
  var COLORS = [['#182c52', '남색'], ['#2549c7', '파랑'], ['#c2410c', '주황'], ['#236c50', '초록'], ['#8a3d6a', '보라'], ['#e0a010', '노랑']];
  var SIZES = [['가는 펜', 5], ['보통 펜', 10], ['굵은 펜', 22]];

  var TEMPLATES = {
    mountain: {
      label: '이야기 산',
      prompts: [['처음', '누가, 언제, 어디에 있었나요?'], ['사건', '어떤 일이 생겼나요?'], ['절정', '가장 긴장되거나 신났던 순간은요?'], ['해결', '문제는 어떻게 풀렸나요?'], ['끝', '마지막에 무엇이 달라졌나요?']]
    },
    three: {
      label: '처음 · 가운데 · 끝',
      prompts: [['처음', '이야기는 어떻게 시작했나요?'], ['가운데', '가장 중요한 일은 무엇이었나요?'], ['끝', '어떻게 끝났고, 내 느낌은 어땠나요?']]
    },
    map: {
      label: '생각 지도',
      prompts: [['인물', '누가 나왔나요?'], ['장소', '어디에서 일어났나요?'], ['사건', '무슨 일이 있었나요?'], ['느낌', '읽고 나서 어떤 기분이었나요?'], ['배운 점', '새로 알게 된 것은요?'], ['궁금한 점', '더 알고 싶은 것은요?']]
    }
  };

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

  // ---------- saved state: vector strokes in 0..1 coordinates ----------
  var state = { template: TEMPLATES[root.getAttribute('data-template')] ? root.getAttribute('data-template') : 'mountain', strokes: [], redo: [] };
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && Array.isArray(saved.strokes) && TEMPLATES[saved.template]) { state.template = saved.template; state.strokes = saved.strokes; }
  } catch (e) { /* start blank */ }

  var saveTimer;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify({ template: state.template, strokes: state.strokes })); savedNote.textContent = '이 기기에 저장했어요'; }
      catch (e) { savedNote.textContent = '저장 공간이 가득 차서 저장하지 못했어요. 그림 저장하기로 파일을 받아 두세요.'; }
    }, 400);
  }

  // ---------- template drawing ----------
  function font(px, weight) { return (weight || 700) + ' ' + px + 'px "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", sans-serif'; }

  function label(ctx, text, x, y, size, color) {
    ctx.font = font(size); ctx.fillStyle = color || INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  function drawTemplate(ctx) {
    ctx.save();
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#e8e2d2'; ctx.lineWidth = 2;
    for (var y = 80; y < H; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.strokeStyle = '#9aa7c2'; ctx.lineWidth = 6; ctx.setLineDash([22, 18]); ctx.lineCap = 'round';
    var t = state.template;
    if (t === 'mountain') {
      var pts = [[90, 1080], [560, 640], [920, 200], [1260, 760], [1520, 1080]];
      ctx.beginPath(); ctx.moveTo(40, 1100);
      ctx.bezierCurveTo(300, 1080, 420, 800, 560, 640); ctx.bezierCurveTo(700, 480, 820, 220, 920, 200);
      ctx.bezierCurveTo(1040, 180, 1140, 560, 1260, 760); ctx.bezierCurveTo(1360, 930, 1440, 1080, 1560, 1100); ctx.stroke();
      ctx.setLineDash([]);
      var names = TEMPLATES.mountain.prompts;
      var offs = [[60, -60], [-150, -20], [0, -80], [150, -20], [-40, -60]];
      pts.forEach(function (p, i) {
        ctx.fillStyle = '#2549c7'; ctx.beginPath(); ctx.arc(p[0], p[1], 16, 0, Math.PI * 2); ctx.fill();
        label(ctx, names[i][0], p[0] + offs[i][0], p[1] + offs[i][1], 44);
      });
    } else if (t === 'three') {
      ctx.setLineDash([]);
      var names3 = TEMPLATES.three.prompts;
      for (var i = 0; i < 3; i++) {
        var x = 60 + i * 510;
        ctx.strokeStyle = '#9aa7c2'; ctx.lineWidth = 5;
        roundRect(ctx, x, 150, 460, 990, 36); ctx.stroke();
        ctx.fillStyle = ['#e8eefc', '#fff4c7', '#e3f1ea'][i]; roundRect(ctx, x, 150, 460, 110, 36); ctx.fill();
        label(ctx, names3[i][0], x + 230, 205, 48);
        if (i < 2) { label(ctx, '→', x + 485, 645, 48, '#9aa7c2'); }
      }
      label(ctx, TITLE, W / 2, 80, 40, '#53647e');
    } else {
      ctx.setLineDash([]);
      var cx = W / 2, cy = H / 2;
      var namesM = TEMPLATES.map.prompts;
      namesM.forEach(function (n, k) {
        var a = -Math.PI / 2 + k * Math.PI * 2 / namesM.length;
        var x2 = cx + Math.cos(a) * 520, y2 = cy + Math.sin(a) * 400;
        ctx.strokeStyle = '#9aa7c2'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(x2, y2, 150, 70, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        label(ctx, n[0], x2, y2, 40);
      });
      ctx.fillStyle = '#ffe16b'; ctx.beginPath(); ctx.ellipse(cx, cy, 230, 120, 0, 0, Math.PI * 2); ctx.fill();
      label(ctx, TITLE.length > 14 ? TITLE.slice(0, 13) + '…' : TITLE, cx, cy, 44);
    }
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, hgt, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hgt, r); ctx.arcTo(x + w, y + hgt, x, y + hgt, r);
    ctx.arcTo(x, y + hgt, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawStroke(ctx, s) {
    var p = s.p;
    if (!p.length) return;
    ctx.save();
    ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = s.c; ctx.fillStyle = s.c; ctx.lineWidth = s.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0][0] * W, p[0][1] * H, s.w / 2, 0, Math.PI * 2); ctx.fill(); }
    else {
      ctx.beginPath(); ctx.moveTo(p[0][0] * W, p[0][1] * H);
      for (var i = 1; i < p.length - 1; i++) {
        var mx = (p[i][0] + p[i + 1][0]) / 2 * W, my = (p[i][1] + p[i + 1][1]) / 2 * H;
        ctx.quadraticCurveTo(p[i][0] * W, p[i][1] * H, mx, my);
      }
      ctx.lineTo(p[p.length - 1][0] * W, p[p.length - 1][1] * H); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- UI ----------
  var tool = { color: COLORS[0][0], size: SIZES[1][1], erase: false };
  var bg = h('canvas', { class: 'sp-bg', width: W, height: H, 'aria-hidden': 'true' });
  var ink = h('canvas', { class: 'sp-ink', width: W, height: H, role: 'img', 'aria-label': '책의 구조를 그리는 종이' });
  var bctx = bg.getContext('2d'), ictx = ink.getContext('2d');
  var savedNote = h('span', { class: 'muted', 'aria-live': 'polite' });
  var promptsBox = h('ol', { class: 'sp-prompts' });

  function redrawAll() {
    drawTemplate(bctx);
    ictx.clearRect(0, 0, W, H);
    state.strokes.forEach(function (s) { drawStroke(ictx, s); });
    undoBtn.disabled = state.strokes.length === 0;
    redoBtn.disabled = state.redo.length === 0;
  }

  function renderPrompts() {
    promptsBox.textContent = '';
    TEMPLATES[state.template].prompts.forEach(function (p) { promptsBox.append(h('li', {}, h('strong', {}, p[0]), ' ', p[1])); });
  }

  var tabs = h('div', { class: 'sp-tabs', role: 'radiogroup', 'aria-label': '구조 모양' });
  Object.keys(TEMPLATES).forEach(function (k) {
    tabs.append(h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(k === state.template), 'data-template': k,
      onclick: function () {
        if (k === state.template) return;
        if (state.strokes.length && !window.confirm('모양을 바꾸면 지금 그림 위에 새 모양이 깔려요. 바꿀까요?')) return;
        state.template = k;
        Array.prototype.forEach.call(tabs.children, function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-template') === k)); });
        renderPrompts(); redrawAll(); persist();
      }
    }, TEMPLATES[k].label));
  });

  var palette = h('div', { class: 'sp-palette', role: 'radiogroup', 'aria-label': '펜 색' });
  COLORS.forEach(function (c, i) {
    palette.append(h('button', {
      type: 'button', role: 'radio', class: 'sp-color', style: '--c:' + c[0], 'aria-label': c[1], 'aria-checked': String(i === 0),
      onclick: function (e) { tool.color = c[0]; tool.erase = false; markTools(e.currentTarget); }
    }));
  });
  var eraser = h('button', { type: 'button', role: 'radio', class: 'sp-tool', 'aria-checked': 'false', onclick: function (e) { tool.erase = true; markTools(e.currentTarget); } }, '지우개');
  palette.append(eraser);

  function markTools(active) {
    Array.prototype.forEach.call(palette.children, function (b) { b.setAttribute('aria-checked', String(b === active)); });
  }

  var sizes = h('div', { class: 'sp-sizes', role: 'radiogroup', 'aria-label': '펜 굵기' });
  SIZES.forEach(function (s, i) {
    sizes.append(h('button', {
      type: 'button', role: 'radio', class: 'sp-size', 'aria-checked': String(i === 1), 'aria-label': s[0],
      onclick: function (e) { tool.size = s[1]; Array.prototype.forEach.call(sizes.children, function (b) { b.setAttribute('aria-checked', String(b === e.currentTarget)); }); }
    }, h('i', { style: '--s:' + Math.max(4, s[1] / 1.6) + 'px', 'aria-hidden': 'true' })));
  });

  var undoBtn = h('button', { type: 'button', class: 'sp-tool', onclick: function () { if (state.strokes.length) { state.redo.push(state.strokes.pop()); redrawAll(); persist(); } } }, '되돌리기');
  var redoBtn = h('button', { type: 'button', class: 'sp-tool', onclick: function () { if (state.redo.length) { state.strokes.push(state.redo.pop()); redrawAll(); persist(); } } }, '다시 하기');
  var clearBtn = h('button', { type: 'button', class: 'sp-tool', onclick: function () {
    if (!state.strokes.length || !window.confirm('그린 것을 모두 지울까요?')) return;
    state.strokes = []; state.redo = []; redrawAll(); persist();
  } }, '모두 지우기');
  var saveBtn = h('button', { type: 'button', class: 'action small', onclick: download }, '그림 저장하기');

  function download() {
    var out = h('canvas', { width: W, height: H });
    var o = out.getContext('2d');
    o.drawImage(bg, 0, 0); o.drawImage(ink, 0, 0);
    var d = new Date();
    var stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    out.toBlob(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = h('a', { href: url, download: root.getAttribute('data-book-id') + '-structure-' + stamp + '.png' });
      document.body.append(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }, 'image/png');
  }

  // ---------- pointer drawing ----------
  var current = null;
  function point(e) {
    var r = ink.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  }
  ink.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    ink.setPointerCapture(e.pointerId);
    var w = tool.erase ? tool.size * 2.5 : tool.size * (e.pointerType === 'pen' && e.pressure ? 0.6 + e.pressure : 1);
    current = { c: tool.color, w: Math.round(w), erase: tool.erase || undefined, p: [point(e)] };
    state.strokes.push(current); state.redo = [];
    drawStroke(ictx, current);
    e.preventDefault();
  });
  ink.addEventListener('pointermove', function (e) {
    if (!current) return;
    var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    evs.forEach(function (ev) { var p = point(ev); p[0] = Math.round(p[0] * 10000) / 10000; p[1] = Math.round(p[1] * 10000) / 10000; current.p.push(p); });
    ictx.clearRect(0, 0, W, H);
    state.strokes.forEach(function (s) { drawStroke(ictx, s); });
  });
  function end() { if (!current) return; current = null; redrawAll(); persist(); }
  ink.addEventListener('pointerup', end);
  ink.addEventListener('pointercancel', end);

  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || !root.contains(document.activeElement)) return;
    e.preventDefault();
    (e.shiftKey ? redoBtn : undoBtn).click();
  });

  root.textContent = '';
  root.append(
    h('div', { class: 'sp-top' }, tabs, savedNote),
    h('div', { class: 'sp-layout' },
      h('div', { class: 'sp-board' }, h('div', { class: 'sp-paper' }, bg, ink),
        h('div', { class: 'sp-toolbar' }, palette, sizes, h('div', { class: 'sp-actions' }, undoBtn, redoBtn, clearBtn, saveBtn))),
      h('aside', { class: 'sp-side' }, h('h3', {}, '이렇게 채워 봐요'), promptsBox,
        h('p', { class: 'muted' }, '손가락이나 펜, 마우스로 그려요. 글씨로 적어도 좋아요.'),
        h('p', { class: 'muted small' }, '저장한 그림은 Mac의 다운로드 폴더에 생겨요. 어른이 scripts/drive_archive.py sweep을 실행하면 Google Drive로 옮기고 Mac에서는 지워요.'))));
  renderPrompts();
  if (document.fonts && document.fonts.load) document.fonts.load(font(44)).then(redrawAll, redrawAll); else redrawAll();
  redrawAll();
})();
