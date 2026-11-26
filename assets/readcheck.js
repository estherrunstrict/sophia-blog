(function () {
  'use strict';

  var KEY_PREFIX = 'readcheck:v1:';
  var MAX_ATTEMPTS = 20;
  var SHOWN_ATTEMPTS = 5;

  // Boundary: turn the embedded JSON into a quiz, or null when anything is off.
  // "answer" arrives 1-based from the book file and leaves 0-based.
  function parseQuiz(text) {
    var raw;
    try { raw = JSON.parse(text); } catch (e) { return null; }
    if (!Array.isArray(raw) || raw.length === 0) return null;
    var quiz = [];
    for (var i = 0; i < raw.length; i++) {
      var it = raw[i];
      if (!it || !isText(it.q)) return null;
      if (!Array.isArray(it.choices) || it.choices.length < 2 || !it.choices.every(isText)) return null;
      if (!Number.isInteger(it.answer) || it.answer < 1 || it.answer > it.choices.length) return null;
      quiz.push({ q: it.q, choices: it.choices, answer: it.answer - 1, why: isText(it.why) ? it.why : '' });
    }
    return quiz;
  }

  function isText(v) { return typeof v === 'string' && v.trim() !== ''; }

  // State: intro | question {index, picks} | result {picks}.
  // picks[i] is the choice picked for question i. A question counts as answered
  // when picks.length === index + 1.
  var INTRO = { phase: 'intro' };

  function transition(state, action, total) {
    switch (state.phase) {
      case 'intro':
        return action.type === 'start' ? { phase: 'question', index: 0, picks: [] } : state;
      case 'question':
        if (action.type === 'pick' && state.picks.length === state.index) {
          return { phase: 'question', index: state.index, picks: state.picks.concat(action.choice) };
        }
        if (action.type === 'next' && state.picks.length === state.index + 1) {
          return state.index + 1 < total
            ? { phase: 'question', index: state.index + 1, picks: state.picks }
            : { phase: 'result', picks: state.picks };
        }
        return state;
      case 'result':
        return action.type === 'restart' ? { phase: 'question', index: 0, picks: [] } : state;
      default:
        return state;
    }
  }

  function grade(quiz, picks, passPercent) {
    var missed = [];
    quiz.forEach(function (it, i) { if (picks[i] !== it.answer) missed.push(i); });
    var total = quiz.length;
    var correct = total - missed.length;
    return { correct: correct, total: total, missed: missed, passed: correct * 100 >= passPercent * total };
  }

  function feedback(item, pick) {
    var text = pick === item.answer ? '정답이에요!' : '아쉬워요. 정답은 ' + (item.answer + 1) + '번이에요.';
    return item.why ? text + ' ' + item.why : text;
  }

  function resultText(g) {
    return g.total + '문제 중 ' + g.correct + '문제를 맞혔어요. ' + (g.passed ? '통과했어요.' : '조금 더 도전해 봐요.');
  }

  function statusText(state, ctx) {
    if (state.phase === 'question' && state.picks.length === state.index + 1) {
      return feedback(ctx.quiz[state.index], state.picks[state.index]);
    }
    if (state.phase === 'result') return resultText(grade(ctx.quiz, state.picks, ctx.passPercent));
    return '';
  }

  function isBetter(next, prev) {
    if (!prev) return true;
    if (next.passed !== prev.passed) return next.passed;
    return next.correct / next.total > prev.correct / prev.total;
  }

  function isScore(r) {
    return !!r && Number.isInteger(r.correct) && Number.isInteger(r.total) && r.total > 0 &&
      r.correct >= 0 && r.correct <= r.total && typeof r.at === 'string';
  }

  function isRecord(r) { return isScore(r) && typeof r.passed === 'boolean'; }

  function isAttempt(a) { return isScore(a) && !isNaN(Date.parse(a.at)); }

  // The stored record is the best result plus the last attempts. Records saved before
  // attempts existed have none, so attempts always leaves here as an array.
  function parseRecord(rec) {
    if (!isRecord(rec)) return null;
    var attempts = Array.isArray(rec.attempts) ? rec.attempts.filter(isAttempt) : [];
    return {
      correct: rec.correct, total: rec.total, passed: rec.passed, at: rec.at,
      attempts: attempts.slice(-MAX_ATTEMPTS).map(function (a) { return { correct: a.correct, total: a.total, at: a.at }; })
    };
  }

  // localStorage can throw (private mode, blocked storage, quota), so every access is guarded.
  function readBest(id) {
    try {
      var text = window.localStorage.getItem(KEY_PREFIX + id);
      return text ? parseRecord(JSON.parse(text)) : null;
    } catch (e) {
      return null;
    }
  }

  function writeBest(id, rec) {
    try { window.localStorage.setItem(KEY_PREFIX + id, JSON.stringify(rec)); } catch (e) { /* the quiz still works unsaved */ }
  }

  // The best fields only change when this attempt beats them; the attempt is always appended.
  function addAttempt(prev, g, at) {
    var attempt = { correct: g.correct, total: g.total, at: at };
    var best = { correct: g.correct, total: g.total, passed: g.passed, at: at };
    if (!isBetter(best, prev)) best = prev;
    return {
      correct: best.correct, total: best.total, passed: best.passed, at: best.at,
      attempts: (prev ? prev.attempts : []).concat(attempt).slice(-MAX_ATTEMPTS)
    };
  }

  function formatDate(iso) {
    var d = new Date(iso);
    return d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate();
  }

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

  function bestLine(best) {
    if (!best) return null;
    return h('p', { class: 'rc-best' }, '내 최고 기록 ' + best.correct + ' / ' + best.total + (best.passed ? ' (통과 ✓)' : ''));
  }

  // Built here, not in the page, so it never shows when scripts are off and window.print() can't work.
  function printButton() {
    return h('button', { type: 'button', class: 'action outline', onclick: function () { window.print(); } }, '퀴즈 인쇄하기');
  }

  function historyList(record) {
    var attempts = record ? record.attempts.slice(-SHOWN_ATTEMPTS).reverse() : [];
    if (attempts.length === 0) return null;
    return h('div', { class: 'rc-history' },
      h('h4', {}, '지난 기록'),
      h('ul', {}, attempts.map(function (a) {
        return h('li', {}, h('span', {}, formatDate(a.at)), h('span', {}, a.correct + ' / ' + a.total));
      })));
  }

  function render(state, ctx, dispatch) {
    var quiz = ctx.quiz;
    if (state.phase === 'intro') {
      return h('div', { class: 'rc-card' },
        h('p', {}, '이 책을 정말 읽었는지 ' + quiz.length + '문제로 확인해 봐요.'),
        h('p', { class: 'muted' }, ctx.passPercent + '% 이상 맞히면 통과예요.'),
        bestLine(ctx.record),
        historyList(ctx.record),
        h('div', { class: 'rc-actions' },
          h('button', { type: 'button', class: 'action', onclick: function () { dispatch({ type: 'start' }); } }, '시작하기'),
          printButton()));
    }

    if (state.phase === 'question') {
      var item = quiz[state.index];
      var answered = state.picks.length === state.index + 1;
      var pick = state.picks[state.index];
      var last = state.index + 1 === quiz.length;
      return h('div', { class: 'rc-card' },
        h('p', { class: 'rc-progress' }, (state.index + 1) + ' / ' + quiz.length),
        h('h3', { tabindex: '-1', 'data-rc-focus': !answered }, item.q),
        h('ul', { class: 'rc-choices' }, item.choices.map(function (choice, i) {
          var mark = '';
          if (answered && i === item.answer) mark = ' (정답)';
          else if (answered && i === pick) mark = ' (내가 고른 답)';
          var cls = 'rc-choice' + (answered && i === item.answer ? ' is-right' : '') + (answered && i === pick && i !== item.answer ? ' is-wrong' : '');
          return h('li', {},
            h('button', {
              type: 'button', class: cls, 'aria-disabled': answered ? 'true' : null,
              onclick: function () { dispatch({ type: 'pick', choice: i }); }
            }, h('span', { class: 'rc-num' }, String(i + 1)), h('span', {}, choice + mark)));
        })),
        answered ? h('p', { class: 'rc-feedback' }, feedback(item, pick)) : null,
        answered ? h('button', { type: 'button', class: 'action', 'data-rc-focus': true, onclick: function () { dispatch({ type: 'next' }); } }, last ? '결과 보기' : '다음') : null);
    }

    var g = grade(quiz, state.picks, ctx.passPercent);
    return h('div', { class: 'rc-card rc-result' },
      h('h3', { tabindex: '-1', 'data-rc-focus': true }, g.passed ? '통과 ✓' : '다시 도전'),
      h('p', { class: 'rc-score' }, g.correct + ' / ' + g.total),
      h('p', { class: 'muted' }, '통과 기준은 ' + ctx.passPercent + '%예요.'),
      bestLine(ctx.record),
      historyList(ctx.record),
      g.missed.length === 0
        ? h('p', {}, '모두 맞혔어요!')
        : h('div', { class: 'rc-missed' },
            h('h4', {}, '틀린 문제'),
            h('ol', {}, g.missed.map(function (i) {
              var it = quiz[i];
              return h('li', {},
                h('p', { class: 'rc-q' }, it.q),
                h('p', {}, '내 답: ' + it.choices[state.picks[i]]),
                h('p', {}, '정답: ' + it.choices[it.answer]),
                it.why ? h('p', { class: 'muted' }, it.why) : null);
            }))),
      h('div', { class: 'rc-actions' },
        h('button', { type: 'button', class: 'action', onclick: function () { dispatch({ type: 'restart' }); } }, '다시 풀기'),
        document.getElementById('structure') ? h('a', { class: 'action ghost', href: '#structure' }, '다음: 책의 구조 그리기') : null,
        printButton()));
  }

  function mount(root) {
    var data = document.getElementById('readcheck-data');
    var id = root.getAttribute('data-book-id');
    var passPercent = Number(root.getAttribute('data-pass-percent'));
    var quiz = data ? parseQuiz(data.textContent) : null;
    root.textContent = '';

    if (!quiz || !id || !(passPercent > 0 && passPercent <= 100)) {
      root.append(h('div', { class: 'rc-card' },
        h('p', {}, '퀴즈를 불러오지 못했어요. 어른에게 책 파일의 quiz 부분을 확인해 달라고 해 주세요.')));
      return;
    }

    var stage = h('div');
    var status = h('p', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
    root.append(stage, status);

    var state = INTRO;
    var ctx = { quiz: quiz, passPercent: passPercent, record: readBest(id) };

    function paint(moveFocus) {
      stage.textContent = '';
      stage.append(render(state, ctx, dispatch));
      status.textContent = statusText(state, ctx);
      var target = moveFocus && stage.querySelector('[data-rc-focus]');
      if (target) target.focus();
    }

    function dispatch(action) {
      var next = transition(state, action, quiz.length);
      if (next === state) return;
      if (next.phase === 'result') {
        var g = grade(quiz, next.picks, passPercent);
        var rec = addAttempt(ctx.record, g, new Date().toISOString());
        writeBest(id, rec);
        ctx = { quiz: quiz, passPercent: passPercent, record: rec };
      }
      state = next;
      paint(true);
    }

    paint(false);
  }

  function upgradeChips() {
    var passed = 0;
    var chips = document.querySelectorAll('[data-readcheck-chip]');
    Array.prototype.forEach.call(chips, function (chip) {
      var rec = readBest(chip.getAttribute('data-readcheck-chip'));
      if (rec && rec.passed) {
        chip.textContent = '독서 확인 통과 ✓';
        chip.classList.add('is-passed');
        passed++;
      }
    });
    var line = document.querySelector('[data-readcheck-passed]');
    if (line && passed > 0) {
      line.textContent = '독서 확인 통과 ' + passed + '권';
      line.hidden = false;
    }
  }

  var root = document.getElementById('readcheck');
  if (root) mount(root);
  upgradeChips();
})();
