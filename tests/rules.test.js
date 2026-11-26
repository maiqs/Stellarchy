import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prepareMap, mulberry32, hops } from "../shared/map.js";
import { newGame, act, invariants, hqChoices, reinforcementsFor, isSet, target } from "../shared/rules.js";
import { botIntent, playTurn, STYLE_KEYS } from "../shared/bot.js";

import { buildMap } from "../shared/mapgen.js";
const MAP = prepareMap(buildMap(JSON.parse(readFileSync(new URL("../data/stars.json", import.meta.url))), +(process.env.SIZE || 300)));
const seats = (k, ai = true, style = i => STYLE_KEYS[i % STYLE_KEYS.length]) =>
  Array.from({ length: k }, (_, i) => ({ id: "s" + i, name: "P" + i, main: "#ff0000", sub: "#ffffff", hull: "orb", style: style(i), ai }));

// run a computer-only game to the end; bots get bolder when nobody takes anything (as the hologram does)
function runGame(map, g, rng, maxTurns = 6000) {

  while (g.status === "playing" && g.turnNo < maxTurns) {
    const seat = g.turn;
    playTurn(map, g, seat, g.seats[seat].style, rng);

    const errs = invariants(map, g); if (errs.length) throw new Error(errs.join("; "));
  }
  return g;
}

test("map: every system is reachable", () => {
  const d = hops(MAP, [0]);
  assert.equal(d.filter(x => x === Infinity).length, 0);
  assert.equal(MAP.n, 300);
});

test("setup: home suns are spaced and then reinforcement begins", () => {
  const rng = mulberry32(1), g = newGame(MAP, { mode: "legacy", seats: seats(4) }, rng);
  assert.equal(g.targetPct, 100, "computer-only games default to total conquest");
  for (let k = 0; k < 4; k++) {
    const ch = hqChoices(MAP, g), r = act(MAP, g, g.turn, { t: "hq", sys: ch[0] }, rng);
    assert.ok(r.ok, r.error);
  }
  assert.equal(g.phase, "reinforce");
  const hq = g.hq; const d = hops(MAP, [hq[0]]);
  for (let k = 1; k < 4; k++) assert.ok(d[hq[k]] >= 4, "home suns at least 4 jumps apart");
  assert.equal(g.reinforcements, reinforcementsFor(MAP, g, g.turn));
});

test("rules reject out-of-turn and illegal moves without changing the game", () => {
  const rng = mulberry32(2), g = newGame(MAP, { mode: "dealt", seats: seats(3, false), targetPct: 70 }, rng);
  const snap = JSON.stringify(g), other = (g.turn + 1) % 3;
  assert.equal(act(MAP, g, other, { t: "endTurn" }, rng).ok, false);
  assert.equal(act(MAP, g, g.turn, { t: "place", placement: { 0: 999 } }, rng).ok, false);
  assert.equal(act(MAP, g, g.turn, { t: "attack", from: 0, to: 1, blitz: true }, rng).ok, false);
  assert.equal(act(MAP, g, g.turn, { t: "nonsense" }, rng).ok, false);
  assert.equal(JSON.stringify(g), snap);
  assert.equal(g.targetPct, 70, "human games keep their win %");
});

test("cards: sets", () => {
  const red = MAP.sun.indexOf(0), orange = MAP.sun.indexOf(1), yellow = MAP.sun.indexOf(2);
  assert.ok(isSet(MAP, [red, orange, yellow]));
  assert.ok(isSet(MAP, [red, orange, MAP.n]));
  const reds = MAP.sun.map((t, i) => t === 0 ? i : -1).filter(i => i >= 0);
  assert.ok(isSet(MAP, reds.slice(0, 3)));
  assert.ok(!isSet(MAP, [reds[0], reds[1], orange]));
});

for (const k of [2, 4, 9, 16]) test(`a ${k}-way computer game runs to total conquest`, () => {
  const rng = mulberry32(100 + k), g = newGame(MAP, { mode: "legacy", seats: seats(k) }, rng);
  runGame(MAP, g, rng);
  assert.equal(g.status, "over", `ended at turn ${g.turnNo}`);
  assert.equal(g.owner.filter(o => o === g.winner).length, MAP.n);
});

test("dealt start with humans ends at the win target", () => {
  const rng = mulberry32(7), g = newGame(MAP, { mode: "dealt", seats: seats(5, false), targetPct: 60 }, rng);
  runGame(MAP, g, rng);
  assert.equal(g.status, "over");
  assert.ok(g.owner.filter(o => o === g.winner).length >= target(MAP, g));
});

test("a human can take a seat back from the AI between any two steps", () => {
  const rng = mulberry32(9), g = newGame(MAP, { mode: "dealt", seats: seats(3, false), targetPct: 80 }, rng);
  const seat = g.turn;
  for (let k = 0; k < 3; k++) { const it = botIntent(MAP, g, seat, "aggressive", rng); assert.ok(act(MAP, g, seat, it, rng).ok); }
  // whatever state the bot left, the human's legal moves still work
  if (g.advance) assert.ok(act(MAP, g, seat, { t: "advance", n: 0 }, rng).ok);
  if (g.phase === "attack") assert.ok(act(MAP, g, seat, { t: "endAttack" }, rng).ok);
  assert.ok(act(MAP, g, seat, { t: "endTurn" }, rng).ok);
  assert.notEqual(g.turn, seat);
});

test("history: sampled through the game, capped, and ends on the final board", () => {
  const rng = mulberry32(77), g = newGame(MAP, { mode: "legacy", seats: seats(6) }, rng);
  runGame(MAP, g, rng);
  const s = g.hist.samples;
  assert.ok(s.length >= 5 && s.length <= 121, `${s.length} samples`);
  assert.equal(s.at(-1).held[g.winner], MAP.n, "the last sample shows the winner holding everything");
  for (let i = 1; i < s.length; i++) assert.ok(s[i].turn >= s[i - 1].turn);
});

test("fog of war: you see your suns and their neighbours, and battles you could see", async () => {
  const { maskBoard, maskEvents, fogActive, FOGGED } = await import("../shared/fog.js");
  const rng = mulberry32(5), g = newGame(MAP, { mode: "dealt", targetPct: 80, seats: seats(4, false) }, rng);
  assert.ok(fogActive(g, 0, true) && !fogActive(g, 0, false) && !fogActive(g, -1, true));
  const v = maskBoard(MAP, g, 0);
  for (let i = 0; i < MAP.n; i++) {
    const near = g.owner[i] === 0 || MAP.adj[i].some(j => g.owner[j] === 0);
    assert.equal(v.owner[i] === FOGGED, !near, `sun ${i}`);
    if (!near) assert.equal(v.armies[i], 0);
  }
  const far = v.owner.findIndex(o => o === FOGGED), farN = MAP.adj[far].find(j => v.owner[j] === FOGGED);
  if (farN !== undefined) assert.equal(maskEvents([{ t: "bt", from: far, to: farN }], v.vis).length, 0, "a battle out of sight is hidden");
});

test("room rules: no cards, fixed sets, and a bigger starting fleet", async () => {
  const { setValue, FIXED_SET } = await import("../shared/rules.js");
  // no cards: nobody ever holds one
  let rng = mulberry32(31), g = newGame(MAP, { mode: "legacy", cards: "none", seats: seats(4) }, rng);
  runGame(MAP, g, rng);
  assert.equal(g.status, "over"); assert.equal(g.cards.flat().length, 0);
  // fixed sets always pay the same, whatever has been traded
  g = newGame(MAP, { mode: "dealt", cards: "fixed", targetPct: 80, seats: seats(3, false) }, mulberry32(32));
  g.trades = 9; assert.equal(setValue(g), FIXED_SET);
  g.cardMode = "escalating"; assert.ok(setValue(g) > FIXED_SET);
  // starting fleet
  rng = mulberry32(33); g = newGame(MAP, { mode: "legacy", hqArmies: 40, seats: seats(3) }, rng);
  const r = act(MAP, g, g.turn, { t: "hq", sys: hqChoices(MAP, g)[0] }, rng);
  assert.ok(r.ok); assert.equal(g.armies[g.hq.find(h => h >= 0)], 40);
});

test("truces: offer, accept, expire, and breaking one is announced", async () => {
  const { offerTruce, acceptTruce, truceBetween } = await import("../shared/rules.js");
  const rng = mulberry32(41), g = newGame(MAP, { mode: "dealt", targetPct: 90, seats: seats(3, false) }, rng);
  assert.equal(acceptTruce(g, 1, 0).ok, false, "nothing to accept yet");
  assert.ok(offerTruce(g, 0, 1).ok);
  assert.ok(acceptTruce(g, 1, 0).ok);
  assert.ok(truceBetween(g, 0, 1) && truceBetween(g, 1, 0));
  assert.equal(offerTruce(g, 0, 1).ok, false, "already at peace");
  // an attack on the partner breaks it, with an event everyone sees
  g.turn = 0; g.phase = "attack";
  const from = g.owner.findIndex((o, i) => o === 0 && MAP.adj[i].some(j => g.owner[j] === 1));
  g.armies[from] = 20; const to = MAP.adj[from].find(j => g.owner[j] === 1);
  const r = act(MAP, g, 0, { t: "attack", from, to, blitz: true }, rng);
  assert.ok(r.ok); assert.ok(r.events.some(e => e.t === "truceBroken" && e.by === 0 && e.with === 1));
  assert.equal(truceBetween(g, 0, 1), undefined);
  // truces run out after 3 rounds
  assert.ok(offerTruce(g, 1, 2).ok && acceptTruce(g, 2, 1).ok);
  if (g.advance) act(MAP, g, 0, { t: "advance", n: 0 }, rng);
  for (let k = 0; k < 3 * 3 + 1 && g.status === "playing"; k++) playTurn(MAP, g, g.turn, "balanced", rng);
  assert.equal(truceBetween(g, 1, 2), undefined, "expired");
});

test("flagships: start at home, and taking one knocks its player out", () => {
  // computer games with flagships still run to the end
  let rng = mulberry32(51), g = newGame(MAP, { mode: "legacy", flagships: true, seats: seats(5) }, rng);
  runGame(MAP, g, rng);
  assert.equal(g.status, "over");
  // dealt: each flagship starts at that player's biggest sun
  rng = mulberry32(52); g = newGame(MAP, { mode: "dealt", flagships: true, targetPct: 90, seats: seats(3, false) }, rng);
  g.seats.forEach((_, p) => assert.equal(g.owner[g.flag[p]], p));
  // capture a flagship: its player is out at once and their other suns go dark
  const def = 1, to = g.flag[def], from = MAP.adj[to].find(j => g.owner[j] === 0) ?? (() => { const j = MAP.adj[to][0]; g.owner[j] = 0; g.armies[j] = 1; return j; })();
  g.turn = 0; g.phase = "attack"; g.armies[from] = 500; g.armies[to] = 1;
  const before = g.owner.filter(o => o === def).length;
  const r = act(MAP, g, 0, { t: "attack", from, to, blitz: true }, rng);
  assert.ok(r.ok && before > 1);
  assert.ok(r.events.some(e => e.t === "flagship") && r.events.some(e => e.t === "elim" && e.seat === def));
  assert.equal(g.owner.filter(o => o === def).length, 0);
  assert.deepEqual(invariants(MAP, g), []);
});

test("highlights: the biggest battle and knock-outs are recorded", () => {
  const rng = mulberry32(61), g = newGame(MAP, { mode: "legacy", seats: seats(5) }, rng);
  runGame(MAP, g, rng);
  assert.equal(g.kos.reduce((a, b) => a + b, 0), 4, "everyone but the winner was knocked out by someone");
  assert.ok(g.best.some(b => b && b.ld > 0 && b.to >= 0 && b.turn > 0));
});

test("replay: rebuilding the board from the history matches the real board", async () => {
  const { replayOwners } = await import("../shared/rules.js");
  const rng = mulberry32(71), g = newGame(MAP, { mode: "legacy", seats: seats(6) }, rng);
  runGame(MAP, g, rng);   // long enough that samples were thinned (steps doubled)
  const h = g.hist; assert.ok(h.step > 1 || h.samples.length > 20);
  assert.deepEqual(replayOwners(h, h.samples.length - 1), g.owner, "the last frame is the final board");
  const mid = replayOwners(h, h.samples.length >> 1);
  const held = g.seats.map((_, k) => mid.filter(o => o === k).length);
  assert.deepEqual(held, h.samples[h.samples.length >> 1].held, "a middle frame matches that sample's counts");
});
