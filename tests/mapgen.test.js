import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildMap, SIZE_STEPS } from "../shared/mapgen.js";
import { prepareMap, mulberry32, hops } from "../shared/map.js";
import { newGame, act, invariants } from "../shared/rules.js";
import { playTurn, STYLE_KEYS } from "../shared/bot.js";

const STARS = JSON.parse(readFileSync(new URL("../data/stars.json", import.meta.url)));
const seats = k => Array.from({ length: k }, (_, i) => ({ id: "s" + i, name: "P" + i, style: STYLE_KEYS[i % STYLE_KEYS.length], ai: true }));

test("star list: 3,000 systems sorted from Sol outward", () => {
  assert.equal(STARS.systems.length, 3000);
  assert.equal(STARS.systems[0].name, "Sol");
  for (let i = 1; i < STARS.systems.length; i++) assert.ok(STARS.systems[i].distLy >= STARS.systems[i - 1].distLy);
});

for (const n of SIZE_STEPS) test(`map of ${n} suns: connected, 2+ lanes each, regions valid`, () => {
  const raw = buildMap(STARS, n), m = prepareMap(raw);
  assert.equal(m.n, n);
  assert.equal(hops(m, [0]).filter(d => d === Infinity).length, 0);
  assert.ok(m.adj.every(a => a.length >= 2));
  if (n >= 30) {
    assert.ok(raw.continents.length >= 2);
    assert.equal(raw.continents.reduce((a, c) => a + c.territories, 0), n, "every sun is in exactly one region");
    for (const c of m.continents) {   // each region is joined by its own lanes
      const mem = new Set(c.members), seen = new Set([c.members[0]]), q = [c.members[0]];
      for (let h = 0; h < q.length; h++) for (const j of m.adj[q[h]]) if (mem.has(j) && !seen.has(j)) { seen.add(j); q.push(j); }
      assert.equal(seen.size, mem.size, `${c.name} is in pieces`);
    }
  }
});

test("the same size always gives the same map", () => {
  assert.equal(JSON.stringify(buildMap(STARS, 500)), JSON.stringify(buildMap(STARS, 500)));
});

for (const [n, k] of [[10, 2], [25, 4], [200, 6], [1000, 6], [3000, 8]]) test(`a ${k}-way game on ${n} suns runs to total conquest`, () => {
  const m = prepareMap(buildMap(STARS, n)), rng = mulberry32(n + k), g = newGame(m, { mode: "legacy", seats: seats(k) }, rng);
  while (g.status === "playing" && g.turnNo < 12000) { playTurn(m, g, act, g.turn, g.seats[g.turn].style, rng); }
  assert.deepEqual(invariants(m, g), []);
  assert.equal(g.status, "over", `stopped at turn ${g.turnNo}`);
});

test("a 3,000-sun game stays consistent for 300 turns", () => {
  const m = prepareMap(buildMap(STARS, 3000)), rng = mulberry32(3), g = newGame(m, { mode: "dealt", targetPct: 60, seats: seats(8).map(s => ({ ...s, ai: false })) }, rng);
  while (g.status === "playing" && g.turnNo < 300) playTurn(m, g, act, g.turn, g.seats[g.turn].style, rng);
  assert.deepEqual(invariants(m, g), []);
});
