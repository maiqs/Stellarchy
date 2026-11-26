import { test } from "node:test";
import assert from "node:assert/strict";
import { noteEvent, summarise, recapLine } from "../client/recap.js";

test("While you waited: suns lost and held, ships, and news", () => {
  const notes = [];
  for (const e of [
    { t: "bt", a: 1, d: 0, from: 5, to: 7, la: 1, ld: 2, cap: false },
    { t: "bt", a: 1, d: 0, from: 5, to: 7, la: 0, ld: 3, cap: true },   // sun 7 falls
    { t: "bt", a: 2, d: 0, from: 9, to: 8, la: 4, ld: 1, cap: false },  // sun 8 holds
    { t: "bt", a: 2, d: 1, from: 9, to: 3, la: 1, ld: 1, cap: true },   // not about me
    { t: "elim", seat: 3, by: 2 }, { t: "elim", seat: 4, by: 0 },       // my own knock-out is not news to me
    { t: "truceBroken", by: 2, with: 0 },
  ]) noteEvent(notes, e, 0);
  const owner = []; owner[7] = 1; owner[8] = 0;
  const r = summarise(notes, owner, 0);
  assert.deepEqual(r.lost.map(s => [s.sun, s.by, s.hits, s.lost]), [[7, 1, 2, 5]]);
  assert.deepEqual(r.held.map(s => [s.sun, s.by, s.killed]), [[8, 2, 4]]);
  assert.equal(r.shipsLost, 6); assert.equal(r.shipsKilled, 5); assert.equal(r.news.length, 2);
  assert.equal(recapLine(r), "While you waited: lost 1 sun · held 1");
  assert.equal(recapLine(summarise([], owner, 0)), "");
  // a sun lost and then won back by the time my turn starts counts as held
  owner[7] = 0; assert.equal(summarise(notes, owner, 0).lost.length, 0);
});
