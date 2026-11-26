import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { apparentMag, skyWindow } from "../client/cards.js";
import { buildMap } from "../shared/mapgen.js";
import { prepareMap } from "../shared/map.js";

const STARS = JSON.parse(readFileSync(new URL("../data/stars.json", import.meta.url)));
const byName = n => STARS.systems.find(s => s.name === n);

test("brightness from Earth matches the real night sky", () => {
  // published apparent magnitudes (the brightest star of each system)
  for (const [name, real] of [["Sirius", -1.46], ["Tau Ceti", 3.5], ["Vega", 0.03], ["Altair", 0.76], ["Procyon", 0.34]]) {
    const m = apparentMag(byName(name)); assert.ok(Math.abs(m - real) < .4, `${name}: ${m.toFixed(2)} vs ${real}`);
  }
  assert.ok(apparentMag(byName("Barnard's Star")) > 6, "Barnard's Star needs a telescope");
});

test("every card's sky window draws (no NaN), and Sol shows the Sun", () => {
  const m = prepareMap(buildMap(STARS, 300));
  for (let i = 0; i < m.n; i++) { const s = skyWindow(m, i); assert.ok(!s.includes("NaN") && s.includes("<svg"), m.systems[i].name); }
  assert.ok(skyWindow(m, 0).includes("Our Sun"));
});
