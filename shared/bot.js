// Stellarchy computer players: one brain, five tunings (Paul, 2026-11-25).
// botIntent() returns the next single intent for the seat whose turn it is, so the room can
// play it at the chosen pace and hand the seat back to a returning human between any two steps.
import { hops } from "./map.js";
import { hqChoices, isSet, cardKind, connected, mustTrade, aggression as stallAggression } from "./rules.js";

export const STYLES = {
  balanced:    { name: "Balanced",    blurb: "A bit of everything.",
                 odds: 1.4, margin: 2, reserve: 0.25, cards: 1, continent: 4, elim: 2, claim: 5, hold: 0.5 },
  aggressive:  { name: "Aggressive",  blurb: "Attacks at worse odds, hunts players down, leaves little at home.",
                 odds: 1.35, margin: 2, reserve: 0.2, cards: 0.5, continent: 1.5, elim: 3, claim: 3, hold: 0.1 },
  defensive:   { name: "Defensive",   blurb: "Stacks the borders and attacks only with strong odds.",
                 odds: 1.4, margin: 1, reserve: 0.35, cards: 1, continent: 5, elim: 1, claim: 6, hold: 0.8, spread: true },
  cards:       { name: "Card hunter", blurb: "Takes a sun every turn for a card, saves for big trades.",
                 odds: 1.5, margin: 2, reserve: 0.3, cards: 2.5, continent: 1.5, elim: 4, claim: 4, hold: 0.5, saveSets: true, cardEveryTurn: true },
  territorial: { name: "Territorial", blurb: "Grabs as many suns as it can and chases region bonuses.",
                 odds: 1.3, margin: 1, reserve: 0.15, cards: 0.5, continent: 5, elim: 1, claim: 5.5, hold: 0.3 },
};
export const STYLE_KEYS = Object.keys(STYLES);
export const styleOf = key => STYLES[key] || STYLES.balanced;

const threat = (map, g, i, seat) => map.adj[i].reduce((a, j) => a + (g.owner[j] >= 0 && g.owner[j] !== seat ? g.armies[j] : 0), 0);
const frontier = (map, g, seat) => { const out = []; for (let i = 0; i < map.n; i++) if (g.owner[i] === seat && map.adj[i].some(j => g.owner[j] !== seat)) out.push(i); return out; };
const mine = (g, seat) => g.owner.reduce((a, o, i) => (o === seat && a.push(i), a), []);

function goalContinent(map, g, seat) {
  let best = -1, bs = -1;
  for (const c of map.continents) {
    let have = 0, touch = false;
    for (const i of c.members) { if (g.owner[i] === seat) { have++; touch = true; } else if (map.adj[i].some(j => g.owner[j] === seat)) touch = true; }
    if (!touch || have === c.members.length) continue;
    const sc = have / c.members.length + c.bonus / c.members.length * 0.5 + (have > 0 ? 0.2 : 0);
    if (sc > bs) { bs = sc; best = c.id; }
  }
  return best;
}

function bestSet(map, g, seat) {
  const h = g.cards[seat]; let best = null, bs = -Infinity;
  for (let a = 0; a < h.length; a++) for (let b = a + 1; b < h.length; b++) for (let c = b + 1; c < h.length; c++) {
    const ids = [h[a], h[b], h[c]]; if (!isSet(map, ids)) continue;
    const sc = (ids.some(x => x < map.n && g.owner[x] === seat) ? 2 : 0) - ids.filter(x => cardKind(map, x) === 3).length * 3;
    if (sc > bs) { bs = sc; best = ids; }
  }
  return best;
}

export function botIntent(map, g, seat, styleKey, rng, aggression = stallAggression(g)) {
  const S = styleOf(styleKey);
  if (g.status !== "playing" || g.turn !== seat) return null;
  if (g.advance) return { t: "advance", n: advanceCount(map, g, seat, S) };
  if (g.phase === "setup") {
    const ch = hqChoices(map, g); if (!ch.length) return null;
    const room = i => hops(map, [i], 2).filter(d => d <= 2).length;
    const best = ch.map(i => [i, map.adj[i].length * 2 + room(i) + rng() * 3]).sort((a, b) => b[1] - a[1])[0][0];
    return { t: "hq", sys: best };
  }
  if (g.phase === "reinforce") {
    const set = bestSet(map, g, seat);
    // the card hunter saves sets for bigger trades unless forced; everyone else trades at once
    if (set && (mustTrade(g, seat) || !S.saveSets || g.cards[seat].length >= 4)) return { t: "trade", cards: set };
    return { t: "place", placement: placement(map, g, seat, S) };
  }
  if (g.phase === "attack") {
    const pick = chooseAttack(map, g, seat, S, aggression);
    return pick ? { t: "attack", from: pick[0], to: pick[1], blitz: true } : { t: "endAttack" };
  }
  if (g.phase === "fortify") {
    if (!g.fortified) { const f = chooseFortify(map, g, seat, S); if (f) return f; }
    return { t: "endTurn" };
  }
  return null;
}

function placement(map, g, seat, S) {
  const goal = goalContinent(map, g, seat), fr = frontier(map, g, seat), r = g.reinforcements;
  const score = i => threat(map, g, i, seat) * (0.5 + S.hold) - g.armies[i] * 0.5
    + (map.adj[i].some(j => g.owner[j] !== seat && map.contOf[j] === goal) ? S.continent * 2 : 0)
    + (map.adj[i].some(j => g.owner[j] < 0) ? S.claim : 0)
    + (map.adj[i].some(j => g.owner[j] >= 0 && g.owner[j] !== seat && g.owner.filter(o => o === g.owner[j]).length <= 3) ? S.elim : 0)
    + (g.hq[seat] === i ? 2 * (S.hold + 0.5) : 0);
  const ranked = (fr.length ? fr : mine(g, seat)).sort((a, b) => score(b) - score(a));
  const p = {};
  if (S.spread && ranked.length > 2) {   // defensive: spread across the three most threatened borders
    const a = Math.ceil(r / 2), b = Math.ceil((r - a) / 2), c = r - a - b;
    p[ranked[0]] = a; if (b) p[ranked[1]] = b; if (c) p[ranked[2]] = c;
  } else {
    const main = Math.ceil(r * (ranked.length > 1 ? 0.7 : 1)); p[ranked[0]] = main; if (r - main > 0) p[ranked[1]] = r - main;
  }
  return p;
}

function chooseAttack(map, g, seat, S, aggression) {
  const goal = goalContinent(map, g, seat); let best = null, bs = -Infinity;
  const odds = Math.max(0.85, S.odds - aggression * 0.2), margin = Math.max(0, S.margin - aggression), reserve = S.reserve * Math.max(0, 1 - aggression / 4);
  const counts = new Map(); g.owner.forEach(o => { if (o >= 0) counts.set(o, (counts.get(o) || 0) + 1); });
  const needCard = !g.conq && !!S.cardEveryTurn;
  for (let i = 0; i < map.n; i++) {
    if (g.owner[i] !== seat || g.armies[i] < 2) continue;
    const keep = Math.min(Math.floor(g.armies[i] / 2), Math.floor(threat(map, g, i, seat) * reserve));
    for (const j of map.adj[i]) {
      const dOwn = g.owner[j]; if (dOwn === seat) continue;
      const att = g.armies[i] - 1 - keep, def = g.armies[j];
      const ok = dOwn < 0 ? g.armies[i] - 1 >= 1 : (att >= def + margin && att >= def * odds) || (needCard && att >= def + 1);
      if (!ok) continue;
      const sc = (dOwn < 0 ? S.claim : 2.5) + (map.contOf[j] === goal ? S.continent : 0) + Math.min(3, (att - def) / (def + 1))
        + (dOwn >= 0 && counts.get(dOwn) <= 2 ? S.elim : 0) + (dOwn >= 0 && g.hq[dOwn] === j ? 2 : 0)
        + (needCard ? S.cards : 0) - (g.hq[seat] === i && threat(map, g, i, seat) > 0 ? 2 * S.hold : 0);
      if (sc > bs) { bs = sc; best = [i, j]; }
    }
  }
  return best;
}

function advanceCount(map, g, seat, S) {
  const m = g.advance, aheadOpen = map.adj[m.to].some(j => g.owner[j] !== seat);
  const behindRisk = threat(map, g, m.from, seat) > 0 || g.hq[seat] === m.from;
  const keepShare = behindRisk ? Math.min(0.9, 0.4 + S.hold * 0.4) : 0;
  const k = aheadOpen ? Math.floor(m.max * (1 - keepShare)) : Math.floor(m.max / 4);
  return Math.max(0, Math.min(m.max, k));
}

function chooseFortify(map, g, seat, S) {
  const inner = mine(g, seat).filter(i => g.armies[i] >= 3 && !map.adj[i].some(j => g.owner[j] !== seat)).sort((a, b) => g.armies[b] - g.armies[a]);
  if (!inner.length) return null;
  const src = inner[0], dst = frontier(map, g, seat).filter(i => connected(map, g, src, i, seat)).sort((a, b) => threat(map, g, b, seat) - threat(map, g, a, seat))[0];
  return dst === undefined ? null : { t: "fortify", from: src, to: dst, n: g.armies[src] - 1 };
}

// play the seat's whole turn at once (tests and fast-forward); returns all events
export function playTurn(map, g, act, seat, styleKey, rng, aggression) {
  const all = [];
  for (let guard = 0; guard < 400 && g.status === "playing" && g.turn === seat; guard++) {
    const it = botIntent(map, g, seat, styleKey, rng, aggression);
    if (!it) break;
    const r = act(map, g, seat, it, rng);
    if (!r.ok) {   // never stall: fall back to moving the turn on
      const fb = g.advance ? { t: "advance", n: 0 } : g.phase === "attack" ? { t: "endAttack" } : g.phase === "fortify" ? { t: "endTurn" } : null;
      if (!fb) throw new Error(`bot stuck: ${JSON.stringify(it)} -> ${r.error}`);
      const r2 = act(map, g, seat, fb, rng); if (!r2.ok) throw new Error(`bot stuck: ${r2.error}`);
      all.push(...r2.events); continue;
    }
    all.push(...r.events);
  }
  return all;
}
