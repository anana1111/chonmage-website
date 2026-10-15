// Calculator page behaviour, shared by /calculator/ (ja), /en/calculator/ and /zh/calculator/.
// The page language (<html lang>) picks the strings; markup ids are the same on every page.
(function () {
  'use strict';
  var P = window.PokerCore;
  var RANKS = P.RANKS, SUITS = P.SUITS;

  var EN_PL = { A: 'Aces', K: 'Kings', Q: 'Queens', J: 'Jacks', '10': 'Tens', '9': 'Nines', '8': 'Eights', '7': 'Sevens', '6': 'Sixes', '5': 'Fives', '4': 'Fours', '3': 'Threes', '2': 'Twos' };
  function pl(t) { return EN_PL[t]; }
  var I18N = {
    ja: {
      cat: ['ハイカード', 'ワンペア', 'ツーペア', 'スリーカード', 'ストレート', 'フラッシュ', 'フルハウス', 'フォーカード', 'ストレートフラッシュ', 'ロイヤルフラッシュ'],
      players: function (n) { return n + '人'; },
      hole: function (i) { return '手札' + i; }, board: function (i) { return '場のカード' + i; },
      empty: '空き', selected: '選択中', back: '1枚消す', clear: 'すべて消す',
      handLabel: 'いまの役', handLabelEx: '例：いまの役',
      pair: function (t) { return t + 'のワンペア'; }, twoPair: function (t, s) { return t + 'と' + s + 'のツーペア'; },
      trips: function (t) { return t + 'のスリーカード'; }, quads: function (t) { return t + 'のフォーカード'; },
      full: function (t, s) { return t + 'と' + s + 'のフルハウス'; }, straight: function (t, c) { return t + 'までの' + c; },
      flush: function (t) { return t + 'ハイのフラッシュ'; }, high: function (t) { return 'ハイカード（' + t + '）'; },
      pocket: function (t) { return t + 'のポケットペア'; }, suited: ' スーテッド', offsuit: ' オフスート',
      need2: '手札を2枚選んでください。', need1: 'もう1枚、手札を選んでください。',
      riverDone: '役が確定しました。', noOuts: '次のカードで役が良くなるカードはありません。', addBoard: '場のカードを入れると、役とアウツがわかります。',
      outsSentence: function (c, n, next, river) { return c + 'のアウツは' + n + '枚で、次の1枚で' + next + (river ? '、リバーまでに' + river : '') + 'です。'; },
      vsTitle: function (n) { return n + '人で勝負したら、あなたが勝つ確率'; },
      vsCap: function (o) { return '相手' + o + '人と最後まで勝負した場合（引き分けの取り分を含む）'; },
      wtlTitle: function (o) { return '相手' + o + '人と100回勝負したら？'; },
      times: function (n) { return n + '回'; }, underOne: '1回未満',
      outsIdle: '場のカードが3枚か4枚のときに、次のカードで役が良くなるカード（アウツ）を表示します。',
      outsRiver: '場のカードがすべて開いたので、もうアウツはありません。',
      outsNone: '次のカードで、あなたの役が良くなるカードはありません。',
      left: function (n) { return '残り' + n + '枚中'; }, becomes: function (c) { return c + 'になる'; },
      count: function (n) { return n + '<small>枚</small>'; },
      nextCard: '次の1枚で', byRiver: 'リバーまでに',
      rule4: function (p) { return '（4のルール：約' + p + '%）'; }, rule2: function (p) { return '（2のルール：約' + p + '%）'; },
      oddsHand: '役', cols: ['配る前', '手札', 'フロップ', 'ターン', 'リバー'], now: '（いま）', up: '上がった', down: '下がった',
      oddsNoHand: 'ランダムな7枚から役ができる確率（相手は関係なし）', oddsOwn: 'あなたの役だけの確率（相手は関係なし）', oddsDone: '役が確定しました'
    },
    en: {
      cat: ['High card', 'One pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush', 'Royal flush'],
      players: function (n) { return String(n); },
      hole: function (i) { return 'Hole card ' + i; }, board: function (i) { return 'Board card ' + i; },
      empty: 'empty', selected: 'Selected', back: 'Remove last card', clear: 'Clear all',
      handLabel: 'Your hand now', handLabelEx: 'Example: your hand now',
      pair: function (t) { return 'Pair of ' + pl(t); }, twoPair: function (t, s) { return 'Two pair, ' + pl(t) + ' and ' + pl(s); },
      trips: function (t) { return 'Three ' + pl(t); }, quads: function (t) { return 'Four ' + pl(t); },
      full: function (t, s) { return pl(t) + ' full of ' + pl(s); }, straight: function (t, c) { return c + ', ' + t + '-high'; },
      flush: function (t) { return 'Flush, ' + t + '-high'; }, high: function (t) { return 'High card, ' + t; },
      pocket: function (t) { return 'Pocket ' + pl(t); }, suited: ' suited', offsuit: ' offsuit',
      need2: 'Choose your two hole cards.', need1: 'Choose one more hole card.',
      riverDone: 'Your hand is final.', noOuts: 'No card on the next street improves your hand.', addBoard: 'Add board cards to see your hand and your outs.',
      outsSentence: function (c, n, next, river) { return 'You have ' + n + ' outs to a ' + c.toLowerCase() + ': ' + next + ' on the next card' + (river ? ', ' + river + ' by the river' : '') + '.'; },
      vsTitle: function (n) { return 'Your chance to win with ' + n + ' players'; },
      vsCap: function (o) { return 'Against ' + o + (o === 1 ? ' opponent' : ' opponents') + ' to showdown (includes your share of split pots)'; },
      wtlTitle: function (o) { return 'Play 100 times against ' + o + (o === 1 ? ' opponent' : ' opponents'); },
      times: function (n) { return n + (n === 1 ? ' time' : ' times'); }, underOne: 'under 1',
      outsIdle: 'With 3 or 4 board cards, this shows the cards that would improve your hand (your outs).',
      outsRiver: 'All five board cards are out, so there are no outs left.',
      outsNone: 'No card on the next street improves your hand.',
      left: function (n) { return n + ' cards unseen'; }, becomes: function (c) { return 'Makes a ' + c.toLowerCase(); },
      count: function (n) { return n + '<small> outs</small>'; },
      nextCard: 'Next card', byRiver: 'By the river',
      rule4: function (p) { return '(rule of 4: about ' + p + '%)'; }, rule2: function (p) { return '(rule of 2: about ' + p + '%)'; },
      oddsHand: 'Hand', cols: ['Before deal', 'Hole cards', 'Flop', 'Turn', 'River'], now: '(now)', up: 'up', down: 'down',
      oddsNoHand: 'Chance of each hand from 7 random cards (opponents not counted)', oddsOwn: 'Odds for your own hand only (opponents not counted)', oddsDone: 'Your hand is final'
    },
    zh: {
      cat: ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺', '皇家同花顺'],
      players: function (n) { return n + '人'; },
      hole: function (i) { return '手牌' + i; }, board: function (i) { return '公共牌' + i; },
      empty: '空', selected: '选择中', back: '删除一张', clear: '全部清除',
      handLabel: '现在的牌型', handLabelEx: '示例：现在的牌型',
      pair: function (t) { return '一对' + t; }, twoPair: function (t, s) { return '两对（' + t + '和' + s + '）'; },
      trips: function (t) { return '三条' + t; }, quads: function (t) { return '四条' + t; },
      full: function (t, s) { return '葫芦（三条' + t + '带一对' + s + '）'; }, straight: function (t, c) { return c + '（到' + t + '）'; },
      flush: function (t) { return '同花（' + t + '高）'; }, high: function (t) { return '高牌（' + t + '）'; },
      pocket: function (t) { return '口袋对' + t; }, suited: ' 同花色', offsuit: ' 不同花色',
      need2: '请选择两张手牌。', need1: '请再选择一张手牌。',
      riverDone: '牌型已经确定。', noOuts: '下一张牌没有能让你变强的牌。', addBoard: '输入公共牌后，就能看到牌型和 outs。',
      outsSentence: function (c, n, next, river) { return '成' + c + '的 outs 有' + n + '张，下一张来的概率是' + next + (river ? '，到河牌为止是' + river : '') + '。'; },
      vsTitle: function (n) { return n + '人对局时，你赢的概率'; },
      vsCap: function (o) { return '和' + o + '位对手打到最后的情况（包含平分底池的部分）'; },
      wtlTitle: function (o) { return '和' + o + '位对手打100局的话？'; },
      times: function (n) { return n + '局'; }, underOne: '不到1局',
      outsIdle: '公共牌有3张或4张时，这里会显示能让你变强的牌（outs）。',
      outsRiver: '公共牌已经全部翻开，没有 outs 了。',
      outsNone: '下一张牌没有能让你变强的牌。',
      left: function (n) { return '剩余' + n + '张'; }, becomes: function (c) { return '成' + c; },
      count: function (n) { return n + '<small>张</small>'; },
      nextCard: '下一张', byRiver: '到河牌为止',
      rule4: function (p) { return '（4法则：约' + p + '%）'; }, rule2: function (p) { return '（2法则：约' + p + '%）'; },
      oddsHand: '牌型', cols: ['发牌前', '手牌', '翻牌', '转牌', '河牌'], now: '（现在）', up: '上升', down: '下降',
      oddsNoHand: '随机7张牌凑成各牌型的概率（与对手无关）', oddsOwn: '只算你自己的牌型（与对手无关）', oddsDone: '牌型已经确定'
    }
  };
  var lang = (document.documentElement.lang || 'ja').slice(0, 2);
  var L = I18N[lang] || I18N.ja;
  var CAT = L.cat;

  var state = { players: 6, suit: 1, cards: [null, null, null, null, null, null, null], active: 0 };
  var holeEl = document.getElementById('hole-slots'), boardEl = document.getElementById('board-slots'), keysEl = document.getElementById('keys');
  function card(rank, suit) { return rank * 4 + suit; }
  function isRed(c) { return (c & 3) === 1 || (c & 3) === 2; }

  // example hand on first load: A♥ K♥ / Q♥ 7♥ 2♣
  state.cards = [card(12, 1), card(11, 1), card(10, 1), card(5, 1), card(0, 3), null, null];
  state.active = 5;
  var isExample = true;

  var slotBtns = [], slotTags = [];
  for (var i = 0; i < 7; i++) {
    var w = document.createElement('div'); w.className = 'slot-wrap';
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'slot'; b.id = 'slot-' + i; b.dataset.i = i;
    b.addEventListener('click', onSlot);
    var t = document.createElement('span'); t.className = 'slot-tag';
    w.appendChild(b); w.appendChild(t);
    (i < 2 ? holeEl : boardEl).appendChild(w);
    slotBtns.push(b); slotTags.push(t);
  }
  var rankBtns = {};
  [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].forEach(function (r) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'k'; b.id = 'rank-' + RANKS[r]; b.textContent = RANKS[r];
    b.addEventListener('click', function () { addCard(r); });
    keysEl.appendChild(b); rankBtns[r] = b;
  });
  var back = document.createElement('button'); back.type = 'button'; back.className = 'k back'; back.id = 'key-back'; back.textContent = '⌫'; back.setAttribute('aria-label', L.back);
  back.addEventListener('click', removeLast); keysEl.appendChild(back);
  var ac = document.createElement('button'); ac.type = 'button'; ac.className = 'k ac'; ac.id = 'key-ac'; ac.textContent = 'AC'; ac.setAttribute('aria-label', L.clear);
  ac.addEventListener('click', clearAll); keysEl.appendChild(ac);

  document.querySelectorAll('.suit').forEach(function (b) {
    b.addEventListener('click', function () { state.suit = +b.dataset.suit; render(); });
  });
  document.getElementById('players-minus').addEventListener('click', function () { setPlayers(state.players - 1); });
  document.getElementById('players-plus').addEventListener('click', function () { setPlayers(state.players + 1); });

  function setPlayers(n) { state.players = Math.max(2, Math.min(9, n)); render(); compute(); }
  function used(c) { return state.cards.indexOf(c) >= 0; }
  function firstEmpty() { for (var i = 0; i < 7; i++) if (state.cards[i] === null) return i; return -1; }
  function onSlot(e) {
    var i = +e.currentTarget.dataset.i, fe = firstEmpty();
    if (state.cards[i] === null && fe !== -1 && i > fe) i = fe;
    state.active = i; render();
  }
  function addCard(r) {
    var c = card(r, state.suit);
    if (used(c) || state.active < 0) return;
    isExample = false;
    state.cards[state.active] = c;
    state.active = firstEmpty();
    render(); compute();
  }
  function removeLast() {
    isExample = false;
    for (var i = 6; i >= 0; i--) if (state.cards[i] !== null) { state.cards[i] = null; break; }
    state.active = firstEmpty(); render(); compute();
  }
  function clearAll() {
    isExample = false;
    state.cards = [null, null, null, null, null, null, null]; state.active = 0; render(); compute();
  }
  function hole() { return state.cards.slice(0, 2).filter(function (c) { return c !== null; }); }
  function board() {
    var b = [];
    for (var i = 2; i < 7; i++) { if (state.cards[i] === null) break; b.push(state.cards[i]); }
    return b;
  }

  var highlight = null;
  function render() {
    document.getElementById('players-out').textContent = L.players(state.players);
    document.getElementById('players-minus').disabled = state.players <= 2;
    document.getElementById('players-plus').disabled = state.players >= 9;
    slotBtns.forEach(function (b, i) {
      var c = state.cards[i];
      b.className = 'slot' + (c !== null ? ' filled' : '') + (c !== null && isRed(c) ? ' red' : '') + (i === state.active ? ' active' : '');
      if (highlight && c !== null && highlight.indexOf(i) < 0) b.className += ' unused';
      b.innerHTML = c !== null ? '<b>' + RANKS[c >> 2] + '</b><i>' + SUITS[c & 3] + '</i>' : '';
      b.setAttribute('aria-label', (i < 2 ? L.hole(i + 1) : L.board(i - 1)) + ': ' + (c !== null ? SUITS[c & 3] + RANKS[c >> 2] : L.empty) + (i === state.active ? ' (' + L.selected + ')' : ''));
      slotTags[i].textContent = i === state.active ? L.selected : '';
    });
    document.querySelectorAll('.suit').forEach(function (b) { b.setAttribute('aria-pressed', +b.dataset.suit === state.suit ? 'true' : 'false'); });
    Object.keys(rankBtns).forEach(function (r) { rankBtns[r].disabled = state.active < 0 || used(card(+r, state.suit)); });
    document.getElementById('example-badge').hidden = !isExample;
    document.getElementById('eq-badge').hidden = !isExample;
  }

  function handName(score) {
    var cat = P.category(score), t = RANKS[P.topRank(score)], s = RANKS[P.secondRank(score)];
    if (cat === 8 && P.topRank(score) === 12) return CAT[9];
    if (cat === 1) return L.pair(t);
    if (cat === 2) return L.twoPair(t, s);
    if (cat === 3) return L.trips(t);
    if (cat === 7) return L.quads(t);
    if (cat === 6) return L.full(t, s);
    if (cat === 4 || cat === 8) return L.straight(t, CAT[cat]);
    if (cat === 5) return L.flush(t);
    return L.high(t);
  }
  function preflopName(h) {
    var r1 = h[0] >> 2, r2 = h[1] >> 2, suited = (h[0] & 3) === (h[1] & 3);
    if (r1 === r2) return L.pocket(RANKS[r1]);
    return RANKS[Math.max(r1, r2)] + RANKS[Math.min(r1, r2)] + (suited ? L.suited : L.offsuit);
  }
  function pct(x) { return (x * 100).toFixed(1) + '%'; }
  function riverProb(n, unseen) { return 1 - ((unseen - n) * (unseen - n - 1)) / (unseen * (unseen - 1)); }
  function mini(c) { return '<span class="mini' + (isRed(c) ? ' red' : '') + '"><span>' + RANKS[c >> 2] + '</span><span>' + SUITS[c & 3] + '</span></span>'; }

  var job = 0, outsSentence = '';
  function compute() {
    var my = ++job, h = hole(), bd = board();
    highlight = null;
    var nameEl = document.getElementById('hand-name'), sumEl = document.getElementById('summary'), eqEl = document.getElementById('eq-num');
    document.getElementById('hand-label').textContent = isExample ? L.handLabelEx : L.handLabel;
    var opp = state.players - 1;
    document.getElementById('vs-title').textContent = L.vsTitle(state.players);
    document.getElementById('vs-cap').textContent = L.vsCap(opp);
    document.getElementById('wtl-title').textContent = L.wtlTitle(opp);
    renderOdds(h, bd);
    if (h.length < 2) {
      nameEl.textContent = '―'; eqEl.textContent = '―';
      sumEl.textContent = h.length === 0 ? L.need2 : L.need1;
      setBars(null); renderOuts(h, bd); render(); return;
    }
    var known = h.concat(bd);
    if (known.length >= 5) {
      nameEl.textContent = handName(P.evaluate(known));
      highlight = known.length > 5 ? P.bestFive(known) : null;
    } else {
      nameEl.textContent = preflopName(h);
    }
    render();
    renderOuts(h, bd);
    sumEl.textContent = outsSentence || (bd.length === 5 ? L.riverDone : bd.length >= 3 ? L.noOuts : L.addBoard);

    var runner = P.equityRunner(h, bd, state.players);
    var target = Math.round(Math.min(60000, 120000 / state.players));
    var done = 0, chunk = Math.max(800, Math.round(target / 12));
    eqEl.textContent = '…';
    (function loop() {
      if (my !== job) return;
      runner.step(chunk); done += chunk;
      var r = runner.result();
      eqEl.innerHTML = Math.round(r.equity * 100) + '<span>%</span>';
      setBars(r);
      if (done < target) setTimeout(loop, 0);
    })();
  }

  function renderOuts(h, bd) {
    var body = document.getElementById('outs-body'), note = document.getElementById('outs-note');
    outsSentence = '';
    var o = h.length === 2 ? P.outs(h, bd) : null;
    if (!o) {
      note.textContent = '';
      body.innerHTML = '<p class="muted">' + (bd.length === 5 ? L.outsRiver : L.outsIdle) + '</p>';
      return;
    }
    note.textContent = L.left(o.unseen);
    var cats = Object.keys(o.groups).map(Number).sort(function (a, b) { return b - a; });
    if (!cats.length) { body.innerHTML = '<p class="muted">' + L.outsNone + '</p>'; return; }
    var html = '';
    cats.forEach(function (cat) {
      var list = o.groups[cat], n = list.length, next = n / o.unseen, rule;
      var line = '<span>' + L.nextCard + '<b>' + pct(next) + '</b></span>';
      if (o.cardsToCome === 2) {
        line += '<span>' + L.byRiver + '<b>' + pct(riverProb(n, o.unseen)) + '</b></span>';
        rule = L.rule4(Math.min(100, n * 4));
      } else {
        rule = L.rule2(n * 2);
      }
      html += '<div class="outs-group"><div class="outs-title"><strong>' + L.becomes(CAT[cat]) + '</strong><span class="pill">' + L.count(n) + '</span></div>' +
        '<div class="outs-prob"><div class="line">' + line + '</div><small>' + rule + '</small></div>' +
        '<div class="outs-cards">' + list.slice().sort(function (a, b) { return b - a; }).map(mini).join('') + '</div></div>';
    });
    body.innerHTML = html;
    var best = cats.slice().sort(function (a, b) { return o.groups[b].length - o.groups[a].length || b - a; })[0], bn = o.groups[best].length;
    outsSentence = L.outsSentence(CAT[best], bn, pct(bn / o.unseen), o.cardsToCome === 2 ? pct(riverProb(bn, o.unseen)) : '');
  }

  function fmtP(x) {
    if (x === 0) return '0%';
    if (x === 1) return '100%';
    var v = x * 100;
    if (v >= 10) return v.toFixed(1) + '%';
    if (v >= 1) return v.toFixed(2) + '%';
    return v.toPrecision(2).replace(/0+$/, '').replace(/\.$/, '') + '%';
  }
  function renderOdds(h, bd) {
    var cols = [{ label: L.cols[0], p: P.BASE_COUNTS.map(function (c) { return c / P.BASE_TOTAL; }) }];
    if (h.length === 2) {
      var pre = window.PREFLOP_ODDS && window.PREFLOP_ODDS.hands[P.startingKey(h)];
      if (pre) cols.push({ label: L.cols[1], p: pre.map(function (c) { return c / window.PREFLOP_ODDS.total; }) });
      [[3, 2], [4, 3], [5, 4]].forEach(function (st) {
        if (bd.length >= st[0]) {
          var f = P.finalCounts(h, bd.slice(0, st[0]));
          cols.push({ label: L.cols[st[1]], p: f.counts.map(function (c) { return c / f.total; }) });
        }
      });
    }
    var n = cols.length, last = cols[n - 1].p;
    function cls(i) { return (i === 0 && n > 1 ? 'base' : '') + (i === n - 1 ? ' now' : ''); }
    var html = '<thead><tr><th scope="col">' + L.oddsHand + '</th>';
    cols.forEach(function (c, i) { html += '<th scope="col" class="' + cls(i) + '">' + c.label + (i === n - 1 && n > 1 ? '<br>' + L.now : '') + '</th>'; });
    html += '</tr></thead><tbody>';
    for (var cat = 9; cat >= 0; cat--) {
      if (last[cat] === 0) continue;
      html += '<tr' + (last[cat] === 1 ? ' class="made"' : '') + '><th scope="row">' + CAT[cat] + '</th>';
      cols.forEach(function (c, i) {
        var v = c.p[cat], mark = '';
        if (i > 0) { var prev = cols[i - 1].p[cat]; if (v > prev * 1.0001) mark = '<span class="up" aria-label="' + L.up + '">▲</span>'; else if (v < prev * 0.9999) mark = '<span class="down" aria-label="' + L.down + '">▼</span>'; }
        html += '<td class="' + cls(i) + '">' + fmtP(v) + mark + '</td>';
      });
      html += '</tr>';
    }
    document.getElementById('odds-table').innerHTML = html + '</tbody>';
    document.getElementById('odds-note').textContent = h.length < 2 ? L.oddsNoHand : (bd.length === 5 ? L.oddsDone : L.oddsOwn);
    var wrap = document.getElementById('odds-wrap'); wrap.scrollLeft = wrap.scrollWidth;
  }

  // win / tie / lose as counts out of 100 (largest remainder so they add up to 100)
  function per100(r) {
    var raw = [r.win * 100, r.tie * 100, r.lose * 100], fl = raw.map(Math.floor), left = 100 - fl[0] - fl[1] - fl[2];
    raw.map(function (v, i) { return [v - fl[i], i]; }).sort(function (a, b) { return b[0] - a[0]; }).slice(0, left).forEach(function (x) { fl[x[1]]++; });
    return fl;
  }
  function setBars(r) {
    var n = r ? per100(r) : null;
    [['bar-w', 'pct-w', 'win'], ['bar-t', 'pct-t', 'tie'], ['bar-l', 'pct-l', 'lose']].forEach(function (x, i) {
      document.getElementById(x[0]).style.width = r ? (r[x[2]] * 100) + '%' : '0';
      document.getElementById(x[1]).textContent = !r ? '―' : (n[i] === 0 && r[x[2]] > 0 ? L.underOne : L.times(n[i]));
    });
  }

  render(); compute();
})();
