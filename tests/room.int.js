// Room integration test against a running local server (.\run.ps1 dev, then: node tests/room.int.js)
// Two fake humans plus two bots play a fast game; one human drops mid-game, the AI covers, then they return.
import { readFileSync } from "node:fs";
import { prepareMap, mulberry32 } from "../shared/map.js";
import { botIntent } from "../shared/bot.js";

const BASE = process.env.BASE || "http://127.0.0.1:8787";
import { buildMap } from "../shared/mapgen.js";
const STARS = JSON.parse(readFileSync(new URL("../data/stars.json", import.meta.url)));
const MAP = prepareMap(buildMap(STARS, +(process.env.SIZE || 300)));
const MAP_FOG = () => prepareMap(buildMap(STARS, 100));   // the fog room plays on 100 suns
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
    if (m.t === "state") {
      if (m.board && m.game) {   // rebuild the board from full copies and diffs, as the page does
        if (m.board.full) c.board = { owner: m.board.owner.slice(), armies: m.board.armies.slice(), rev: m.rev, fulls: (c.board ? c.board.fulls : 0) + 1, diffs: c.board ? c.board.diffs : 0 };
        else if (c.board && m.board.base === c.board.rev) { for (const [i, o, a] of m.board.d) { c.board.owner[i] = o; c.board.armies[i] = a; } c.board.rev = m.rev; c.board.diffs++; }
        else { c.resyncs = (c.resyncs || 0) + 1; ws.send(JSON.stringify({ t: "resync" })); return; }
        m.game.owner = c.board.owner.slice(); m.game.armies = c.board.armies.slice();
      }
      c.state = m; c.states++;
    }
    if (m.t === "error") c.errors.push(m.error);
    if (m.t === "rematch") c.rematch = m.code;
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
    const it = botIntent(MAP, me.state.game, k, "balanced", rng);   // from that player's own view: only they can see their cards
    if (it) { const rev = st.rev; me.send({ t: "intent", intent: it }); await until(() => a.state.rev > rev, 3000); await sleep(70); continue; }   // paced like a person, under the rate limit
  }
  await sleep(40);
}
// hidden information stays hidden: no deck order, and other players' hands are counts only
{
  const g = a.state.game, mine = a.state.seats.findIndex(s => s.id === a.seat);
  check(g.deck === undefined && typeof g.deckCount === "number", "the deck's order is never sent");
  check(g.cards.every((h, k) => k === mine || h.every(x => x === -1)), "other players' hands are sent as counts only");
  check(a.board.diffs > 10 && a.board.fulls <= 3, `the board arrives as changes (${a.board.fulls} full, ${a.board.diffs} diffs, ${a.resyncs || 0} resyncs)`);
}
{ const g = a.state.game; console.log("  errors:", JSON.stringify([...new Set([...a.errors, ...bb.errors])]).slice(0, 300), "elapsed", Math.round((Date.now() - t0) / 1000) + "s", "| end:", g.status, "turn", g.turnNo, "seat", g.turn, g.phase, "advance", JSON.stringify(g.advance), "seats", JSON.stringify(a.state.seats.map(s => [s.name, s.ai, s.away, s.online]))); }
check(coveredByAI, "a dropped player's seat is played by the AI (after the grace period)");
check(a.state.status === "over", `game finished (turn ${a.state.game.turnNo}, ${a.state.game.status})`);
// rematch: same settings and AI players in a new room, and everyone in the old room hears about it
{
  a.send({ t: "rematch" }); await until(() => a.rematch && bb.rematch, 5000);
  const sum = a.rematch ? await (await fetch(BASE + `/api/rooms/${a.rematch}`)).json() : {};
  check(!!a.rematch && a.rematch === bb.rematch && a.rematch !== code, `a rematch room is set up and everyone is told (${a.rematch})`);
  check(sum.status === "lobby" && sum.seats === 2 && sum.maxSeats === 4 && sum.mode === "dealt", `it keeps the settings and the 2 AI players (${sum.seats} seats, ${sum.mode})`);
}
const sneaky = client(code, { name: "Late" }); await sneaky.ready; await until(() => sneaky.state);
check(sneaky.seat === null, "a late arrival watches instead of taking a seat");
for (const c of [a, bb, sneaky]) c.ws.close();
// quick play: straight into a running game against AI; a second player takes over an AI seat in the same room
{
  const q1 = await (await fetch(BASE + "/api/quick", { method: "POST" })).json();
  const p1 = client(q1.code, { name: "Quinn", main: "#22d3c5" }); await p1.ready; await until(() => p1.state && p1.state.game);
  // either a fresh room (you plus 3 AI, started at once) or a running quick room where you took over an AI seat
  const mine1 = p1.state.seats.find(s => s.id === p1.seat);
  check(p1.state.status === "playing" && mine1 && !mine1.ai && (q1.joined || p1.state.seats.filter(s => s.ai).length === 3), `quick play puts you straight into a running game (${q1.code}, ${q1.joined ? "took over an AI" : "new room"})`);
  const aiBefore = p1.state.seats.filter(s => s.ai).length, aiIds = new Set(p1.state.seats.filter(s => s.ai).map(s => s.id));
  await sleep(300);
  const q2 = await (await fetch(BASE + "/api/quick", { method: "POST" })).json();
  const rexName = "Rex" + Math.floor(Math.random() * 9000 + 1000);   // unique: earlier runs leave quick rooms (and Rexes) running
  const p2 = client(q2.code, { name: rexName }); await p2.ready; await until(() => p2.seat);
  // if the first game still has a live AI, the second player takes it over; if not, quick play starts a new game
  const liveAI = p1.state.seats.filter((s, j) => s.ai && p1.state.game.alive[j]).length;
  check(p2.seat !== null, `a second quick player always gets a seat (${q2.code === q1.code ? "same game" : "new game"}, ${liveAI} live AI were left in ${q1.code})`);
  if (q2.code === q1.code) {
    await until(() => p1.state.seats.some(s => s.name === rexName));
    const rex = p1.state.seats.find(s => s.name === rexName);
    check(rex && !rex.ai && p2.seat === rex.id && aiIds.has(rex.id), "they take over an AI seat, keeping its colour");
  } else check(liveAI === 0 || !q2.joined, "a new game only when the first had no live AI to take over");
  p1.ws.close(); p2.ws.close();
}
// fog of war: a player never receives enemy suns they could not see, but still gets everyone's totals
{
  const r = await (await fetch(BASE + "/api/rooms", { method: "POST", body: JSON.stringify({ maxSeats: 3, fog: true, mode: "dealt", size: 100 }) })).json();
  const f1 = client(r.code, { name: "Fay" }); await f1.ready; await until(() => f1.state);
  f1.send({ t: "addBot" }); f1.send({ t: "addBot" }); await until(() => f1.state.seats.length === 3);
  f1.send({ t: "start" }); await until(() => f1.state.game && f1.state.game.phase !== "setup");
  await sleep(1500);
  const g = f1.state.game, me = f1.state.seats.findIndex(s => s.id === f1.seat);
  const leaks = g.owner.filter((o, i) => o >= 0 && o !== me && !MAP_FOG(r).adj[i].some(j => g.owner[j] === me)).length;
  check(g.fog && g.owner.some(o => o === -2), "a fog room hides far suns");
  check(leaks === 0, `no enemy sun out of sight is sent (${leaks} leaked)`);
  check(Array.isArray(g.totals) && g.totals.reduce((a, t) => a + t.held, 0) === 100, "everyone's totals still arrive under fog");
  f1.ws.close();
}
// a full 16-seat room: 8 people and 8 AI players through a whole game, one person dropping out partway
{
  const r = await (await fetch(BASE + "/api/rooms", { method: "POST", body: JSON.stringify({ maxSeats: 16, size: 100, mode: "dealt", targetPct: 30, pace: "instant", cards: "fixed" }) })).json();
  const people = [];
  for (let k = 0; k < 8; k++) { const c = client(r.code, { name: "P" + k }); await c.ready; await until(() => c.seat); people.push(c); }
  const host = people[0]; for (let k = 0; k < 8; k++) { host.send({ t: "addBot" }); await sleep(80); }
  await until(() => host.state.seats.length === 16);
  host.send({ t: "start" }); await until(() => host.state.status === "playing");
  check(host.state.seats.length === 16 && new Set(host.state.seats.map(s => s.main)).size === 16, "16 seats, every one a different colour");
  const MAP100 = MAP_FOG(); let dropped = false; const t1 = Date.now();
  while (Date.now() - t1 < 320000 && host.state.status === "playing") {
    const g = host.state.game, k = g.turn, who = people.find(p => p.seat === host.state.seats[k].id && p.ws.readyState === 1);
    if (!dropped && g.turnNo > 30) { dropped = true; people[5].ws.close(); }
    if (who && !host.state.seats[k].away && who.state.game) {
      const it = botIntent(MAP100, who.state.game, k, "aggressive", rng);
      if (it) { const rev = host.state.rev; who.send({ t: "intent", intent: it }); await until(() => host.state.rev > rev, 3000); await sleep(70); continue; }
    }
    await sleep(40);
  }
  check(host.state.status === "over", `the 16-seat game finished (turn ${host.state.game.turnNo}, ${Math.round((Date.now() - t1) / 1000)} s)`);
  check(people.every(p => p.ws.readyState !== 1 || p.state.rev === host.state.rev), "every connected player ended on the same state");
  people.forEach(p => p.ws.close());
}
// a 32-seat room fills, starts, and gives everyone a distinct colour
{
  const r = await (await fetch(BASE + "/api/rooms", { method: "POST", body: JSON.stringify({ maxSeats: 32, size: 500, mode: "dealt", targetPct: 50 }) })).json();
  const h = client(r.code, { name: "Host32" }); await h.ready; await until(() => h.state);
  for (let k = 0; k < 31; k++) { h.send({ t: "addBot" }); await sleep(260); }   // under the rate limit (4 a second)
  await until(() => h.state.seats.length === 32, 12000);
  h.send({ t: "start" }); await until(() => h.state.status === "playing");
  check(h.state.status === "playing" && h.state.seats.length === 32 && new Set(h.state.seats.map(s => s.main)).size === 32, `a 32-seat room starts with 32 distinct colours (${h.state.seats.length} seats, ${h.state.status}, ${h.errors.slice(0, 2)})`);
  h.ws.close();
}
// launch protections: offensive names are replaced, and one visitor can't make rooms endlessly
{
  const nr = await (await fetch(BASE + "/api/rooms", { method: "POST", body: JSON.stringify({ maxSeats: 2 }) })).json();
  const bad = client(nr.code, { name: "sh1t lord" }); await bad.ready; await until(() => bad.state && bad.state.seats.length === 1);
  check(bad.state.seats.length === 1 && bad.state.seats[0].name === "Stellarch", `an offensive name is replaced before anyone sees it (${bad.state.seats[0] && bad.state.seats[0].name})`);
  bad.ws.close();
  const ip = "10.77." + Math.floor(Math.random() * 250) + "." + Math.floor(Math.random() * 250);
  const make = () => fetch(BASE + "/api/rooms", { method: "POST", headers: { "x-limit-test": "1", "CF-Connecting-IP": ip }, body: JSON.stringify({ maxSeats: 2 }) }).then(r => r.status);
  const statuses = []; for (let k = 0; k < 11; k++) statuses.push(await make());
  check(statuses.slice(0, 10).every(s => s === 200) && statuses[10] === 429, `the 11th room in 10 minutes from one visitor is refused (${statuses.join(",")})`);
}
// fair clocks: the turn's clock starts when the player's screen shows it, then a time bank, then the AI
{
  const { code: tc } = await (await fetch(BASE + "/api/rooms", { method: "POST", body: JSON.stringify({ maxSeats: 2, timer: 90, clockMs: 1500 }) })).json();
  const h = client(tc, { name: "Clocky" }); await h.ready; await until(() => h.state && h.seat);
  h.send({ t: "addBot" }); await until(() => h.state.seats.length === 2);
  h.send({ t: "start" }); await until(() => h.state.status === "playing" && h.state.game);
  // make it the human's turn: they go first or the bot finishes its turn
  await until(() => h.state.game.turn === h.state.seats.findIndex(x => x.id === h.seat) && h.state.deadline, 20000);
  const unseen = h.state.deadline - h.state.now;
  check(unseen > 9000 && !h.state.turnSeen, `before my screen confirms the turn, the clock allows for delivery (${unseen} ms)`);
  h.send({ t: "seen" }); await until(() => h.state.turnSeen);
  const seen = h.state.deadline - h.state.now;
  check(seen <= 1600, `once seen, the clock runs from now (${seen} ms)`);
  await until(() => h.state.onBank, 5000);
  check(h.state.onBank && h.state.seats.find(x => x.id === h.seat).bank === 0, "when time runs out, the time bank is spent first");
  await until(() => h.state.seats.find(x => x.id === h.seat).away, 5000);
  check(h.state.seats.find(x => x.id === h.seat).away, "after the bank, the AI covers the turn");
  h.ws.close();
}
// launch load (round 41): a public game tells the lobby only when the listing changes, not every few moves
{
  const { code: lc } = await (await fetch(BASE + "/api/rooms", { method: "POST", body: JSON.stringify({ allAI: true, maxSeats: 4, size: 100, pace: "instant", public: true }) })).json();
  let s; for (let k = 0; k < 240; k++) { s = await (await fetch(BASE + `/api/rooms/${lc}`)).json(); if (s.status === "over") break; await sleep(500); }
  check(s.status === "over" && s.calls && s.calls.report <= 15, `a public game of ${s.turnNo} turns and ${s.calls && s.calls.alarm} AI moves sent the lobby ${s.calls && s.calls.report} reports`);
}
// an idle room closes itself (needs DEV=1 in .dev.vars for the short idle time)
{
  const r = await fetch(BASE + "/api/rooms", { method: "POST", body: JSON.stringify({ maxSeats: 2, public: true, idleMs: 1500 }) });
  const { code: idle } = await r.json();
  const c = client(idle, { name: "Idle" }); await c.ready; await until(() => c.state);
  c.ws.close(); await sleep(3500);
  const after = await fetch(BASE + `/api/rooms/${idle}`);
  check(after.status === 404, `an empty room closes itself after its idle time (${idle}: ${after.status})`);
  const list = await (await fetch(BASE + "/api/rooms")).json();
  check(!list.rooms.some(x => x.code === idle), "a closed room leaves the lobby list");
}
console.log(failures ? `${failures} FAILED` : "all room checks passed");
process.exit(failures ? 1 : 0);
