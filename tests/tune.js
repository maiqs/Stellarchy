// Automatic play-style tuner: nudges the style weights in shared/bot.js toward equal win rates.
// Every candidate is scored on the same seeds (common random numbers) across worker threads.
// Usage: node tests/tune.js [iterations=24] [games=192]   -> writes tests/tune_result.json
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";

const PARAMS = { odds: [1.0, 2.6, .12], margin: [0, 5, 1], reserve: [0, .8, .06], cards: [0, 5, .4], continent: [0, 8, .6], elim: [0, 8, .6], claim: [1, 9, .6], hold: [0, 1.6, .12] };

if (!isMainThread) {
  const { prepareMap, mulberry32 } = await import("../shared/map.js");
  const { newGame, act } = await import("../shared/rules.js");
  const { playTurn, STYLES, STYLE_KEYS } = await import("../shared/bot.js");
  const { buildMap } = await import("../shared/mapgen.js");
  const MAP = prepareMap(buildMap(JSON.parse(readFileSync(new URL("../data/stars.json", import.meta.url))), 300));
  parentPort.on("message", ({ styles, seeds }) => {
    for (const k of STYLE_KEYS) Object.assign(STYLES[k], styles[k]);
    const wins = {}, seats = {};
    for (const gi of seeds) {
      const rng = mulberry32(9000 + gi), n = 4 + (gi % 9);
      const ss = Array.from({ length: n }, (_, i) => ({ id: "s" + i, name: "P" + i, style: STYLE_KEYS[(i + gi) % STYLE_KEYS.length], ai: true }));
      ss.forEach(s => seats[s.style] = (seats[s.style] || 0) + 1);
      const g = newGame(MAP, { mode: gi % 3 === 0 ? "dealt" : "legacy", targetPct: 100, seats: ss }, rng);
      while (g.status === "playing" && g.turnNo < 8000) playTurn(MAP, g, act, g.turn, g.seats[g.turn].style, rng);
      if (g.status === "over") { const st = g.seats[g.winner].style; wins[st] = (wins[st] || 0) + 1; }
    }
    parentPort.postMessage({ wins, seats });
  });
} else {
  const { STYLES, STYLE_KEYS } = await import("../shared/bot.js");
  const iters = +(process.argv[2] || 24), games = +(process.argv[3] || 192);
  const threads = Math.max(2, Math.min(24, availableParallelism() - 4));
  const workers = Array.from({ length: threads }, () => new Worker(new URL(import.meta.url)));
  const pick = s => Object.fromEntries(STYLE_KEYS.map(k => [k, Object.fromEntries(Object.keys(PARAMS).map(p => [p, s[k][p]]))]));
  async function score(styles) {
    const seeds = [...Array(games).keys()], chunks = workers.map((_, w) => seeds.filter(s => s % threads === w));
    const parts = await Promise.all(workers.map((w, i) => new Promise(r => { w.once("message", r); w.postMessage({ styles, seeds: chunks[i] }); })));
    const wins = {}, seats = {}; for (const p of parts) { for (const k in p.wins) wins[k] = (wins[k] || 0) + p.wins[k]; for (const k in p.seats) seats[k] = (seats[k] || 0) + p.seats[k]; }
    const totalSeats = Object.values(seats).reduce((a, b) => a + b, 0), fair = games / totalSeats;
    const rate = Object.fromEntries(STYLE_KEYS.map(k => [k, (wins[k] || 0) / seats[k]]));
    const err = STYLE_KEYS.reduce((a, k) => a + (rate[k] - fair) ** 2, 0);
    return { err, rate, fair };
  }
  if (!keepsIdentity(pick(STYLES))) { console.log("the current styles break the identity rules; fix shared/bot.js first"); process.exit(1); }
  const fmt = r => STYLE_KEYS.map(k => `${k} ${(100 * r.rate[k]).toFixed(1)}%`).join("  ") + `  (fair ${(100 * r.fair).toFixed(1)}%)`;
// each style must keep its character: aggressive attacks at the lowest odds, defensive holds the most,
// the card hunter values cards most, and territorial values claiming suns most
function keepsIdentity(s) {
  const others = k => Object.keys(s).filter(x => x !== k);
  return others("aggressive").every(k => s.aggressive.odds < s[k].odds)
    && others("defensive").every(k => s.defensive.hold >= s[k].hold && s.defensive.reserve >= s[k].reserve)
    && others("cards").every(k => s.cards.cards > s[k].cards)
    && others("territorial").every(k => s.territorial.claim >= s[k].claim);
}
  let best = pick(STYLES), bestR = await score(best);
  console.log(`start: ${fmt(bestR)}  err ${bestR.err.toFixed(5)}`);
  let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let it = 1; it <= iters; it++) {
    // nudge the style furthest from fair: weaken the strongest or strengthen the weakest, one weight at a time
    const ranked = STYLE_KEYS.slice().sort((a, b) => Math.abs(bestR.rate[b] - bestR.fair) - Math.abs(bestR.rate[a] - bestR.fair)), worst = ranked[rnd() < .6 ? 0 : 1];   // mostly the furthest, sometimes the next
    const cand = JSON.parse(JSON.stringify(best)), p = Object.keys(PARAMS)[Math.floor(rnd() * Object.keys(PARAMS).length)], [lo, hi, step] = PARAMS[p];
    const dir = rnd() < .5 ? -1 : 1;
    cand[worst][p] = Math.round(Math.max(lo, Math.min(hi, cand[worst][p] + dir * step * (1 + Math.floor(rnd() * 2)))) * 100) / 100;
    if (!keepsIdentity(cand)) { console.log(`${String(it).padStart(2)} ${worst}.${p} -> ${cand[worst][p]}: skipped (would change the style's character)`); continue; }
    const r = await score(cand);
    const ok = r.err < bestR.err;
    console.log(`${String(it).padStart(2)} ${worst}.${p} ${best[worst][p]} -> ${cand[worst][p]}: ${fmt(r)}  err ${r.err.toFixed(5)}${ok ? "  KEPT" : ""}`);
    if (ok) { best = cand; bestR = r; writeFileSync(new URL("./tune_result.json", import.meta.url), JSON.stringify({ styles: best, result: bestR }, null, 2)); }
  }
  console.log(`best: ${fmt(bestR)}`);
  writeFileSync(new URL("./tune_result.json", import.meta.url), JSON.stringify({ styles: best, result: bestR }, null, 2));
  workers.forEach(w => w.terminate());
}
