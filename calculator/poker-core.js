// Poker hand evaluation, equity simulation and outs for the /calculator/ page.
// Cards are integers 0..51: rank = c >> 2 (0 = 2 ... 12 = A), suit = c & 3 (0 ♠, 1 ♥, 2 ♦, 3 ♣).
(function (root) {
  'use strict';

  var RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  var SUITS = ['♠', '♥', '♦', '♣'];

  function straightHigh(mask) {
    var w = (mask << 1) | ((mask >> 12) & 1);
    for (var i = 13; i >= 4; i--) {
      if (((w >> (i - 4)) & 31) === 31) return i - 1;
    }
    return -1;
  }

  function pack(cat, a, b, c, d, e) {
    return cat * 1048576 + (a || 0) * 65536 + (b || 0) * 4096 + (c || 0) * 256 + (d || 0) * 16 + (e || 0);
  }

  // Score of the best 5-card hand among the given cards (any count >= 1). Higher is better.
  function evaluate(cards) {
    var cnt = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    var sm = [0, 0, 0, 0], sc = [0, 0, 0, 0], mask = 0, i, r;
    for (i = 0; i < cards.length; i++) {
      r = cards[i] >> 2; var s = cards[i] & 3;
      cnt[r]++; sm[s] |= 1 << r; sc[s]++; mask |= 1 << r;
    }
    var fs = -1;
    for (i = 0; i < 4; i++) if (sc[i] >= 5) fs = i;
    if (fs >= 0) {
      var sf = straightHigh(sm[fs]);
      if (sf >= 0) return pack(8, sf);
    }
    var quad = -1, trips = [], pairs = [], singles = [];
    for (r = 12; r >= 0; r--) {
      if (cnt[r] === 4) quad = r;
      else if (cnt[r] === 3) trips.push(r);
      else if (cnt[r] === 2) pairs.push(r);
      else if (cnt[r] === 1) singles.push(r);
    }
    if (quad >= 0) {
      var qk = -1;
      for (r = 12; r >= 0; r--) if (r !== quad && cnt[r] > 0) { qk = r; break; }
      return pack(7, quad, qk < 0 ? 0 : qk);
    }
    if (trips.length && (trips.length > 1 || pairs.length)) {
      var second = trips.length > 1 ? trips[1] : -1;
      if (pairs.length && pairs[0] > second) second = pairs[0];
      return pack(6, trips[0], second);
    }
    if (fs >= 0) {
      var f = [];
      for (r = 12; r >= 0 && f.length < 5; r--) if (sm[fs] & (1 << r)) f.push(r);
      return pack(5, f[0], f[1], f[2], f[3], f[4]);
    }
    var st = straightHigh(mask);
    if (st >= 0) return pack(4, st);
    if (trips.length) return pack(3, trips[0], singles[0], singles[1]);
    if (pairs.length >= 2) {
      var k = singles.length ? singles[0] : -1;
      if (pairs.length > 2 && pairs[2] > k) k = pairs[2];
      return pack(2, pairs[0], pairs[1], k < 0 ? 0 : k);
    }
    if (pairs.length === 1) return pack(1, pairs[0], singles[0], singles[1], singles[2]);
    return pack(0, singles[0], singles[1], singles[2], singles[3], singles[4]);
  }

  function category(score) { return Math.floor(score / 1048576); }
  function topRank(score) { return Math.floor(score / 65536) % 16; }
  function secondRank(score) { return Math.floor(score / 4096) % 16; }

  // Indexes (into cards) of the 5 cards that make the best hand. Needs 5+ cards.
  function bestFive(cards) {
    var n = cards.length, best = -1, bestIdx = null;
    for (var a = 0; a < n; a++) for (var b = a + 1; b < n; b++) for (var c = b + 1; c < n; c++)
      for (var d = c + 1; d < n; d++) for (var e = d + 1; e < n; e++) {
        var sc = evaluate([cards[a], cards[b], cards[c], cards[d], cards[e]]);
        if (sc > best) { best = sc; bestIdx = [a, b, c, d, e]; }
      }
    return bestIdx;
  }

  function remainingDeck(known) {
    var used = {}, deck = [];
    known.forEach(function (c) { used[c] = true; });
    for (var c = 0; c < 52; c++) if (!used[c]) deck.push(c);
    return deck;
  }

  // Monte Carlo equity against (players - 1) opponents holding random cards, everyone to showdown.
  // Returns a runner; call runner.step(iterations) repeatedly and read runner.result().
  function equityRunner(hole, board, players) {
    var deck = remainingDeck(hole.concat(board));
    var needBoard = 5 - board.length, opps = players - 1;
    var win = 0, tie = 0, lose = 0, share = 0, n = 0;
    var full = board.slice(), hand = new Array(7), opp = new Array(7);
    function step(iters) {
      for (var it = 0; it < iters; it++) {
        var top = deck.length, need = needBoard + opps * 2;
        for (var j = 0; j < need; j++) {
          var k = j + Math.floor(Math.random() * (top - j));
          var t = deck[j]; deck[j] = deck[k]; deck[k] = t;
        }
        full.length = board.length;
        for (j = 0; j < needBoard; j++) full.push(deck[j]);
        hand.length = 0; hand.push(hole[0], hole[1]); for (j = 0; j < 5; j++) hand.push(full[j]);
        var hero = evaluate(hand), bestOpp = -1, ties = 0;
        for (var o = 0; o < opps; o++) {
          opp.length = 0; opp.push(deck[needBoard + o * 2], deck[needBoard + o * 2 + 1]);
          for (j = 0; j < 5; j++) opp.push(full[j]);
          var v = evaluate(opp);
          if (v > bestOpp) { bestOpp = v; ties = v === hero ? 1 : 0; }
          else if (v === bestOpp && v === hero) ties++;
        }
        if (hero > bestOpp) { win++; share += 1; }
        else if (hero === bestOpp) { tie++; share += 1 / (ties + 1); }
        else lose++;
        n++;
      }
    }
    function result() {
      return { n: n, win: win / n, tie: tie / n, lose: lose / n, equity: share / n };
    }
    return { step: step, result: result };
  }

  // Cards that would move the player up to a better hand category with the next card,
  // excluding improvements that come from the board alone (everyone would share them).
  function outs(hole, board) {
    if (hole.length !== 2 || (board.length !== 3 && board.length !== 4)) return null;
    var known = hole.concat(board), deck = remainingDeck(known);
    var cur = category(evaluate(known)), groups = {}, total = 0;
    deck.forEach(function (u) {
      var cat = category(evaluate(known.concat([u])));
      if (cat <= cur) return;
      var boardCat = category(evaluate(board.concat([u])));
      if (cat <= boardCat) return;
      (groups[cat] = groups[cat] || []).push(u);
      total++;
    });
    var unseen = deck.length;
    var next = total / unseen;
    var byRiver = board.length === 3 ? 1 - ((unseen - total) * (unseen - total - 1)) / (unseen * (unseen - 1)) : next;
    return { current: cur, groups: groups, total: total, unseen: unseen, next: next, byRiver: byRiver, cardsToCome: 5 - board.length };
  }


  // Final hand category with royal flush split out: 0 high card ... 8 straight flush, 9 royal flush.
  function category10(score) { var c = category(score); return c === 8 && topRank(score) === 12 ? 9 : c; }

  // Exact counts of the final (river) hand category over every way the rest of the board can come.
  // hole must have 2 cards; board 1..5 cards. Returns { counts: [10], total }.
  function finalCounts(hole, board) {
    var known = hole.concat(board), deck = remainingDeck(known), need = 5 - board.length;
    var counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], total = 0, cur = known.slice(), n = deck.length;
    function rec(start, left) {
      if (left === 0) { counts[category10(evaluate(cur))]++; total++; return; }
      for (var i = start; i <= n - left; i++) { cur.push(deck[i]); rec(i + 1, left - 1); cur.pop(); }
    }
    rec(0, need);
    return { counts: counts, total: total };
  }

  // Key into the precomputed starting-hand table, e.g. "AKs", "A10o", "77".
  function startingKey(hole) {
    var a = hole[0] >> 2, b = hole[1] >> 2, hi = Math.max(a, b), lo = Math.min(a, b);
    if (a === b) return RANKS[a] + RANKS[a];
    return RANKS[hi] + RANKS[lo] + ((hole[0] & 3) === (hole[1] & 3) ? 's' : 'o');
  }

  // Exact 7-card odds before any card is seen (counts out of C(52,7) = 133784560).
  var BASE_COUNTS = [23294460, 58627800, 31433400, 6461620, 6180020, 4047644, 3473184, 224848, 37260, 4324];

  var api = {
    RANKS: RANKS, SUITS: SUITS, evaluate: evaluate, category: category, topRank: topRank,
    secondRank: secondRank, bestFive: bestFive, category10: category10, finalCounts: finalCounts,
    startingKey: startingKey, BASE_COUNTS: BASE_COUNTS, BASE_TOTAL: 133784560, equityRunner: equityRunner, outs: outs, straightHigh: straightHigh
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PokerCore = api;
})(this);
