// Room integration test against a running local server (.\run.ps1 dev, then: node tests/room.int.js)
// Two fake humans plus two bots play a fast game; one human drops mid-game, the AI covers, then they return.
import { readFileSync } from "node:fs";
import { prepareMap, mulberry32 } from "../shared/map.js";
import { botIntent } from "../shared/bot.js";

const BASE = process.env.BASE || "http://127.0.0.1:8787";
import { buildMap } from "../shared/mapgen.js";
const MAP = prepareMap(buildMap(JSON.parse(readFileSync(new URL("../data/stars.json", import.meta.url))), +(process.env.SIZE || 300)));
const rng = mulberry32(42);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) failures++; };

function client(code, hello) {
  const ws = new WebSocket(BASE.replace("http", "ws") + `/api/rooms/${code}/ws`);
  const c = { ws, state: null, seat: null, token: null, errors: [], states: 0 };
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.t === "welcome") { c.seat = m.seat; c.token = m.token; c.creator = m.creator; }
    if (m.t === "state") { c.state = m; c.states++; }
    if (m.t === "error") c.errors.push(m.error);
  };
  c.ready = new Promise(r => ws.onopen = () => { ws.send(JSON.stringify({ t: "hello", ...hello })); r(); });
  c.send = o => ws.send(JSON.stringify(o));
  return c;
}
const until = async (fn, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(30); } return false; };

const res = await fetch(BASE + "/api/rooms", { method: "POST", body: JSON.stringify({ maxSeats: 4, public: true, pace: "instant", mode: "dealt", targetPct: 40 }) });
const { code } = await res.json();
check(/^[A-Z2-9]{4}$/.test(code), `room created: ${code}`);

const a = client(code, { name: "Ana", main: "#ff4d5a", sub: "#ffffff", hull: "saucer", style: "aggressive" });
await a.ready; await until(() => a.state);
check(a.seat && a.creator, "first player gets a seat and is the creator");
const b = client(code, { name: "Bo<script>", main: "#ff4d5a", hull: "orb" });
await b.ready; await until(() => b.state && b.state.seats.length === 2);
check(b.state.seats[1].name === "Boscript", "names are cleaned");
check(b.state.seats[1].main !== "#ff4d5a", "a colour already taken is not given twice");
const lobby = await (await fetch(BASE + "/api/rooms")).json();
check(lobby.rooms.some(r => r.code === code), "public room shows in the lobby");

b.send({ t: "start" }); await until(() => b.errors.length);
check(b.errors.includes("only the room's creator can start, with 2 or more seats"), "only the creator can start");
a.send({ t: "addBot", style: "defensive" }); a.send({ t: "addBot" });
await until(() => a.state.seats.length === 4);
a.send({ t: "start" }); await until(() => a.state.status === "playing");
check(a.state.status === "playing", "game starts");

// humans play with the bot brain on their own turns; Bo drops out partway and comes back
let dropped = false, returned = false, coveredByAI = false, bb = b;
const players = () => [a, bb];
const t0 = Date.now();
while (Date.now() - t0 < 240000) {
  const st = a.state; if (st.status !== "playing") break;
  const g = st.game, k = g.turn, seatId = st.seats[k].id;
  if (!dropped && g.turnNo > 12) { dropped = true; bb.ws.close(); console.log("  ...Bo closes the tab"); }
  if (dropped && !returned && st.seats[1].away) coveredByAI = true;
  if (dropped && !returned && coveredByAI && g.turnNo > 30) {
    returned = true; bb = client(code, { token: b.token }); await bb.ready; await until(() => bb.state);
    check(bb.seat === b.seat, "Bo returns to the same seat with the token");
    await until(() => !a.state.seats[1].away, 3000);
    check(!a.state.seats[1].away, "the AI hands the seat back on return");
  }
  const me = players().find(p => p.seat === seatId && p.ws.readyState === 1);
  if (me && !st.seats[k].away) {
    const it = botIntent(MAP, g, k, "balanced", rng);
    if (it) { const rev = st.rev; me.send({ t: "intent", intent: it }); await until(() => a.state.rev > rev, 3000); continue; }
  }
  await sleep(40);
}
check(coveredByAI, "a dropped player's seat is played by the AI (after the grace period)");
check(a.state.status === "over", `game finished (turn ${a.state.game.turnNo}, ${a.state.game.status})`);
const sneaky = client(code, { name: "Late" }); await sneaky.ready; await until(() => sneaky.state);
check(sneaky.seat === null, "a late arrival watches instead of taking a seat");
for (const c of [a, bb, sneaky]) c.ws.close();
console.log(failures ? `${failures} FAILED` : "all room checks passed");
process.exit(failures ? 1 : 0);
