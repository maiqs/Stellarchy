// How much server work does one online game cost? (round 41, launch load)
// Plays all-AI rooms on a private dev server and reads the per-room counts (local server only):
// fetches, alarms (each AI move), incoming WebSocket messages and lobby reports.
// Usage: node tests/measure.mjs   (or .\run.ps1 measure)
import { startDevServer } from "./devserver.mjs";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = await startDevServer(8793, "measure");
try {
  for (const [seats, size, pub] of [[4, 100, true], [4, 100, false]]) {
    const runs = [];
    for (let k = 0; k < 3; k++) {
      const { code } = await (await fetch(server.base + "/api/rooms", { method: "POST", body: JSON.stringify({ allAI: true, maxSeats: seats, size, pace: "instant", public: pub, mode: "legacy", targetPct: 100 }) })).json();
      let s; for (let t = 0; t < 600; t++) { s = await (await fetch(`${server.base}/api/rooms/${code}`)).json(); if (s.status === "over") break; await sleep(500); }
      runs.push({ turns: s.turnNo, ...s.calls, over: s.status === "over" });
    }
    const avg = key => Math.round(runs.reduce((a, r) => a + (r[key] || 0), 0) / runs.length);
    console.log(`${seats} AI players, ${size} suns, ${pub ? "public" : "private"}: about ${avg("turns")} turns, ${avg("alarm")} alarms, ${avg("fetch")} fetches, ${avg("report")} lobby reports per game (${runs.filter(r => r.over).length}/${runs.length} finished)`);
  }
} finally { server.stop(); }
