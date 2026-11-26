// Stellarchy rules: one pure state machine shared by the room server, the browser and the tests.
// The server is the authority: clients send intents, act() checks and applies them, and the
// returned events drive the animations. Never call it "Risk" anywhere (Hasbro trademark).
import { hops } from "./map.js";

export const HQ_ARMIES = 10, HQ_BONUS = 2;
export const TRADE_VALUES = [4, 6, 8, 10, 12, 15];
export const MAX_SEATS = 16;
// sets rise 4, 6, 8, 10, 12, 15, then +5 each, capped so card income can never swamp what territory earns
// (uncapped, 1,000-sun games reached 9,000 ships a set and never ended)
export const TRADE_CAP = 40;
// what the next set pays: escalating (the default), or a flat 8 ships in a "fixed" room
export const FIXED_SET = 8;
export const setValue = g => g.cardMode === "fixed" ? FIXED_SET : tradeValue(g.trades);
export const tradeValue = k => Math.min(TRADE_CAP, k < TRADE_VALUES.length ? TRADE_VALUES[k] : 15 + 5 * (k - TRADE_VALUES.length + 1));
// home suns sit further apart on bigger maps
export const hqSpacing = n => n >= 100 ? 4 : n >= 30 ? 3 : 2;
// at least this many suns per seat
export const SUNS_PER_SEAT = 4;
// cards: one per system plus two wilds; a card id >= n is a wild (kind 3)
export const cardKind = (map, id) => id >= map.n ? 3 : map.sun[id];

const shuffled = (a, rng) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clone = o => JSON.parse(JSON.stringify(o));

// ---- creating a game ----
// opts: {mode: "legacy" | "dealt", targetPct, seats: [{id, name, main, sub, hull, style, ai}]}
export function newGame(map, opts, rng) {
  const seats = opts.seats.map(s => ({ ...s, away: false }));
  if (seats.length < 2) throw new Error("need 2 seats");
  if (seats.length > MAX_SEATS) throw new Error("too many seats");
  if (map.n < seats.length * SUNS_PER_SEAT) throw new Error("map too small for the seats");
  const allAI = seats.every(s => s.ai);
  const n = map.n, first = Math.floor(rng() * seats.length);
  const g = {
    v: 1, status: "playing", mode: opts.mode === "dealt" ? "dealt" : "legacy",
    targetPct: allAI ? 100 : clampPct(opts.targetPct ?? 100),   // computer-only games run to total conquest (Paul)
    cardMode: ["escalating", "fixed", "none"].includes(opts.cards) ? opts.cards : "escalating",   // room option: how card sets pay
    hqArmies: [10, 20, 40].includes(opts.hqArmies) ? opts.hqArmies : HQ_ARMIES,           // room option: the starting fleet at a home sun
    best: seats.map(() => null), kos: seats.map(() => 0),   // highlights for the results: biggest battle, players knocked out
    flagships: !!opts.flagships, flag: seats.map(() => -1),   // room option: lose your flagship and you are out
    seats, owner: new Array(n).fill(-1), armies: new Array(n).fill(0), hq: seats.map(() => -1),
    turn: first, setupFirst: first, phase: "setup", reinforcements: 0, fortified: false, turnNo: 1,
    alive: seats.map(() => true), deck: shuffled([...Array(n + 2).keys()], rng), discard: [], cards: seats.map(() => []),
    trades: 0, conq: false, advance: null, winner: -1, lastRoll: null, stall: { best: 0, alive: seats.length, unclaimed: n, quiet: 0 },
  };
  if (g.mode === "dealt") {
    const order = shuffled([...Array(n).keys()], rng);
    order.forEach((sys, k) => { g.owner[sys] = k % seats.length; g.armies[sys] = 1; });
    for (let p = 0; p < seats.length; p++) {
      const mine = order.filter(i => g.owner[i] === p);
      for (let k = 0; k < mine.length; k++) g.armies[mine[Math.floor(rng() * mine.length)]]++;
    }
    g.phase = "reinforce"; g.reinforcements = reinforcementsFor(map, g, first);
    if (g.flagships) g.flag = seats.map((_, p) => { let best = -1; g.owner.forEach((o, i) => { if (o === p && (best < 0 || g.armies[i] > g.armies[best])) best = i; }); return best; });   // dealt: at your biggest sun
  }
  return g;
}
const clampPct = p => Math.max(30, Math.min(100, Math.round(p)));

// ---- queries ----
export const ownedBy = (g, seat) => g.owner.reduce((a, o) => a + (o === seat ? 1 : 0), 0);
export function effPct(g) {
  if (g.mode === "legacy") return g.targetPct;
  return Math.min(100, Math.max(g.targetPct, Math.ceil(100 / g.seats.length) + 15));
}
export const target = (map, g) => Math.ceil(map.n * effPct(g) / 100);
export function reinforcementsFor(map, g, seat) {
  let r = Math.max(3, Math.floor(ownedBy(g, seat) / 3));
  for (const c of map.continents) if (c.members.length && c.members.every(i => g.owner[i] === seat)) r += c.bonus;
  if (g.hq[seat] >= 0 && g.owner[g.hq[seat]] === seat) r += HQ_BONUS;
  return r;
}
export function hqChoices(map, g) {
  const taken = g.hq.filter(h => h >= 0);
  for (let need = hqSpacing(map.n); need >= 1; need--) {
    const d = hops(map, taken, need), ok = [];
    for (let i = 0; i < map.n; i++) if (g.owner[i] < 0 && d[i] >= need) ok.push(i);
    if (ok.length) return ok;
  }
  return [];
}
export function connected(map, g, a, b, seat) {
  const seen = new Set([a]), q = [a];
  for (let h = 0; h < q.length; h++) {
    const u = q[h]; if (u === b) return true;
    for (const j of map.adj[u]) if (!seen.has(j) && g.owner[j] === seat) { seen.add(j); q.push(j); }
  }
  return false;
}
export function isSet(map, ids) {
  if (ids.length !== 3 || new Set(ids).size !== 3) return false;
  const k = ids.map(id => cardKind(map, id)); if (k.includes(3)) return true;
  return (k[0] === k[1] && k[1] === k[2]) || new Set(k).size === 3;
}
export const mustTrade = (g, seat) => g.cards[seat].length >= 5;

// ---- actions ----
// intent: {t: "hq", sys} | {t: "trade", cards: [a, b, c]} | {t: "place", placement: {sys: count}}
//   | {t: "attack", from, to, blitz} | {t: "advance", n} | {t: "endAttack"} | {t: "fortify", from, to, n} | {t: "endTurn"}
// returns {ok: true, events} or {ok: false, error}; g is changed in place only when ok
export function act(map, g, seat, intent, rng) {
  const err = e => ({ ok: false, error: e });
  if (g.status !== "playing") return err("game over");
  if (seat !== g.turn) return err("not your turn");
  if (!intent || typeof intent.t !== "string") return err("bad intent");
  if (g.advance && intent.t !== "advance") return err("choose how many ships follow first");
  const ev = [], fn = ACTIONS[intent.t];
  if (!fn) return err("unknown action");
  const before = clone(g);
  const e = fn(map, g, seat, intent, rng, ev);
  if (e) { Object.assign(g, before); return err(e); }
  return { ok: true, events: ev };
}

const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

const ACTIONS = {
  hq(map, g, seat, { sys }, rng, ev) {
    if (g.phase !== "setup") return "not choosing home suns";
    if (!hqChoices(map, g).includes(sys)) return "too close to another home sun";
    const fleet = g.hqArmies || HQ_ARMIES;
    g.owner[sys] = seat; g.armies[sys] = fleet; g.hq[seat] = sys;
    if (g.flagships) g.flag[seat] = sys;   // the flagship starts at the home sun
    ev.push({ t: "hq", seat, s: sys }, { t: "rf", s: sys, n: fleet });
    const k = g.seats.length;
    for (let d = 1; d <= k; d++) { const c = (seat + d) % k; if (g.hq[c] < 0) { g.turn = c; return; } }
    g.phase = "reinforce"; g.turn = g.setupFirst; g.reinforcements = reinforcementsFor(map, g, g.turn);
    ev.push({ t: "turn", seat: g.turn, turnNo: g.turnNo });
  },
  trade(map, g, seat, { cards }, rng, ev) {
    if (g.phase !== "reinforce") return "trade during reinforcement";
    if (!Array.isArray(cards) || !isSet(map, cards) || !cards.every(c => g.cards[seat].includes(c))) return "not a set you hold";
    const val = setValue(g);
    g.cards[seat] = g.cards[seat].filter(c => !cards.includes(c)); g.discard.push(...cards); g.trades++;
    g.reinforcements += val;
    const bonus = cards.find(c => c < map.n && g.owner[c] === seat);
    if (bonus !== undefined) { g.armies[bonus] += 2; ev.push({ t: "rf", s: bonus, n: 2 }); }
    ev.push({ t: "trade", seat, cards, val, bonus: bonus ?? -1 });
  },
  place(map, g, seat, { placement }, rng, ev) {
    if (g.phase !== "reinforce") return "not placing";
    if (mustTrade(g, seat)) return "five cards: trade a set first";
    if (!placement || typeof placement !== "object") return "bad placement";
    let total = 0;
    for (const k in placement) {
      const i = +k, c = placement[k];
      if (!int(i, 0, map.n - 1) || g.owner[i] !== seat || !int(c, 1, 100000)) return "place only on your own suns";
      total += c;
    }
    if (total !== g.reinforcements) return `place exactly ${g.reinforcements}`;
    for (const k in placement) { g.armies[+k] += placement[k]; ev.push({ t: "rf", s: +k, n: placement[k] }); }
    g.reinforcements = 0; g.phase = "attack";
  },
  attack(map, g, seat, { from, to, blitz }, rng, ev) {
    if (g.phase !== "attack") return "not attacking";
    if (!int(from, 0, map.n - 1) || !int(to, 0, map.n - 1)) return "bad system";
    if (g.owner[from] !== seat || g.armies[from] < 2) return "need 2 ships at your sun";
    if (!map.adj[from].includes(to) || g.owner[to] === seat) return "not a neighbouring target";
    const def = g.owner[to];
    if (def < 0) {   // unclaimed: simply moved into, no fire (Paul)
      g.owner[to] = seat; g.armies[to] = 1; g.armies[from] -= 1; g.conq = true; g.lastRoll = null;
      ev.push({ t: "mv", from, to, n: 1, seat, claim: true });
      g.advance = g.armies[from] > 1 ? { from, to, max: g.armies[from] - 1 } : null;
      return winCheck(map, g, seat, ev);
    }
    const tr = truceBetween(g, seat, def);   // attacking a truce partner breaks the truce, for all to see
    if (tr) { g.truces = g.truces.filter(t => t !== tr); ev.push({ t: "truceBroken", by: seat, with: def }); }
    const roll = k => Array.from({ length: k }, () => 1 + Math.floor(rng() * 6)).sort((a, b) => b - a);
    let lostA = 0, lostD = 0, rounds = 0, a, d;
    do {
      a = roll(Math.min(3, g.armies[from] - 1)); d = roll(Math.min(2, g.armies[to]));
      if (g.flagships && g.flag[def] === to) d[0] = Math.min(6, d[0] + 1);   // the flagship's guns: +1 on the best defending die
      for (let k = 0; k < Math.min(a.length, d.length); k++) { if (a[k] > d[k]) { g.armies[to]--; lostD++; } else { g.armies[from]--; lostA++; } }
      rounds++;
    } while (blitz && g.armies[to] > 0 && g.armies[from] > 1);
    g.lastRoll = { a, d, lostA, lostD, rounds, from, to };
    const captured = g.armies[to] <= 0;
    if (g.best && lostD > 0 && (!g.best[seat] || lostD > g.best[seat].ld)) g.best[seat] = { ld: lostD, la: lostA, to, turn: g.turnNo, cap: captured };
    ev.push({ t: "bt", from, to, a: seat, d: def, la: lostA, ld: lostD, rounds, cap: captured, dice: { a, d } });
    if (!captured) return;
    const moveIn = a.length;
    g.owner[to] = seat; g.armies[to] = moveIn; g.armies[from] -= moveIn; g.conq = true;
    if (g.hq[def] === to) ev.push({ t: "hqTaken", seat, from: def, s: to });
    // flagship rule: taking a player's flagship knocks them out; their other suns go dark (unclaimed)
    if (g.flagships && g.flag[def] === to) {
      ev.push({ t: "flagship", seat, from: def, s: to });
      for (let i = 0; i < g.owner.length; i++) if (g.owner[i] === def) { g.owner[i] = -1; g.armies[i] = 0; }
    }
    if (!g.owner.includes(def)) {
      g.alive[def] = false; ev.push({ t: "elim", seat: def, by: seat }); if (g.kos) g.kos[seat]++;
      if (g.cards[def].length) { g.cards[seat].push(...g.cards[def]); g.cards[def] = []; }   // the victor takes the beaten player's cards
    }
    g.advance = g.armies[from] > 1 ? { from, to, max: g.armies[from] - 1 } : null;
    return winCheck(map, g, seat, ev);
  },
  advance(map, g, seat, { n }, rng, ev) {
    const m = g.advance; if (!m) return "nothing to move";
    if (!int(n, 0, m.max)) return `move 0 to ${m.max}`;
    g.armies[m.from] -= n; g.armies[m.to] += n; g.advance = null;
    if (n > 0) ev.push({ t: "mv", from: m.from, to: m.to, n, seat });
  },
  endAttack(map, g, seat, i, rng, ev) {
    if (g.phase !== "attack") return "not attacking";
    g.phase = "fortify";
  },
  fortify(map, g, seat, { from, to, n }, rng, ev) {
    if (g.phase !== "fortify" && g.phase !== "attack") return "not now";
    if (g.fortified) return "already moved this turn";
    if (!int(from, 0, map.n - 1) || !int(to, 0, map.n - 1) || from === to) return "bad systems";
    if (g.owner[from] !== seat || g.owner[to] !== seat) return "move between your own suns";
    if (!int(n, 1, g.armies[from] - 1)) return `move 1 to ${g.armies[from] - 1}`;
    if (!connected(map, g, from, to, seat)) return "no path through your own suns";
    g.armies[from] -= n; g.armies[to] += n; g.fortified = true; g.phase = "fortify";
    ev.push({ t: "mv", from, to, n, seat, fortify: true });
  },
  endTurn(map, g, seat, i, rng, ev) {
    if (g.phase === "setup" || g.phase === "reinforce") return "place your ships first";
    if (g.conq && g.cardMode !== "none") {   // a turn with a conquest earns a card (unless the room plays without cards)
      if (!g.deck.length && g.discard.length) { g.deck = shuffled(g.discard, rng); g.discard = []; }
      if (g.deck.length) { const c = g.deck.pop(); g.cards[seat].push(c); ev.push({ t: "card", seat }); }
    }
    nextTurn(map, g, ev);
  },
};

function winCheck(map, g, seat, ev) {
  const mine = ownedBy(g, seat);
  if (mine >= target(map, g)) {
    g.status = "over"; g.winner = seat; g.advance = null; recordHistory(g, true);
    ev.push({ t: "win", seat, systems: mine, turnNo: g.turnNo });
  }
}

function nextTurn(map, g, ev) {
  const k = g.seats.length; let nx = g.turn;
  for (let d = 0; d < k; d++) { nx = (nx + 1) % k; if (g.alive[nx]) break; }
  g.turn = nx; g.phase = "reinforce"; g.reinforcements = reinforcementsFor(map, g, nx);
  g.fortified = false; g.conq = false; g.advance = null; g.lastRoll = null; g.turnNo++;
  trackStall(g); recordHistory(g); tidyTruces(g);
  ev.push({ t: "turn", seat: nx, turnNo: g.turnNo });
}


// a check used by tests: every rule that must always hold
export function invariants(map, g) {
  const errs = [];
  for (let i = 0; i < map.n; i++) {
    if (g.owner[i] >= 0 && g.armies[i] < 1) errs.push(`sys ${i} owned with ${g.armies[i]} ships`);
    if (g.owner[i] < 0 && g.armies[i] !== 0) errs.push(`sys ${i} unclaimed with ships`);
  }
  const cardCount = g.deck.length + g.discard.length + g.cards.reduce((a, h) => a + h.length, 0);
  if (cardCount !== map.n + 2) errs.push(`cards: ${cardCount} of ${map.n + 2}`);
  g.seats.forEach((s, k) => { if (g.phase !== "setup" && g.alive[k] !== g.owner.includes(k)) errs.push(`seat ${k} alive flag wrong`); });
  return errs;
}

// stalemate tracking: "progress" is a new record holding, an elimination or a claimed sun.
// Computer players grow bolder the longer a game goes without progress, so every game ends.
function trackStall(g) {
  const st = g.stall, k = g.seats.length;
  const best = Math.max(...g.seats.map((_, s) => ownedBy(g, s))), alive = g.alive.filter(Boolean).length, unclaimed = g.owner.filter(o => o < 0).length;
  if (best > st.best || alive < st.alive || unclaimed < st.unclaimed) { st.best = Math.max(st.best, best); st.alive = alive; st.unclaimed = unclaimed; st.quiet = 0; }
  else st.quiet++;
}
// 0 (normal) to 8 (reckless), rising one step per two quiet rounds
export const aggression = g => Math.min(8, Math.floor((g.stall ? g.stall.quiet : 0) / (2 * g.alive.filter(Boolean).length)));

// history for the end-of-game graph: suns held by each seat, sampled once per round of turns.
// Kept to at most 120 samples by dropping every other one when full (the step doubles each time).
export const HISTORY_MAX = 120;
export function recordHistory(g, force = false) {
  const h = g.hist || (g.hist = { step: 1, samples: [] });
  if (!force && g.turnNo % (g.seats.length * h.step) !== 0) return;
  h.samples.push({ turn: g.turnNo, held: g.seats.map((_, k) => ownedBy(g, k)) });
  if (h.samples.length > HISTORY_MAX) { h.samples = h.samples.filter((_, i) => i % 2 === 0); h.step *= 2; }
}

// ---- truces (a player wish: light diplomacy with no free-text chat) ----
// A truce is non-binding: either side may still attack, but doing so breaks it and everyone is told.
// Offers and acceptances can happen at any time, not only on your turn. A truce lasts 3 rounds.
export const TRUCE_ROUNDS = 3, OFFER_ROUNDS = 1;
const pair = (a, b) => a < b ? [a, b] : [b, a];
export const truceBetween = (g, a, b) => (g.truces || []).find(t => (t.a === a && t.b === b) || (t.a === b && t.b === a));
export function offerTruce(g, from, to) {
  if (g.status !== "playing" || from === to || !g.alive[from] || !g.alive[to] || truceBetween(g, from, to)) return { ok: false, error: "no truce possible" };
  g.offers = (g.offers || []).filter(o => !(o.from === from && o.to === to));
  g.offers.push({ from, to, until: g.turnNo + g.seats.length * OFFER_ROUNDS });
  return { ok: true, events: [{ t: "truceOffer", from, to }] };
}
export function acceptTruce(g, by, from) {
  const o = (g.offers || []).find(x => x.from === from && x.to === by && x.until >= g.turnNo);
  if (!o || !g.alive[from] || !g.alive[by]) return { ok: false, error: "that offer has gone" };
  g.offers = g.offers.filter(x => x !== o && !(x.from === by && x.to === from));
  const [a, b] = pair(from, by); (g.truces = g.truces || []).push({ a, b, until: g.turnNo + g.seats.length * TRUCE_ROUNDS });
  return { ok: true, events: [{ t: "truce", a, b }] };
}
// called as turns pass and on attacks: expired truces and offers drop; attacking a partner breaks the truce
export function tidyTruces(g) {
  if (g.truces) g.truces = g.truces.filter(t => t.until > g.turnNo && g.alive[t.a] && g.alive[t.b]);
  if (g.offers) g.offers = g.offers.filter(o => o.until >= g.turnNo && g.alive[o.from] && g.alive[o.to]);
}
export function declineTruce(g, by, from) {
  const had = (g.offers || []).some(o => o.from === from && o.to === by);
  g.offers = (g.offers || []).filter(o => !(o.from === from && o.to === by));
  return had ? { ok: true, events: [{ t: "truceDeclined", by, from }] } : { ok: false, error: "no offer" };
}
