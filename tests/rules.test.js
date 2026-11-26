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
    playTurn(map, g, act, seat, g.seats[seat].style, rng);

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
