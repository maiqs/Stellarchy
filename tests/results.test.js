import { test } from "node:test";
import assert from "node:assert/strict";
import { historyChart, highlights, diceLine } from "../client/results.js";

const v = { seats: [{}, {}, {}], n: 10, lookOf: k => ({ main: ["#f00", "#0f0", "#00f"][k] }), nameOf: k => "P" + k, sunName: i => "Sun" + i };
const g = { turnNo: 30, winner: 0, hist: { samples: [{ turn: 3, held: [3, 3, 2] }, { turn: 6, held: [6, 2, 2] }, { turn: 9, held: [10, 0, 0] }] },
            best: [{ ld: 4, la: 1, to: 2, turn: 5, cap: true }, { ld: 9, la: 3, to: 7, turn: 7, cap: false }, null], kos: [2, 0, 0] };

test("results chart: one line per player, real numbers only", () => {
  const c = historyChart(g, v);
  assert.equal((c.match(/<polyline/g) || []).length, 3);
  assert.ok(!c.includes("NaN") && !c.includes("undefined"), "no NaN or undefined points (a shadowed name once caused this)");
});

test("best moments: biggest battle, knock-outs, closest rival", () => {
  const h = highlights(g, v);
  assert.ok(h.includes("P1") && h.includes("<b>9</b>") && h.includes("Sun7"), "biggest battle is P1's 9 ships at Sun7");
  assert.ok(h.includes("Most knock-outs") && h.includes("2 players"));
  assert.ok(h.includes("Closest rival") && h.includes("<b>3</b>"), "P1 peaked at 3 suns");
});

test("names are escaped", () => {
  const h = highlights(g, { ...v, nameOf: () => "<img src=x>" });
  assert.ok(!h.includes("<img"));
});

test("dice line: your own average against a fair die", () => {
  const line = diceLine({ dice: [{ n: 200, sum: 720 }, { n: 5, sum: 20 }] }, 0);
  assert.ok(line.includes("200 rolled") && line.includes("3.60") && line.includes("3.50"));
  assert.equal(diceLine({ dice: [{ n: 200, sum: 720 }, { n: 5, sum: 20 }] }, 1), "", "too few rolls to say anything");
  assert.equal(diceLine({}, 0), "");
});
