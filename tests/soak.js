// all-bot soak: many games, reports game length and wins by play style
import { readFileSync } from "node:fs";
import { prepareMap, mulberry32 } from "../shared/map.js";
import { newGame, act, invariants } from "../shared/rules.js";
import { playTurn, STYLE_KEYS, STYLES } from "../shared/bot.js";
// TUNE='{"defensive":{"odds":1.6}}' overrides style weights for a run (balance work)
if (process.env.TUNE) for (const [k, v] of Object.entries(JSON.parse(process.env.TUNE))) Object.assign(STYLES[k], v);
const MAP = prepareMap(JSON.parse(readFileSync(new URL("../data/star_map.json", import.meta.url))));
const games = +(process.argv[2] || 60), wins = {}, seatsOf = {}, turns = [];
for (let gi = 0; gi < games; gi++) {
  const rng = mulberry32(5000 + gi), k = 4 + (gi % 13);
  const seats = Array.from({ length: k }, (_, i) => ({ id: "s" + i, name: "P" + i, style: STYLE_KEYS[(i + gi) % STYLE_KEYS.length], ai: true }));
  seats.forEach(s => seatsOf[s.style] = (seatsOf[s.style] || 0) + 1);
  const g = newGame(MAP, { mode: "legacy", seats }, rng);
  while (g.status === "playing" && g.turnNo < 8000) { playTurn(MAP, g, act, g.turn, g.seats[g.turn].style, rng); }
  const e = invariants(MAP, g); if (e.length) throw new Error(e.join("; "));
  if (g.status !== "over") { console.log(`game ${gi} (${k} seats) hit the cap`); continue; }
  turns.push(g.turnNo); const st = g.seats[g.winner].style; wins[st] = (wins[st] || 0) + 1;
}
turns.sort((a, b) => a - b);
console.log(`games ${games}, finished ${turns.length}; turns median ${turns[turns.length >> 1]}, max ${turns[turns.length - 1]}`);
for (const s of STYLE_KEYS) console.log(`${s.padEnd(12)} wins ${String(wins[s] || 0).padStart(3)}  win rate per seat ${(100 * (wins[s] || 0) / seatsOf[s]).toFixed(1)}%  (fair share ${(100 * turns.length / Object.values(seatsOf).reduce((a, b) => a + b, 0)).toFixed(1)}%)`);
