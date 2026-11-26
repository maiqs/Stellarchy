import { test } from "node:test";
import assert from "node:assert/strict";
import { readSetup, setupLink, SETUP_KEYS } from "../client/setup.js";

test("a setup link round-trips its settings", () => {
  const o = { size: 300, centre: "Barnard's Star", mode: "dealt", fog: true, flagships: false, cards: "fixed", bots: 7, aiLevel: "recruit" };
  const url = setupLink("https://example.test", "solo", o);
  assert.deepEqual(readSetup(new URL(url).searchParams), o);
});

test("a link cannot smuggle anything else in", () => {
  const p = new URLSearchParams({ size: "300; drop", centre: "<img src=x onerror=alert(1)>", fog: "yes", bots: "-3", evil: "1", __proto__: "x", mode: "a".repeat(60), pace: "fast" });
  const o = readSetup(p);
  assert.deepEqual(o, { pace: "fast" }, "only the one well-formed known key survives");
  assert.ok(Object.keys(o).every(k => k in SETUP_KEYS));
});

test("numbers, flags and words are typed", () => {
  const o = readSetup(new URLSearchParams({ size: "1000", fog: "false", centre: "61 Cygni" }));
  assert.equal(o.size, 1000); assert.equal(o.fog, false); assert.equal(o.centre, "61 Cygni");
});
