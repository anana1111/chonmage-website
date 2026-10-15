// Builds the starting hand odds pages from the precomputed data:
//   calculator/starting-hands/index.html (ja), en/calculator/starting-hands/index.html, zh/calculator/starting-hands/index.html
// Data: calculator/preflop-equity.js (scripts/build-preflop-equity.mjs) and calculator/preflop-odds.js (scripts/build-preflop-odds.mjs).
// Run: node scripts/build-starting-hands.mjs   (then node scripts/ensure-ga4.mjs)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const P = require(path.join(ROOT, 'calculator/poker-core.js'));
function loadWindow(file) { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx); return ctx.window; }
const EQ = loadWindow('calculator/preflop-equity.js').PREFLOP_EQUITY.hands;
const ODDS = loadWindow('calculator/preflop-odds.js').PREFLOP_ODDS;
const R = P.RANKS;
const SITE = 'https://chonmagepoker.com/';
const VER = '20261015sh';
// The site's GA4 tag, copied from the calculator page so generated pages ship with it (see AGENTS.md).
const GA = (() => { const h = fs.readFileSync(path.join(ROOT, 'calculator/index.html'), 'utf8'); const a = h.indexOf('  <!-- Google tag'); return h.slice(a, h.indexOf('  <meta charset', a)); })();

// ---------- data ----------
const KEYS = Object.keys(EQ);
function kind(k) { return k.endsWith('s') ? 's' : k.endsWith('o') ? 'o' : 'p'; }
function ranksOf(k) { const m = k.match(/^(10|[2-9AKQJ])(10|[2-9AKQJ])/); return [R.indexOf(m[1]), R.indexOf(m[2])]; }
function combos(k) { return { p: 6, s: 4, o: 12 }[kind(k)]; }
function madeP(k) { return ODDS.hands[k].map((c) => c / ODDS.total); }
const rank1 = KEYS.slice().sort((a, b) => EQ[b][0] - EQ[a][0]);
const RANK = {}; rank1.forEach((k, i) => { RANK[k] = i + 1; });
function pct(x, d = 1) { return (x * 100).toFixed(d) + '%'; }
function pctSmall(x) { const v = x * 100; return v >= 10 ? v.toFixed(1) + '%' : v >= 1 ? v.toFixed(2) + '%' : v.toPrecision(2).replace(/0+$/, '').replace(/\.$/, '') + '%'; }
function flushP(k) { const m = madeP(k); return m[5] + m[8] + m[9]; }
function straightP(k) { return madeP(k)[4]; }
const suitedPairs = KEYS.filter((k) => kind(k) === 's');
function avg(a) { return a.reduce((x, y) => x + y, 0) / a.length; }
const suitedBonus1 = avg(suitedPairs.map((k) => EQ[k][0] - EQ[k.replace(/s$/, 'o')][0]));
const suitedBonus5 = avg(suitedPairs.map((k) => EQ[k][4] - EQ[k.replace(/s$/, 'o')][4]));
const avgSuitedFlush = avg(suitedPairs.map(flushP));
const avgOffFlush = avg(KEYS.filter((k) => kind(k) === 'o').map(flushP));
const SET_FLOP = 1 - (48 * 47 * 46) / (50 * 49 * 48);           // a third card of your pair on a 3-card flop
const SET_RIVER = 1 - (1712304 / 2118760);                      // C(48,5)/C(50,5)
const worst = rank1[rank1.length - 1];
// QQ vs AKo head to head (exact enumeration over all boards)
function headsUp(a, b) {
  const used = new Set([...a, ...b]); const deck = []; for (let c = 0; c < 52; c++) if (!used.has(c)) deck.push(c);
  let w = 0, t = 0, n = 0; const bd = [0, 0, 0, 0, 0];
  for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) for (let k2 = j + 1; k2 < deck.length; k2++)
    for (let l = k2 + 1; l < deck.length; l++) for (let m = l + 1; m < deck.length; m++) {
      bd[0] = deck[i]; bd[1] = deck[j]; bd[2] = deck[k2]; bd[3] = deck[l]; bd[4] = deck[m];
      const x = P.evaluate(a.concat(bd)), y = P.evaluate(b.concat(bd));
      if (x > y) w++; else if (x === y) t++; n++;
    }
  return (w + t / 2) / n;
}
const QQ_AK = headsUp([10 * 4, 10 * 4 + 1], [12 * 4 + 2, 11 * 4 + 3]);
const TIERS = [[1, 10], [11, 30], [31, 70], [71, 169]];

// ---------- strings ----------
const T = {
  ja: {
    lang: 'ja', dir: 'calculator/starting-hands/', locale: 'ja_JP', home: '../../', calc: '../', root: '../../',
    title: 'スターティングハンド勝率表｜ポーカー全169種の確率一覧｜ちょんまげ',
    desc: `テキサスホールデムのスターティングハンド（手札2枚）全169種の勝率・確率表。AAは1人相手に${pct(EQ.AA[0])}。相手の人数ごとの勝率、リバーまでに各役ができる確率、ハンドの強さの目安を解説付きでまとめました。`,
    ogTitle: 'スターティングハンド勝率表｜全169種の確率一覧', ogDesc: 'ポーカーの手札2枚、全169種の勝率と役の確率を、人数別・解説付きで。',
    name: 'スターティングハンド勝率表（全169種）', crumb: ['ホーム', 'ポーカー確率計算ツール', 'スターティングハンド勝率表'],
    skip: '本文へ', homeBtn: 'HOMEへ戻る', homeAria: 'ちょんまげ ホーム', langAria: '言語 / Language',
    kicker: 'STARTING HAND ODDS', h1: ['スターティングハンド', '勝率・確率表'],
    lead: `ポーカー（テキサスホールデム）で最初に配られる2枚の手札は、全部で169種類。どの手札がどれくらい強いのかを、正確な確率と解説でまとめました。`,
    oppLabel: '相手の人数', oppUnit: (n) => n + '人',
    legend: ['右上：同じマーク（s）', '左下：違うマーク（o）', '斜めの列：ペア', 'T＝10'], scaleLow: '弱い', scaleHigh: '強い',
    tapHint: 'マスを押すと、そのハンドの詳しい確率と解説が出ます。',
    rankOf: (r) => `1人相手の勝率 169種中 ${r}位`, combosOf: (n) => `組み合わせ ${n}通り`,
    eqHead: '相手の人数ごとの勝率', vsN: (n) => `相手${n}人`,
    madeHead: 'リバーまでにできる役（自分の7枚）', calcBtn: 'このハンドで計算する',
    cat: ['ハイカード', 'ワンペア', 'ツーペア', 'スリーカード', 'ストレート', 'フラッシュ', 'フルハウス', 'フォーカード', 'ストレートフラッシュ', 'ロイヤルフラッシュ'],
    kindName: { p: 'ポケットペア', s: 'スーテッド（同じマーク）', o: 'オフスート（違うマーク）' },
    comment(k, d) {
      const [a, b] = ranksOf(k), K = kind(k), out = [];
      if (K === 'p') {
        out.push(`${R[a]}のポケットペア。フロップでセット（スリーカード）になる確率は${pct(SET_FLOP)}、リバーまでなら${pct(SET_RIVER)}です。`);
        out.push(a >= 8 ? `1人相手なら${pct(d.eq[0], 0)}勝てる強いハンドですが、相手が5人になると${pct(d.eq[4], 0)}まで下がります。ペアのまま勝てるとは限りません。` : `1人相手なら${pct(d.eq[0], 0)}とほぼ五分以上ですが、相手が5人だと${pct(d.eq[4], 0)}。人数が多いときは、セットになって勝つことが多いハンドです。`);
      } else if (K === 's') {
        const o = k.replace(/s$/, 'o');
        out.push(`同じマークの${R[a]}と${R[b]}。リバーまでにフラッシュになる確率は${pct(flushP(k))}で、違うマークの${o}（${pct(flushP(o))}）より高く、勝率も1人相手で${((d.eq[0] - EQ[o][0]) * 100).toFixed(1)}ポイント上です。`);
        if (a - b <= 2 && a < 12) out.push(`数字が近いので、ストレートになる確率も${pct(straightP(k))}あります。人数が多いテーブルで、大きな役を狙えるハンドです。`);
        else if (b >= 8) out.push('高いカード2枚なので、ペアができたときも強い役になりやすいハンドです。');
      } else {
        const s = k.replace(/o$/, 's');
        out.push(`違うマークの${R[a]}と${R[b]}。同じマークの${s}より、1人相手の勝率が${((EQ[s][0] - d.eq[0]) * 100).toFixed(1)}ポイント低くなります。`);
        if (b >= 8) out.push(`高いカード2枚なので、ペアができたときに強い役になりやすく、1人相手の勝率は${pct(d.eq[0], 0)}です。`);
        else if (d.rank > 120) out.push(`1人相手でも勝率は${pct(d.eq[0], 0)}、相手が5人だと${pct(d.eq[4], 0)}です。人数が多いときは、勝てる場面がかなり限られます。`);
      }
      return out.join('');
    },
    gridH: 'スターティングハンド表',
    howH: 'この表の見方',
    how: [
      '表の縦と横は、手札2枚の数字です。斜めの列はペア（AA、KKなど）、その右上は2枚が同じマークのハンド（s＝スーテッド）、左下は違うマークのハンド（o＝オフスート）です。',
      'マスの色が濃いほど勝率が高いハンドです。上の「相手の人数」を変えると、色と数字が人数に合わせて変わります。勝率は、相手の手札をランダムに配り、全員が最後まで降りなかった場合に勝つ割合（引き分けは分け合った分）です。',
      '「リバーまでにできる役」は、自分の7枚（手札2枚＋場の5枚）で最後に何の役になるかの確率で、残りのカードの出方をすべて数えた正確な値です。'],
    tierH: 'ハンドの強さの目安',
    tierIntro: '1人相手の勝率の順位で、169種のハンドを4つに分けました。ただし相手が増えると、ペアや高いカードより、同じマークで数字が続くハンドの価値が上がります。',
    tiers: [['トップクラス', '1〜10位', 'どの人数でも勝率が高いハンドです。高いペアと、AKのような高いカード2枚が並びます。'],
            ['強いハンド', '11〜30位', '多くの場面で参加しやすいハンドです。中くらいのペアや、Aと高いカードの組み合わせが中心です。'],
            ['状況しだい', '31〜70位', '人数や場の状況で、強さが大きく変わるハンドです。同じマークで数字が続くハンドは、人数が多いほど価値が上がります。'],
            ['弱いハンド', '71〜169位', '勝てる場面が限られるハンドです。数字が離れていて、マークも違うハンドが多く含まれます。']],
    factsH: '数字で見るスターティングハンド',
    facts: [[pct(EQ.AA[0]), 'AAの勝率（1人相手）'], [pct(EQ.AA[4]), 'AAの勝率（相手5人）'], [pct(SET_FLOP), 'ペアがフロップでセットになる'], [pct(avgSuitedFlush), '同じマーク2枚がリバーまでにフラッシュになる'], ['+' + (suitedBonus1 * 100).toFixed(1) + 'pt', '同じマークだと上がる勝率（平均・1人相手）'], [pct(EQ[worst][0]), `いちばん弱い${worst}の勝率（1人相手）`]],
    faqH: 'よくある質問',
    faq: [
      ['いちばん強いスターティングハンドは？', `AA（エースのペア）です。1人相手の勝率は${pct(EQ.AA[0])}、相手が5人でも${pct(EQ.AA[4])}と、どのハンドより高い勝率です。2番目はKK（${pct(EQ.KK[0])}）、3番目はQQ（${pct(EQ.QQ[0])}）です。`],
      ['いちばん弱いハンドは？', `1人相手の勝率でいちばん低いのは${worst}で、${pct(EQ[worst][0])}です。数字が離れていてストレートになりにくく、マークも違うのでフラッシュにもなりにくいためです。`],
      ['AKとQQはどっちが強い？', `ランダムな相手に対する勝率では、QQ（${pct(EQ.QQ[0])}）がAKo（${pct(EQ.AKo[0])}）やAKs（${pct(EQ.AKs[0])}）より上です。直接ぶつかった場合も、QQがAKo（違うマーク）に${pct(QQ_AK)}で勝ちます。`],
      ['同じマーク（スーテッド）はどれくらい有利？', `同じ数字の組み合わせで比べると、同じマークのほうが1人相手で平均${(suitedBonus1 * 100).toFixed(1)}ポイント、相手5人なら平均${(suitedBonus5 * 100).toFixed(1)}ポイント勝率が高くなります。リバーまでにフラッシュになる確率は、同じマークで平均${pct(avgSuitedFlush)}、違うマークでは${pct(avgOffFlush)}です。`],
      ['ペアがセット（スリーカード）になる確率は？', `手札がペアのとき、フロップ（場の3枚）で同じ数字が来てセットになる確率は${pct(SET_FLOP)}、リバーまでなら${pct(SET_RIVER)}です。だいたい8回に1回、フロップでセットになります。`],
      ['人数が増えると勝率はどう変わる？', `どのハンドも下がります。AAでも1人相手の${pct(EQ.AA[0])}から、相手5人で${pct(EQ.AA[4])}、相手8人で${pct(EQ.AA[7])}になります。上の「相手の人数」を変えると、全ハンドの勝率を人数別に見られます。`]],
    rankH: '全169種の勝率ランキング', rankIntro: '1人相手の勝率が高い順です。ハンド名を押すと、そのハンドの詳しい確率が表に表示されます。',
    rankCols: ['順位', 'ハンド', '相手1人', '相手2人', '相手5人', '相手8人'],
    method: `勝率は、各ハンド・各人数について${(200000).toLocaleString('ja-JP')}回ずつランダムに配って計算した値です（誤差はおよそ±0.2ポイント）。役の確率は、残りのカードの出方をすべて数えた正確な値です。`,
    ctaH: ['確率がわかったら、', '実際に遊んでみませんか'], ctaP: '新潟・古町のポーカールーム <strong>ちょんまげ</strong> では、スタッフがルールを説明する無料の初心者講習を行っています。',
    ctaBtn: 'はじめての方へ', ctaHref: '../../beginner/', ctaSmall: '金銭を賭けないアミューズメントポーカー店です。換金を伴う遊び方は一切行っておりません。',
    nav: [['確率計算ツール', '../'], ['基本ルール', '../../rules/']],
    footer: '<span>POKER ROOM CHONMAGE · NIIGATA · <a href="/beginner/">はじめての方へ</a> · <a href="/glossary/">用語集</a> · <a href="/faq/">よくある質問</a> · <a href="/company/">運営者情報</a> · <a href="/en/" lang="en">English</a></span><span class="site-credit">Designed &amp; Developed by <b>ANNA</b></span>',
  },
  en: {
    lang: 'en', dir: 'en/calculator/starting-hands/', locale: 'en_US', home: '../../', calc: '../', root: '../../../',
    title: "Texas Hold'em Starting Hand Odds Chart | All 169 Poker Hands Ranked | CHONMAGE",
    desc: `Win odds for all 169 Texas Hold'em starting hands against 1 to 8 opponents, plus the odds of making each hand by the river. Pocket Aces win ${pct(EQ.AA[0])} heads-up. With plain-English notes on every hand.`,
    ogTitle: "Starting Hand Odds Chart | All 169 Poker Hands", ogDesc: 'Win odds for every Texas Hold\'em starting hand by number of opponents, with notes.',
    name: "Texas Hold'em Starting Hand Odds Chart", crumb: ['Home', "Texas Hold'em Odds Calculator", 'Starting Hand Odds Chart'],
    skip: 'Skip to content', homeBtn: '日本語', homeAria: 'CHONMAGE home', langAria: 'Language',
    kicker: 'STARTING HAND ODDS', h1: ['Starting Hand ', 'Odds Chart'],
    lead: "Texas Hold'em has 169 different starting hands. Here is how strong each one really is, with exact odds and short notes.",
    oppLabel: 'Opponents', oppUnit: (n) => String(n),
    legend: ['Top right: suited (s)', 'Bottom left: offsuit (o)', 'Diagonal: pairs', 'T = 10'], scaleLow: 'weaker', scaleHigh: 'stronger',
    tapHint: 'Tap a square to see that hand\'s odds and notes.',
    rankOf: (r) => `Heads-up rank ${r} of 169`, combosOf: (n) => `${n} combinations`,
    eqHead: 'Win chance by number of opponents', vsN: (n) => `${n} opp.`,
    madeHead: 'Hand made by the river (your 7 cards)', calcBtn: 'Calculate with this hand',
    cat: ['High card', 'One pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush', 'Royal flush'],
    kindName: { p: 'Pocket pair', s: 'Suited', o: 'Offsuit' },
    comment(k, d) {
      const [a, b] = ranksOf(k), K = kind(k), out = [];
      if (K === 'p') {
        out.push(`A pocket pair of ${R[a]}s. You flop a set (three of a kind) ${pct(SET_FLOP)} of the time, and make one by the river ${pct(SET_RIVER)} of the time. `);
        out.push(a >= 8 ? `It wins ${pct(d.eq[0], 0)} heads-up, but only ${pct(d.eq[4], 0)} against five opponents, so the pair alone is not always enough.` : `It is roughly a coin flip or better heads-up (${pct(d.eq[0], 0)}), but wins ${pct(d.eq[4], 0)} against five opponents. In big pots it usually needs to hit a set.`);
      } else if (K === 's') {
        const o = k.replace(/s$/, 'o');
        out.push(`${R[a]} and ${R[b]} of the same suit. It makes a flush by the river ${pct(flushP(k))} of the time, against ${pct(flushP(o))} for ${o}, and wins ${((d.eq[0] - EQ[o][0]) * 100).toFixed(1)} points more often heads-up. `);
        if (a - b <= 2 && a < 12) out.push(`The ranks are close, so it also makes a straight ${pct(straightP(k))} of the time: a hand that can win big pots at a full table.`);
        else if (b >= 8) out.push('Both cards are high, so the pairs it makes tend to be strong.');
      } else {
        const s = k.replace(/o$/, 's');
        out.push(`${R[a]} and ${R[b]} of different suits. It wins ${((EQ[s][0] - d.eq[0]) * 100).toFixed(1)} points less often heads-up than ${s}. `);
        if (b >= 8) out.push(`Both cards are high, so its pairs tend to be strong; it wins ${pct(d.eq[0], 0)} heads-up.`);
        else if (d.rank > 120) out.push(`It wins ${pct(d.eq[0], 0)} heads-up and ${pct(d.eq[4], 0)} against five opponents, so it rarely wins at a full table.`);
      }
      return out.join('');
    },
    gridH: 'Starting hand chart',
    howH: 'How to read the chart',
    how: [
      'Rows and columns are the ranks of your two cards. The diagonal holds the pairs (AA, KK and so on); above it are suited hands (s, both cards the same suit) and below it offsuit hands (o, different suits).',
      'Darker squares win more often. Change "Opponents" above and the colours and numbers update for that many opponents. The win chance is how often the hand wins against random hands when nobody folds, with split pots shared.',
      '"Hand made by the river" is the chance that your seven cards (two hole cards plus five board cards) end up as each hand. It is exact: every way the rest of the cards can come is counted.'],
    tierH: 'How strong is your hand?',
    tierIntro: 'The 169 hands split into four groups by heads-up win chance. Against more opponents, suited and connected hands gain value compared with pairs and high cards.',
    tiers: [['Premium', 'ranks 1–10', 'Win often against any number of opponents: big pairs and top cards such as AK.'],
            ['Strong', 'ranks 11–30', 'Hands you can play in most spots: middle pairs and an Ace with a high card.'],
            ['Situational', 'ranks 31–70', 'Their strength depends a lot on the table. Suited, connected hands get better as more players join.'],
            ['Weak', 'ranks 71–169', 'Win in only a few spots. Mostly unconnected, offsuit hands.']],
    factsH: 'Starting hands in numbers',
    facts: [[pct(EQ.AA[0]), 'Pocket Aces heads-up'], [pct(EQ.AA[4]), 'Pocket Aces vs 5 opponents'], [pct(SET_FLOP), 'A pair flops a set'], [pct(avgSuitedFlush), 'Suited cards make a flush by the river'], ['+' + (suitedBonus1 * 100).toFixed(1) + ' pts', 'Average gain from being suited (heads-up)'], [pct(EQ[worst][0]), `Weakest hand, ${worst}, heads-up`]],
    faqH: 'Frequently asked questions',
    faq: [
      ['What is the best starting hand?', `Pocket Aces (AA). It wins ${pct(EQ.AA[0])} heads-up and still ${pct(EQ.AA[4])} against five opponents, more than any other hand. Next come KK (${pct(EQ.KK[0])}) and QQ (${pct(EQ.QQ[0])}).`],
      ['What is the worst starting hand?', `By heads-up win chance it is ${worst}, at ${pct(EQ[worst][0])}. The ranks are too far apart for straights and the different suits make flushes unlikely.`],
      ['Which is stronger, AK or QQ?', `Against random hands QQ (${pct(EQ.QQ[0])}) beats both AKo (${pct(EQ.AKo[0])}) and AKs (${pct(EQ.AKs[0])}). Head to head, QQ beats AK offsuit ${pct(QQ_AK)} of the time.`],
      ['How much does being suited help?', `Comparing the same ranks, the suited version wins ${(suitedBonus1 * 100).toFixed(1)} points more often heads-up on average, and ${(suitedBonus5 * 100).toFixed(1)} points more against five opponents. Suited hands make a flush by the river ${pct(avgSuitedFlush)} of the time, offsuit hands ${pct(avgOffFlush)}.`],
      ['How often does a pocket pair make a set?', `${pct(SET_FLOP)} on the flop and ${pct(SET_RIVER)} by the river, so about one flop in eight.`],
      ['How do more players change the odds?', `Every hand wins less often. Pocket Aces go from ${pct(EQ.AA[0])} heads-up to ${pct(EQ.AA[4])} against five opponents and ${pct(EQ.AA[7])} against eight. Change "Opponents" above to see every hand.`]],
    rankH: 'All 169 hands ranked', rankIntro: 'Sorted by heads-up win chance. Tap a hand to see its details above.',
    rankCols: ['Rank', 'Hand', '1 opp.', '2 opp.', '5 opp.', '8 opp.'],
    method: `Win chances come from ${(200000).toLocaleString('en-US')} random deals per hand and opponent count (about ±0.2 points). Hand odds are exact, counting every way the remaining cards can come.`,
    ctaH: ['Now you know the odds.', 'Come and play?'], ctaP: 'At <strong>POKER ROOM CHONMAGE</strong> in Furumachi, Niigata, staff teach the rules in a free beginner lesson. International guests welcome.',
    ctaBtn: 'Visit us', ctaHref: '../../', ctaSmall: 'An amusement poker room: no cash betting and no cash redemption.',
    nav: [['Odds calculator', '../'], ['CHONMAGE in English', '../../']],
    footer: '<span>POKER ROOM CHONMAGE · NIIGATA · NO CASH BETTING · NO CASH REDEMPTION</span><span class="site-credit">Designed &amp; Developed by <b>ANNA</b></span>',
  },
  zh: {
    lang: 'zh-Hans', dir: 'zh/calculator/starting-hands/', locale: 'zh_CN', home: '../../', calc: '../', root: '../../../',
    title: '德州扑克起手牌胜率表｜全部169种手牌概率排名｜CHONMAGE',
    desc: `德州扑克全部169种起手牌的胜率和概率表。AA 单挑胜率${pct(EQ.AA[0])}。按对手人数列出胜率，以及到河牌为止凑成各牌型的概率，每手牌都附解说。`,
    ogTitle: '德州扑克起手牌胜率表｜全部169种手牌', ogDesc: '每种起手牌按对手人数的胜率和牌型概率，附解说。',
    name: '德州扑克起手牌胜率表（全169种）', crumb: ['首页', '德州扑克手牌概率・胜率计算器', '起手牌胜率表'],
    skip: '跳到正文', homeBtn: '日本語', homeAria: 'CHONMAGE 首页', langAria: 'Language',
    kicker: 'STARTING HAND ODDS', h1: ['德州扑克', '起手牌胜率表'],
    lead: '德州扑克一开始发到的两张手牌，一共有169种。每一种到底有多强？这里用精确的概率和解说告诉你。',
    oppLabel: '对手人数', oppUnit: (n) => n + '人',
    legend: ['右上：同花色（s）', '左下：不同花色（o）', '对角线：对子', 'T＝10'], scaleLow: '弱', scaleHigh: '强',
    tapHint: '点一下格子，就能看到这手牌的详细概率和解说。',
    rankOf: (r) => `单挑胜率 169种中第${r}名`, combosOf: (n) => `共${n}种组合`,
    eqHead: '按对手人数的胜率', vsN: (n) => `对手${n}人`,
    madeHead: '到河牌为止凑成的牌型（你的7张牌）', calcBtn: '用这手牌计算',
    cat: ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺', '皇家同花顺'],
    kindName: { p: '口袋对子', s: '同花色', o: '不同花色' },
    comment(k, d) {
      const [a, b] = ranksOf(k), K = kind(k), out = [];
      if (K === 'p') {
        out.push(`一对${R[a]}。翻牌就成三条的概率是${pct(SET_FLOP)}，到河牌为止是${pct(SET_RIVER)}。`);
        out.push(a >= 8 ? `单挑胜率${pct(d.eq[0], 0)}，是很强的手牌；但对5个对手时降到${pct(d.eq[4], 0)}，光靠一对不一定能赢。` : `单挑胜率${pct(d.eq[0], 0)}，大约五五开以上；对5个对手时只有${pct(d.eq[4], 0)}。人多的时候，通常要成三条才能赢。`);
      } else if (K === 's') {
        const o = k.replace(/s$/, 'o');
        out.push(`同花色的${R[a]}和${R[b]}。到河牌为止成同花的概率是${pct(flushP(k))}，比不同花色的${o}（${pct(flushP(o))}）高，单挑胜率也高${((d.eq[0] - EQ[o][0]) * 100).toFixed(1)}个百分点。`);
        if (a - b <= 2 && a < 12) out.push(`点数接近，成顺子的概率也有${pct(straightP(k))}，在人多的牌桌上有机会赢大底池。`);
        else if (b >= 8) out.push('两张都是大牌，凑成对子时也比较容易赢。');
      } else {
        const s = k.replace(/o$/, 's');
        out.push(`不同花色的${R[a]}和${R[b]}。比同花色的${s}单挑胜率低${((EQ[s][0] - d.eq[0]) * 100).toFixed(1)}个百分点。`);
        if (b >= 8) out.push(`两张都是大牌，凑成对子时比较强，单挑胜率${pct(d.eq[0], 0)}。`);
        else if (d.rank > 120) out.push(`单挑胜率${pct(d.eq[0], 0)}，对5个对手时只有${pct(d.eq[4], 0)}，在人多的牌桌上很难赢。`);
      }
      return out.join('');
    },
    gridH: '起手牌表',
    howH: '这张表怎么看',
    how: [
      '表的横竖是两张手牌的点数。对角线是对子（AA、KK 等），右上是两张同花色的手牌（s），左下是不同花色的手牌（o）。',
      '格子颜色越深，胜率越高。改变上面的「对手人数」，颜色和数字会按人数更新。胜率是对手拿随机手牌、所有人都不弃牌打到最后时，你赢的比例（平局按平分计算）。',
      '「到河牌为止凑成的牌型」是你的7张牌（两张手牌加五张公共牌）最后凑成各牌型的概率，把剩下的牌所有可能的出法全部算过，是精确值。'],
    tierH: '手牌强弱的参考',
    tierIntro: '按单挑胜率的排名，把169种手牌分成4档。不过对手越多，同花色、点数相连的手牌价值越高，对子和大牌的优势会变小。',
    tiers: [['顶级', '第1〜10名', '不管几个人都胜率很高：大对子，以及 AK 这样的两张大牌。'],
            ['强牌', '第11〜30名', '大多数情况下都可以玩：中对子，以及 A 配大牌。'],
            ['看情况', '第31〜70名', '强弱很看牌桌情况。同花色、点数相连的手牌，人越多越有价值。'],
            ['弱牌', '第71〜169名', '能赢的情况很少，多是点数不相连、花色不同的手牌。']],
    factsH: '用数字看起手牌',
    facts: [[pct(EQ.AA[0]), 'AA 单挑胜率'], [pct(EQ.AA[4]), 'AA 对5个对手的胜率'], [pct(SET_FLOP), '口袋对子翻牌成三条'], [pct(avgSuitedFlush), '同花色到河牌成同花'], ['+' + (suitedBonus1 * 100).toFixed(1) + '点', '同花色平均多出的胜率（单挑）'], [pct(EQ[worst][0]), `最弱的${worst}单挑胜率`]],
    faqH: '常见问题',
    faq: [
      ['最强的起手牌是什么？', `AA（一对A）。单挑胜率${pct(EQ.AA[0])}，对5个对手也有${pct(EQ.AA[4])}，比任何手牌都高。第二是 KK（${pct(EQ.KK[0])}），第三是 QQ（${pct(EQ.QQ[0])}）。`],
      ['最弱的起手牌是什么？', `按单挑胜率，最弱的是${worst}，只有${pct(EQ[worst][0])}。点数差太远很难成顺子，花色不同也很难成同花。`],
      ['AK 和 QQ 哪个强？', `对随机手牌的胜率，QQ（${pct(EQ.QQ[0])}）高于 AKo（${pct(EQ.AKo[0])}）和 AKs（${pct(EQ.AKs[0])}）。两手牌直接对决时，QQ 对不同花色的 AK 胜率是${pct(QQ_AK)}。`],
      ['同花色到底有多大优势？', `同样点数相比，同花色单挑平均多赢${(suitedBonus1 * 100).toFixed(1)}个百分点，对5个对手时平均多${(suitedBonus5 * 100).toFixed(1)}个百分点。到河牌为止成同花的概率，同花色平均${pct(avgSuitedFlush)}，不同花色是${pct(avgOffFlush)}。`],
      ['口袋对子成三条的概率是多少？', `翻牌成三条的概率是${pct(SET_FLOP)}，到河牌为止是${pct(SET_RIVER)}，大约每8次翻牌有1次。`],
      ['人数越多，胜率怎么变？', `所有手牌的胜率都会下降。AA 单挑是${pct(EQ.AA[0])}，对5个对手是${pct(EQ.AA[4])}，对8个对手是${pct(EQ.AA[7])}。改变上面的「对手人数」，可以看到每手牌按人数的胜率。`]],
    rankH: '全部169种手牌胜率排名', rankIntro: '按单挑胜率从高到低排列。点手牌名称，可以在上面看到详细概率。',
    rankCols: ['排名', '手牌', '对手1人', '对手2人', '对手5人', '对手8人'],
    method: `胜率是每种手牌、每个人数各随机发${(200000).toLocaleString('en-US')}次牌算出来的（误差约±0.2个百分点）。牌型概率是把剩下的牌所有可能的出法全部算过的精确值。`,
    ctaH: ['知道了概率，', '不如来实际玩一玩？'], ctaP: '新潟・古町的扑克室 <strong>POKER ROOM CHONMAGE（ちょんまげ）</strong>，有店员免费讲解规则的新手课程，欢迎外国客人。',
    ctaBtn: '店铺介绍（英文）', ctaHref: '../../../en/', ctaSmall: '本店为娱乐性扑克店，不进行任何金钱赌博，也不能兑换现金。',
    nav: [['胜率计算器', '../'], ['日文首页', '../../../']],
    footer: '<span>POKER ROOM CHONMAGE · NIIGATA · NO CASH BETTING · NO CASH REDEMPTION</span><span class="site-credit">Designed &amp; Developed by <b>ANNA</b></span>',
  },
};

// ---------- html helpers ----------
const esc = (s) => String(s).replace(/&(?!#?\w+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s) => esc(s).replace(/"/g, '&quot;');
const GRID = [];
for (let r = 12; r >= 0; r--) for (let c = 12; c >= 0; c--) {
  if (r === c) GRID.push(R[r] + R[c]);
  else if (c < r) GRID.push(R[r] + R[c] + 's');
  else GRID.push(R[c] + R[r] + 'o');
}
const STOPS = [[244, 239, 232], [248, 201, 166], [236, 106, 44], [143, 46, 11]];
function heat(t) {
  const x = Math.max(0, Math.min(1, t)) * (STOPS.length - 1), i = Math.min(STOPS.length - 2, Math.floor(x)), f = x - i;
  const c = STOPS[i].map((v, j) => Math.round(v + (STOPS[i + 1][j] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function heatFor(opp) {
  const sorted = KEYS.slice().sort((a, b) => EQ[a][opp] - EQ[b][opp]); const pos = {};
  sorted.forEach((k, i) => { pos[k] = i / (sorted.length - 1); }); return pos;
}

const PAGES = { ja: 'calculator/starting-hands/', en: 'en/calculator/starting-hands/', zh: 'zh/calculator/starting-hands/' };

function build(code) {
  const t = T[code], url = SITE + t.dir, up = t.dir.split('/').filter(Boolean).length, rootRel = '../'.repeat(up);
  const pos = heatFor(0);
  const cells = GRID.map((k) => {
    const p = pos[k];
    return `<button type="button" class="sh-cell${p > 0.62 ? ' dark' : ''}" id="cell-${k}" data-k="${k}" style="background:${heat(p)}" aria-pressed="${k === 'AA' ? 'true' : 'false'}" aria-label="${k} ${pct(EQ[k][0])}"><b>${k.replace(/10/g, 'T')}</b><span>${Math.round(EQ[k][0] * 100)}</span></button>`;
  }).join('');
  const oppBtns = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<button type="button" id="opp-${n}" data-n="${n}" aria-pressed="${n === 1}">${t.oppUnit(n)}</button>`).join('');
  const tiers = TIERS.map(([a, b], i) => `<div class="sh-tier"><h3>${t.tiers[i][0]} <small>${t.tiers[i][1]}</small></h3><p>${t.tiers[i][2]}</p><p class="hands">${rank1.slice(a - 1, b).join(' ')}</p></div>`).join('\n          ');
  const facts = t.facts.map(([v, l]) => `<div class="sh-fact"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
  const faq = t.faq.map(([q, a], i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(q)}</summary><p class="a">${esc(a)}</p></details>`).join('\n            ');
  const rows = rank1.map((k, i) => `<tr><td>${i + 1}</td><th scope="row"><a href="#hand" data-k="${k}">${k}</a></th><td>${pct(EQ[k][0])}</td><td>${pct(EQ[k][1])}</td><td>${pct(EQ[k][4])}</td><td>${pct(EQ[k][7])}</td></tr>`).join('\n');
  const langsNav = ['ja', 'en', 'zh'].map((c) => {
    const label = { ja: '日本語', en: 'English', zh: '中文' }[c], hl = { ja: 'ja', en: 'en', zh: 'zh-Hans' }[c];
    return c === code ? `<a href="./" aria-current="page" lang="${hl}">${label}</a>` : `<a href="${rootRel}${PAGES[c]}" lang="${hl}" hreflang="${hl}">${label}</a>`;
  }).join('');
  const calcUrl = SITE + t.dir.replace('starting-hands/', '');
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebPage', '@id': url + '#page', name: t.name, url, description: t.desc, inLanguage: t.lang,
      isPartOf: { '@type': 'WebSite', name: 'POKER ROOM CHONMAGE', url: SITE } },
    { '@type': 'FAQPage', mainEntity: t.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: t.crumb[0], item: SITE + (code === 'en' ? 'en/' : '') },
      { '@type': 'ListItem', position: 2, name: t.crumb[1], item: calcUrl },
      { '@type': 'ListItem', position: 3, name: t.crumb[2], item: url }] }] };
  const S = {
    cat: t.cat, kind: t.kindName, eqHead: t.eqHead, madeHead: t.madeHead, calcBtn: t.calcBtn,
    vsN: [1, 2, 3, 4, 5, 6, 7, 8].map(t.vsN), rankOf: rank1.map((_, i) => t.rankOf(i + 1)),
    combos: { p: t.combosOf(6), s: t.combosOf(4), o: t.combosOf(12) },
    comments: Object.fromEntries(KEYS.map((k) => [k, t.comment(k, { eq: EQ[k], rank: RANK[k] })])),
  };
  const html = `<!doctype html>
<html lang="${t.lang}">
<head>
${GA}  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#273870" />
  <title>${esc(t.title)}</title>
  <meta name="description" content="${attr(t.desc)}" />
  <link rel="canonical" href="${url}" />
  <link rel="alternate" hreflang="ja" href="${SITE}${PAGES.ja}" />
  <link rel="alternate" hreflang="en" href="${SITE}${PAGES.en}" />
  <link rel="alternate" hreflang="zh-Hans" href="${SITE}${PAGES.zh}" />
  <link rel="alternate" hreflang="x-default" href="${SITE}${PAGES.ja}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="POKER ROOM CHONMAGE" />
  <meta property="og:title" content="${attr(t.ogTitle)}" />
  <meta property="og:description" content="${attr(t.ogDesc)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${SITE}images/og-image.jpg?v=2" />
  <meta property="og:locale" content="${t.locale}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@ChonmageNiigata" />
  <link rel="preload" href="${rootRel}fonts/archivo-black-latin.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400..900&amp;display=swap" media="print" onload="this.media='all'" />
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400..900&amp;display=swap" /></noscript>
  <link rel="stylesheet" href="${rootRel}styles.css?v=20261006perf" />
  <link rel="stylesheet" href="${rootRel}v2.css?v=20261006logo2" />
  <link rel="stylesheet" href="${rootRel}news.css?v=20261014credit" />
  <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96.png?v=20261006chip" />
  <link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png?v=20261006chip" />
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=20261006chip" />
  <link rel="shortcut icon" href="/favicon.ico?v=20261006chip" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=20261006chip" />
  <script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
  </script>
  <link rel="stylesheet" href="${rootRel}calculator/calc.css?v=${VER}" />
  <link rel="stylesheet" href="${rootRel}calculator/hands.css?v=${VER}" />
</head>
<body class="news-page calc-page">
  <a class="news-skip" href="#guide-content">${t.skip}</a>
  <header class="news-page-header">
    <a class="brand brand--logo" href="${rootRel}${code === 'en' ? 'en/' : ''}" aria-label="${t.homeAria}"><img src="${rootRel}images/logo-dark.webp" width="333" height="136" alt="POKER ROOM CHONMAGE" /></a>
    <a class="news-button" href="${rootRel}${code === 'ja' ? '' : PAGES.ja}"${code === 'ja' ? '' : ' lang="ja"'}>${t.homeBtn}</a>
  </header>
  <main id="guide-content" tabindex="-1">
    <div class="cp">
      <div class="cp-intro">
        <nav class="langs" aria-label="${t.langAria}">${langsNav}</nav>
        <p class="cp-kicker">${t.kicker}</p>
        <h1><span>${t.h1[0]}</span><span>${t.h1[1]}</span></h1>
        <p class="cp-lead">${esc(t.lead)}</p>
      </div>

      <div class="cp-tool">
        <section class="panel" aria-labelledby="grid-h">
          <h2 id="grid-h" style="font-size:1.2rem">${t.gridH}</h2>
          <div class="sh-opp" role="group" aria-label="${t.oppLabel}"><span class="sh-opp-label">${t.oppLabel}</span>${oppBtns}</div>
          <div class="sh-grid-wrap"><div class="sh-grid" id="sh-grid">${cells}</div></div>
          <div class="sh-legend"><span>${t.legend.join('</span><span>')}</span><span class="sh-scale">${t.scaleLow}<i></i>${t.scaleHigh}</span></div>
          <p class="panel-note">${t.tapHint}</p>
        </section>

        <section class="panel sh-detail" id="hand" aria-live="polite">
          <div class="sh-detail-head"><h3 id="d-name">AA</h3><small id="d-kind"></small><small id="d-rank"></small><small id="d-combos"></small></div>
          <p class="sh-text" id="d-text"></p>
          <p class="sh-h4">${t.eqHead}</p>
          <div class="sh-bars" id="d-bars"></div>
          <p class="sh-h4">${t.madeHead}</p>
          <table class="sh-made"><tbody id="d-made"></tbody></table>
          <a class="btn btn-fill" id="d-calc" href="${t.calc}#AA">${t.calcBtn} <span aria-hidden="true">→</span></a>
        </section>
      </div>

      <div class="guide-wrap">
        <section class="guide-card sh-article">
          <h2>${t.howH}</h2>
          ${t.how.map((p) => `<p>${esc(p)}</p>`).join('\n          ')}
        </section>

        <section class="guide-card sh-article">
          <h2>${t.tierH}</h2>
          <p>${esc(t.tierIntro)}</p>
          ${tiers}
        </section>

        <section class="guide-card sh-article">
          <h2>${t.factsH}</h2>
          <div class="sh-facts">${facts}</div>
        </section>

        <section class="guide-card sh-article">
          <h2>${t.faqH}</h2>
          <div class="sh-faq">
            ${faq}
          </div>
        </section>

        <section class="guide-card sh-article">
          <h2>${t.rankH}</h2>
          <p>${esc(t.rankIntro)}</p>
          <div class="sh-rank-wrap"><table class="sh-rank" id="rank-table">
            <thead><tr>${t.rankCols.map((c, i) => `<th scope="col"${i === 1 ? ' class="l"' : ''}>${c}</th>`).join('')}</tr></thead>
            <tbody>
${rows}
            </tbody>
          </table></div>
          <p class="panel-note">${esc(t.method)}</p>
        </section>

        <section class="cp-cta">
          <h2>${t.ctaH[0]}<br />${t.ctaH[1]}</h2>
          <div class="cp-cta-row">
            <p>${t.ctaP}</p>
            <a class="btn btn-fill" href="${t.ctaHref}">${t.ctaBtn} <span aria-hidden="true">→</span></a>
          </div>
          <small>${esc(t.ctaSmall)}</small>
        </section>

        <nav class="bottom-nav" aria-label="Page navigation">
          ${t.nav.map(([l, h]) => `<a class="btn btn-line" href="${h}">${l}</a>`).join('')}
        </nav>
      </div>
    </div>
  </main>
  <div class="news-page-end">${t.footer}</div>

  <script src="${rootRel}calculator/preflop-equity.js?v=${VER}"></script>
  <script src="${rootRel}calculator/preflop-odds.js?v=${VER}"></script>
  <script>
  (function () {
    var S = ${JSON.stringify(S)};
    var EQ = window.PREFLOP_EQUITY.hands, OD = window.PREFLOP_ODDS;
    var STOPS = ${JSON.stringify(STOPS)};
    var keys = Object.keys(EQ), opp = 0, cur = 'AA';
    var rank1 = keys.slice().sort(function (a, b) { return EQ[b][0] - EQ[a][0]; });
    function heat(t) { var x = Math.max(0, Math.min(1, t)) * (STOPS.length - 1), i = Math.min(STOPS.length - 2, Math.floor(x)), f = x - i;
      var c = STOPS[i].map(function (v, j) { return Math.round(v + (STOPS[i + 1][j] - v) * f); }); return 'rgb(' + c.join(',') + ')'; }
    function pct(x) { return (x * 100).toFixed(1) + '%'; }
    function small(x) { var v = x * 100; return v >= 10 ? v.toFixed(1) + '%' : v >= 1 ? v.toFixed(2) + '%' : v.toPrecision(2).replace(/0+$/, '').replace(/\\.$/, '') + '%'; }
    function kind(k) { return /s$/.test(k) ? 's' : /o$/.test(k) ? 'o' : 'p'; }
    function paint() {
      var sorted = keys.slice().sort(function (a, b) { return EQ[a][opp] - EQ[b][opp]; }), pos = {};
      sorted.forEach(function (k, i) { pos[k] = i / (sorted.length - 1); });
      keys.forEach(function (k) {
        var el = document.getElementById('cell-' + k); if (!el) return;
        el.style.background = heat(pos[k]); el.classList.toggle('dark', pos[k] > 0.62);
        el.querySelector('span').textContent = Math.round(EQ[k][opp] * 100);
        el.setAttribute('aria-label', k + ' ' + pct(EQ[k][opp]));
      });
    }
    function show(k) {
      cur = k;
      document.querySelectorAll('.sh-cell').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.k === k ? 'true' : 'false'); });
      document.getElementById('d-name').textContent = k;
      document.getElementById('d-kind').textContent = S.kind[kind(k)];
      document.getElementById('d-rank').textContent = S.rankOf[rank1.indexOf(k)];
      document.getElementById('d-combos').textContent = S.combos[kind(k)];
      document.getElementById('d-text').textContent = S.comments[k];
      document.getElementById('d-bars').innerHTML = EQ[k].map(function (v, i) {
        return '<div class="sh-bar' + (i === opp ? ' cur' : '') + '"><span>' + S.vsN[i] + '</span><span class="track"><span class="fill" style="width:' + (v * 100) + '%;display:block"></span></span><b>' + pct(v) + '</b></div>';
      }).join('');
      var m = OD.hands[k], html = '';
      for (var c = 9; c >= 0; c--) if (m[c] > 0) html += '<tr><th scope="row">' + S.cat[c] + '</th><td>' + small(m[c] / OD.total) + '</td></tr>';
      document.getElementById('d-made').innerHTML = html;
      document.getElementById('d-calc').setAttribute('href', '${t.calc}#' + k);
    }
    document.getElementById('sh-grid').addEventListener('click', function (e) { var b = e.target.closest('.sh-cell'); if (b) show(b.dataset.k); });
    document.getElementById('rank-table').addEventListener('click', function (e) {
      var a = e.target.closest('a[data-k]'); if (!a) return; e.preventDefault(); show(a.dataset.k);
      document.getElementById('hand').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    document.querySelectorAll('.sh-opp button').forEach(function (b) {
      b.addEventListener('click', function () {
        opp = +b.dataset.n - 1;
        document.querySelectorAll('.sh-opp button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        paint(); show(cur);
      });
    });
    show('AA');
  })();
  </script>
</body>
</html>
`;
  fs.mkdirSync(path.join(ROOT, t.dir), { recursive: true });
  fs.writeFileSync(path.join(ROOT, t.dir, 'index.html'), html);
  console.log('wrote ' + t.dir + 'index.html');
}

['ja', 'en', 'zh'].forEach(build);
console.log(`QQ vs AKo heads-up: ${pct(QQ_AK, 2)}; worst hand: ${worst}; suited bonus ${(suitedBonus1 * 100).toFixed(2)} pts`);
