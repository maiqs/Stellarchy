// Stellarchy game screen: title, look editor, rooms (online or solo), and the in-game HUD.
// The server (or LocalRoom for solo play) owns the game; this page only shows it and sends intents.
import { prepareMap, specClass } from "./shared/map.js";
import { hqChoices, mustTrade, isSet, connected, cardKind, ownedBy, target, effPct, tradeValue } from "./shared/rules.js";
import { STYLES, STYLE_KEYS } from "./shared/bot.js";
import { createScene, HULLS, fleetOf, CLASSES } from "./scene.js";
import { LocalRoom } from "./local.js";
import { CARD_NAMES, CARD_COLOR, STAR_FACTS, SUN_WORDS, surfaceTemp, disp, lightText } from "./cards.js";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const HEX = /^#[0-9a-fA-F]{6}$/;
const PALETTE = ["#ff4d5a", "#3e9bff", "#f5d90a", "#3fcf6a", "#b06bff", "#ff8a2a", "#22d3c5", "#ff6fb5", "#9dff3a", "#ffffff", "#5b6bff", "#ff3df2", "#00e5ff", "#ffb3a7", "#c9a227", "#7cffc4"];
const SUBS = ["#ffffff", "#0b0f18", "#ffe066", "#ff4d5a", "#3e9bff", "#3fcf6a", "#b06bff", "#ff8a2a"];
const store = { get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

// ---------- boot ----------
const MAP = prepareMap(await (await fetch("data/star_map.json")).json());
const S = MAP.systems;
const scene = createScene({ container: $("stage"), labels: $("labels"), map: MAP });
scene.setAutoRotate(true);

// ---------- your look (kept in this browser; no account) ----------
let me = store.get("stellarchy_profile", null);
if (!me || !HEX.test(me.main)) { const k = Math.floor(Math.random() * PALETTE.length); me = { name: "", main: PALETTE[k], sub: "#ffffff", hull: HULLS[k % 5].key, style: "balanced" }; }
const saveMe = () => { store.set("stellarchy_profile", me); renderYou(); document.documentElement.style.setProperty("--me", me.main); };
saveMe();
function renderYou() {
  const h = HULLS.find(x => x.key === me.hull) || HULLS[0], st = STYLES[me.style] || STYLES.balanced;
  $("youCard").innerHTML = `<span class="swatch" style="--sw-main:${me.main};--sw-sub:${me.sub}"></span><span class="who"><b>${esc(me.name || "Name your Stellarch")}</b><span>${h.glyph} ${h.name} ships · ${esc(st.name)} style</span></span><span class="edit">Edit</span>`;
}
$("youCard").addEventListener("click", () => lookDialog());
$("youCard").setAttribute("role", "button"); $("youCard").tabIndex = 0;
$("youCard").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); lookDialog(); } });

const dlg = $("dlg");
function openDialog(html, wire) { dlg.innerHTML = html; wire && wire(dlg); if (!dlg.open) dlg.showModal(); }
dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });

function lookDialog(after) {
  const d = { ...me };
  const draw = () => openDialog(`<form class="dlg" method="dialog">
    <h2>Your Stellarch</h2>
    <div class="preview"><span class="swatch" style="--sw-main:${d.main};--sw-sub:${d.sub}"></span><div><b>${esc(d.name || "Stellarch")}</b><div class="hint">${HULLS.find(h => h.key === d.hull).name} ships · ${esc(STYLES[d.style].name)}</div></div></div>
    <label class="field"><span>Name</span><input id="lName" maxlength="24" value="${esc(d.name)}" placeholder="Stellarch of Sol" autocomplete="nickname"></label>
    <div class="field"><span>Main colour</span><div class="palette">${PALETTE.map(c => `<button type="button" data-main="${c}" style="--c:${c}" aria-label="${c}" aria-pressed="${c === d.main}"></button>`).join("")}</div></div>
    <div class="field"><span>Highlight colour</span><div class="palette">${SUBS.map(c => `<button type="button" data-sub="${c}" style="--c:${c}" aria-label="${c}" aria-pressed="${c === d.sub}"></button>`).join("")}</div></div>
    <div class="field"><span>Ships</span><div class="seg hulls">${HULLS.map(h => `<button type="button" data-hull="${h.key}" aria-pressed="${h.key === d.hull}" title="${h.name}">${h.glyph}</button>`).join("")}</div></div>
    <div class="field"><span>Play style</span><div class="seg">${STYLE_KEYS.map(k => `<button type="button" data-style="${k}" aria-pressed="${k === d.style}">${esc(STYLES[k].name)}</button>`).join("")}</div><p class="hint">${esc(STYLES[d.style].blurb)} The AI plays this way for you if you step away.</p></div>
    <div class="row end"><button class="btn ghost" value="cancel">Cancel</button><button class="btn go" id="lSave" value="ok">Save</button></div></form>`, el => {
      el.querySelector("#lName").addEventListener("input", e => d.name = e.target.value);
      el.querySelectorAll("[data-main]").forEach(b => b.onclick = () => { d.main = b.dataset.main; draw(); });
      el.querySelectorAll("[data-sub]").forEach(b => b.onclick = () => { d.sub = b.dataset.sub; draw(); });
      el.querySelectorAll("[data-hull]").forEach(b => b.onclick = () => { d.hull = b.dataset.hull; draw(); });
      el.querySelectorAll("[data-style]").forEach(b => b.onclick = () => { d.style = b.dataset.style; draw(); });
      el.querySelector("#lSave").onclick = () => { Object.assign(me, d, { name: d.name.replace(/\s+/g, " ").trim().slice(0, 24) }); saveMe(); if (room && room.send) room.send({ t: "look", ...me }); if (after) setTimeout(after, 30); };
    });
  draw();
}

// ---------- rooms ----------
let room = null, st = null, mySeat = null, isCreator = false;
const ui = { sel: -1, pending: {}, cards: new Set(), fort: null, adv: null, panel: wideScreen() ? "players" : null, lastTurnKey: "", lastRev: -1 };
function wideScreen() { return innerWidth > 1000; }

function startRoom(r) {
  room = r; st = null; mySeat = null; ui.sel = -1; ui.pending = {}; ui.cards.clear(); ui.fort = null; ui.lastRev = -1;
  r.on(m => {
    if (m.t === "welcome") { mySeat = m.seat; isCreator = !!m.creator; if (m.token && st && st.code) store.set("stellarchy_tok_" + st.code, m.token); }
    else if (m.t === "state") onState(m);
    else if (m.t === "error") toast(m.error, "err");
    else if (m.t === "emote") { const s = st && st.seats.find(x => x.id === m.seat); if (s) toast(`${s.name}: ${m.e}`); }
    else if (m.t === "closed") toast("Connection lost. Reconnecting…", "err");
  });
  $("title").hidden = true; $("hud").hidden = false; scene.setAutoRotate(false);
}
function leaveRoom() {
  if (room) room.close(); room = null; st = null; mySeat = null;
  history.replaceState(null, "", "/"); $("hud").hidden = true; $("title").hidden = false; dlg.open && dlg.close();
  scene.clearBoard(); scene.setMarks(new Map()); scene.select(-1); scene.setAutoRotate(true); scene.home();
}

// online room over a WebSocket, reconnecting with the seat token
class NetRoom {
  constructor(code) { this.code = code; this.fns = []; this.closed = false; this.tries = 0; this.connect(); }
  connect() {
    const ws = this.ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + `/api/rooms/${this.code}/ws`);
    ws.onopen = () => { this.tries = 0; ws.send(JSON.stringify({ t: "hello", token: store.get("stellarchy_tok_" + this.code, null), ...me })); };
    ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (m.t === "welcome" && m.token) store.set("stellarchy_tok_" + this.code, m.token); this.fns.forEach(f => f(m)); };
    ws.onclose = () => { if (this.closed) return; this.fns.forEach(f => f({ t: "closed" })); setTimeout(() => !this.closed && this.connect(), Math.min(8000, 500 * 2 ** this.tries++)); };
  }
  on(f) { this.fns.push(f); }
  send(m) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  close() { this.closed = true; try { this.ws.close(); } catch (e) {} }
}
async function joinCode(code) {
  code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z2-9]{4}$/.test(code)) return toast("Room codes are 4 letters or numbers.", "err");
  const r = await fetch(`/api/rooms/${code}`).catch(() => null);
  if (!r || !r.ok) return toast(r ? `No room ${code}.` : "The game server can't be reached. Try Play vs AI.", "err");
  history.replaceState(null, "", "/r/" + code);
  startRoom(new NetRoom(code));
}

// ---------- title menu ----------
const needName = then => { if (me.name) return then(); lookDialog(then); };
$("mSolo").onclick = () => needName(soloDialog);
$("mWatch").onclick = () => startRoom(new LocalRoom(MAP, { bots: 7, watch: true, mode: "legacy", pace: "fast" }, me));
$("mCreate").onclick = () => needName(createDialog);
$("mJoin").onsubmit = e => { e.preventDefault(); needName(() => joinCode($("joinCode").value)); };
$("mRooms").onclick = roomsDialog;
$("mCredits").onclick = e => { e.preventDefault(); creditsDialog(); };

function optionSeg(name, opts, cur) { return `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${String(v) === String(cur)}">${esc(l)}</button>`).join("")}</div>`; }
function wireSegs(el, state, redraw) { el.querySelectorAll("[data-seg]").forEach(seg => seg.querySelectorAll("button").forEach(b => b.onclick = () => { const v = b.dataset.v; state[seg.dataset.seg] = isNaN(+v) ? v : +v; redraw(); })); }

function soloDialog() {
  const o = store.get("stellarchy_solo", { bots: 5, mode: "legacy", targetPct: 100, pace: "normal" });
  const draw = () => openDialog(`<form class="dlg" method="dialog"><h2>Play vs AI</h2>
    <div class="field"><span>Opponents</span>${optionSeg("bots", [[1, "1"], [2, "2"], [3, "3"], [5, "5"], [7, "7"], [11, "11"], [15, "15"]], o.bots)}</div>
    <div class="field"><span>Start</span>${optionSeg("mode", [["legacy", "One home sun each"], ["dealt", "Suns dealt out"]], o.mode)}
      <p class="hint">${o.mode === "legacy" ? "Everyone founds a single home sun and expands outward." : "Every sun is shared out at random from the start."}</p></div>
    <div class="field"><span>Win at</span>${optionSeg("targetPct", [[50, "50%"], [65, "65%"], [80, "80%"], [100, "Total conquest"]], o.targetPct)}</div>
    <div class="field"><span>AI speed</span>${optionSeg("pace", [["slow", "Slow"], ["normal", "Normal"], ["fast", "Fast"], ["instant", "Instant"]], o.pace)}</div>
    <div class="row end"><button class="btn ghost" value="cancel">Cancel</button><button class="btn go big" id="sGo" value="ok">Launch</button></div></form>`, el => {
      wireSegs(el, o, draw);
      el.querySelector("#sGo").onclick = () => { store.set("stellarchy_solo", o); startRoom(new LocalRoom(MAP, o, me)); };
    });
  draw();
}
function createDialog() {
  const o = store.get("stellarchy_create", { maxSeats: 6, mode: "legacy", targetPct: 100, timer: 0, public: true, pace: "normal" });
  const draw = () => openDialog(`<form class="dlg" method="dialog"><h2>Create a room</h2>
    <div class="field"><span>Seats</span>${optionSeg("maxSeats", [[2, "2"], [3, "3"], [4, "4"], [6, "6"], [8, "8"], [12, "12"], [16, "16"]], o.maxSeats)}<p class="hint">Empty seats can be filled with AI players before you start.</p></div>
    <div class="field"><span>Who can find it</span>${optionSeg("public", [["true", "Listed in open rooms"], ["false", "Link only"]], String(o.public))}</div>
    <div class="field"><span>Turn timer</span>${optionSeg("timer", [[0, "None"], [90, "90 s"], [180, "3 min"], [43200, "12 h"], [86400, "24 h"]], o.timer)}<p class="hint">When time runs out, the AI plays that turn in the player's style. They take over again as soon as they act.</p></div>
    <div class="field"><span>Start</span>${optionSeg("mode", [["legacy", "One home sun each"], ["dealt", "Suns dealt out"]], o.mode)}</div>
    <div class="field"><span>Win at</span>${optionSeg("targetPct", [[50, "50%"], [65, "65%"], [80, "80%"], [100, "Total conquest"]], o.targetPct)}</div>
    <div class="row end"><button class="btn ghost" value="cancel">Cancel</button><button class="btn go big" id="cGo" value="ok">Create</button></div></form>`, el => {
      wireSegs(el, o, draw);
      el.querySelector("#cGo").onclick = async () => {
        o.public = o.public === true || o.public === "true"; store.set("stellarchy_create", o);
        const r = await fetch("/api/rooms", { method: "POST", body: JSON.stringify(o) }).catch(() => null);
        if (!r || !r.ok) return toast("The game server can't be reached. Try Play vs AI.", "err");
        const { code } = await r.json(); history.replaceState(null, "", "/r/" + code); startRoom(new NetRoom(code));
      };
    });
  draw();
}
async function roomsDialog() {
  openDialog(`<div class="dlg"><h2>Open rooms</h2><div class="rooms" id="rlist"><p class="hint">Looking…</p></div><div class="row end"><button class="btn ghost" id="rClose" type="button">Close</button></div></div>`, el => el.querySelector("#rClose").onclick = () => dlg.close());
  const r = await fetch("/api/rooms").catch(() => null), list = $("rlist");
  if (!r || !r.ok) { list.innerHTML = `<p class="hint">The game server can't be reached right now. Play vs AI works offline.</p>`; return; }
  const { rooms } = await r.json();
  if (!rooms.length) { list.innerHTML = `<p class="hint">No open rooms right now. Create one and share the link.</p>`; return; }
  list.innerHTML = rooms.map(x => `<div class="roomrow"><b>${esc(x.code)}</b><div class="grow"><div>${x.status === "lobby" ? `${x.seats}/${x.maxSeats} seats` : x.status === "playing" ? `In progress · turn ${x.turnNo}` : "Finished"}</div><div class="mini">${esc(x.names.join(", "))}</div></div><button class="btn small ${x.status === "lobby" ? "go" : ""}" data-code="${esc(x.code)}">${x.status === "lobby" ? "Join" : "Watch"}</button></div>`).join("");
  list.querySelectorAll("[data-code]").forEach(b => b.onclick = () => { dlg.close(); needName(() => joinCode(b.dataset.code)); });
}
function creditsDialog() {
  openDialog(`<div class="dlg"><h2>Credits</h2>
    <p class="hint">Star positions: <a href="https://github.com/astronexus/HYG-Database" target="_blank" rel="noopener">HYG Database v4.1</a> by David Nash (astronexus), licensed CC BY-SA 4.0. The map data stays shareable under that licence.</p>
    <p class="hint">3D: <a href="https://threejs.org" target="_blank" rel="noopener">three.js</a> (MIT). Fonts: Chakra Petch and IBM Plex (SIL Open Font License).</p>
    <p class="hint">Stellarchy is free. No account, no tokens, no limits on play.</p>
    <div class="row end"><button class="btn" id="crClose" type="button">Close</button></div></div>`, el => el.querySelector("#crClose").onclick = () => dlg.close());
}

// ---------- HUD helpers ----------
const seatIx = () => st && st.game ? st.seats.findIndex(s => s.id === mySeat) : -1;
const lookOf = k => { const s = st && st.seats[k]; return s ? { main: s.main, sub: s.sub, hull: s.hull } : { main: "#cccccc", sub: "#ffffff", hull: "triangle" }; };
const nameOf = k => k < 0 ? "Unclaimed" : (st.seats[k] && st.seats[k].name) || "Player";
const myTurn = () => st && st.game && st.status === "playing" && st.game.turn === seatIx() && seatIx() >= 0;

function toast(text, kind) {
  const t = document.createElement("div"); t.className = "toast" + (kind === "err" ? " err" : ""); t.textContent = text;
  if (kind === "err") t.style.borderColor = "var(--red)";
  $("toasts").appendChild(t); while ($("toasts").children.length > 3) $("toasts").firstChild.remove();
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 400); }, kind === "err" ? 3200 : 2600);
}
function send(intent) { room && room.send({ t: "intent", intent }); }

// ---------- state from the room ----------
function onState(m) {
  const prev = st; st = m;
  if (m.code && !prev) { $("hCode").hidden = false; $("hCode").textContent = m.code; }
  const g = m.game, k = seatIx();
  if (g) {
    scene.setBoard(g, lookOf, m.rev !== ui.lastRev ? m.events : []);
    // a new turn or phase clears selections
    const key = `${g.turnNo}:${g.phase}:${!!g.advance}`;
    if (key !== ui.lastTurnKey) { ui.lastTurnKey = key; if (!g.advance) ui.adv = null; ui.fort = null; if (g.phase !== "reinforce") ui.pending = {}; if (g.phase !== "attack" && g.phase !== "fortify") selectSun(-1); }
    if (g.advance) ui.adv = ui.adv && ui.adv.to === g.advance.to ? ui.adv : { to: g.advance.to, n: g.advance.max };
    for (const e of (m.rev !== ui.lastRev ? m.events : [])) eventToast(e, k);
    if (prev && prev.game && prev.game.turn !== g.turn && g.turn === k && g.status === "playing") { toast("Your turn"); if (document.hidden) notifyTurn(); }
  }
  ui.lastRev = m.rev;
  render();
}
function eventToast(e, k) {
  if (e.t === "bt" && (e.a === k || e.d === k)) {
    const mine = e.a === k, where = disp(S[e.to]);
    toast(e.cap ? (mine ? `Captured ${where}! Lost ${e.la}, destroyed ${e.ld}.` : `${nameOf(e.a)} took ${where} from you.`) : `${mine ? "Attack on" : "Defended"} ${where}: lost ${mine ? e.la : e.ld}, destroyed ${mine ? e.ld : e.la}.`);
  }
  if (e.t === "elim") toast(e.seat === k ? "You have been wiped out." : `${nameOf(e.seat)} was wiped out by ${nameOf(e.by)}.`);
  if (e.t === "hq" && e.seat === k) { scene.focus(e.s, 34); toast(`${disp(S[e.s])} is your home sun.`); }
  if (e.t === "card" && e.seat === k) toast("You earned a card.");
  if (e.t === "trade" && e.seat === k) toast(`Traded a set for ${e.val} ships.`);
  if (e.t === "win") setTimeout(winDialog, 1400);
}
let notifyAsked = false;
function notifyTurn() {
  document.title = "▶ Your turn · Stellarchy";
  if ("Notification" in window && Notification.permission === "granted") try { new Notification("Stellarchy", { body: "It's your turn.", icon: "icon.svg" }); } catch (e) {}
}
addEventListener("focus", () => document.title = "Stellarchy");

// ---------- picking suns ----------
function selectSun(i) { ui.sel = i; scene.select(i); renderSunCard(); }
scene.onPick(i => {
  if (!st || !st.game) { if (i >= 0) { selectSun(i); scene.focus(i); } return; }
  const g = st.game, k = seatIx();
  if (i < 0) { if (g.phase !== "reinforce") selectSun(-1); render(); return; }
  if (!myTurn() || g.advance) { selectSun(i); render(); return; }
  if (g.phase === "setup") { if (hqChoices(MAP, g).includes(i)) send({ t: "hq", sys: i }); else { selectSun(i); toast("Pick one of the pulsing suns: they're far enough from other home suns."); } return; }
  if (g.phase === "reinforce") {
    if (mustTrade(g, k)) { openCards(); return; }
    if (g.owner[i] !== k) { selectSun(i); render(); return; }
    const left = g.reinforcements - placed(); if (left > 0) ui.pending[i] = (ui.pending[i] || 0) + 1;
    selectSun(i); render(); return;
  }
  if (g.phase === "attack") {
    if (g.owner[i] === k && g.armies[i] >= 2) { selectSun(i); render(); return; }
    if (ui.sel >= 0 && g.owner[ui.sel] === k && g.owner[i] !== k && MAP.adj[ui.sel].includes(i)) { send({ t: "attack", from: ui.sel, to: i, blitz: true }); return; }
    selectSun(i); render(); return;
  }
  if (g.phase === "fortify" && !g.fortified) {
    if (ui.fort && ui.fort.from >= 0 && i !== ui.fort.from && g.owner[i] === k && connected(MAP, g, ui.fort.from, i, k)) { ui.fort = { from: ui.fort.from, to: i, n: g.armies[ui.fort.from] - 1 }; selectSun(i); render(); return; }
    if (g.owner[i] === k && g.armies[i] >= 2) { ui.fort = { from: i, to: -1 }; selectSun(i); render(); return; }
    selectSun(i); render();
  }
});
const placed = () => Object.values(ui.pending).reduce((a, b) => a + b, 0);

// ---------- render ----------
function render() {
  if (!st) return;
  renderMarks(); renderBar(); renderPlayers(); renderSunCard(); renderBadge(); if (ui.panel === "log") renderLog();
}
function renderMarks() {
  const m = new Map(), g = st.game; if (!g) { scene.setMarks(m); return; }
  const k = seatIx(), mine = myTurn();
  if (g.phase === "setup" && mine) for (const i of hqChoices(MAP, g)) m.set(i, { color: "#f4e3b5", text: "+" });
  if (mine && g.phase === "reinforce") for (const i in ui.pending) m.set(+i, { color: lookOf(k).main, strong: true, text: `${g.armies[i]}+${ui.pending[i]}` });
  if (mine && g.phase === "attack" && !g.advance) {
    if (ui.sel >= 0 && g.owner[ui.sel] === k && g.armies[ui.sel] >= 2) { m.set(ui.sel, { color: lookOf(k).main, strong: true }); for (const j of MAP.adj[ui.sel]) if (g.owner[j] !== k) m.set(j, { color: g.owner[j] < 0 ? "#ffffff" : "#ff4d5a" }); }
    else for (let i = 0; i < MAP.n; i++) if (g.owner[i] === k && g.armies[i] >= 2 && MAP.adj[i].some(j => g.owner[j] !== k)) m.set(i, { color: lookOf(k).main });
  }
  if (g.advance && mine) { m.set(g.advance.from, { color: lookOf(k).main, strong: true }); m.set(g.advance.to, { color: lookOf(k).main }); }
  if (mine && g.phase === "fortify" && !g.fortified && ui.fort && ui.fort.from >= 0) {
    m.set(ui.fort.from, { color: lookOf(k).main, strong: true });
    if (ui.fort.to >= 0) m.set(ui.fort.to, { color: "#3e9bff", strong: true });
    else for (let i = 0; i < MAP.n; i++) if (i !== ui.fort.from && g.owner[i] === k && connected(MAP, g, ui.fort.from, i, k)) m.set(i, { color: "#3e9bff" });
  }
  scene.setMarks(m);
}

const PHASES = [["reinforce", "Reinforce"], ["attack", "Attack"], ["fortify", "Fortify"]];
function renderBar() {
  const bar = $("bar"), g = st.game, k = seatIx();
  bar.classList.toggle("mine", !!myTurn());
  if (!g) {   // the room's lobby
    const seats = st.seats.length, max = st.opts.maxSeats;
    bar.innerHTML = `<p class="eyebrow">Room</p><div class="big" style="letter-spacing:.35em;color:var(--gold)">${esc(st.code)}</div>
      <div class="what">${seats} of ${max} seats taken. ${isCreator ? "Share the link, fill empty seats with AI players, then start." : "Waiting for the room's creator to start."}</div>
      <div class="row"><button class="btn" id="bShare" type="button">Copy invite link</button>${isCreator ? `<button class="btn" id="bBot" type="button" ${seats >= max ? "disabled" : ""}>Add AI player</button><button class="btn go" id="bStart" type="button" ${seats < 2 ? "disabled" : ""}>Start</button>` : ""}</div>`;
    $("bShare").onclick = share; if (isCreator) { $("bBot").onclick = () => room.send({ t: "addBot" }); $("bStart").onclick = () => room.send({ t: "start" }); }
    return;
  }
  const turnSeat = st.seats[g.turn], phaseRow = `<div class="phases">${PHASES.map(([p, l]) => `<i class="${g.phase === p ? "on" : ""}">${l}</i>`).join("")}</div>`;
  if (st.status === "over" || g.status === "over") {
    bar.innerHTML = `<div class="big" style="color:${esc(lookOf(g.winner).main)}">${esc(nameOf(g.winner))} rules the stars</div><div class="row"><button class="btn go" id="bAgain" type="button">${st.local ? "Play again" : "Back to menu"}</button><button class="btn" id="bWin" type="button">Results</button></div>`;
    $("bAgain").onclick = () => { const local = st.local; leaveRoom(); if (local) $("mSolo").click(); }; $("bWin").onclick = winDialog; return;
  }
  if (!myTurn()) {
    const k2 = g.turn, away = turnSeat.away, me2 = k >= 0 ? st.seats[k] : null;
    const doing = g.phase === "setup" ? "choosing a home sun" : g.phase === "reinforce" ? "reinforcing" : g.phase === "attack" ? "attacking" : "fortifying";
    bar.innerHTML = `${phaseRow}<div class="big" style="color:${esc(lookOf(k2).main)}">${k < 0 ? "" : "Wait your turn · "}${esc(nameOf(k2))}</div>
      <div class="what">${esc(nameOf(k2))} is ${doing}${turnSeat.ai ? " (AI)" : away ? " (AI is playing for them)" : ""}.${timerText(g)}</div>
      ${me2 && me2.away ? `<div class="row"><button class="btn go" id="bBack" type="button">Take my seat back</button></div>` : ""}${paceRow()}`;
    if (me2 && me2.away) $("bBack").onclick = () => room.send({ t: "away", on: false });
    wirePace(); return;
  }
  // ---- my turn ----
  const awayBtn = st.local ? "" : `<button class="btn ghost small" id="bAway" type="button">Let AI play for me</button>`;
  if (g.advance) {
    const a = g.advance, n = Math.min(ui.adv ? ui.adv.n : a.max, a.max);
    bar.innerHTML = `<div class="big">Move in</div><div class="what">How many ships follow into <b>${esc(disp(S[a.to]))}</b>? ${a.max} can go; at least 1 stays behind.</div>
      <div class="stepper"><button class="btn" id="aMinus" type="button">−</button><input type="range" id="aRange" min="0" max="${a.max}" value="${n}" aria-label="Ships to move"><button class="btn" id="aPlus" type="button">+</button></div>
      <div class="row"><button class="btn small" data-q="0" type="button">None</button><button class="btn small" data-q="half" type="button">Half</button><button class="btn small" data-q="all" type="button">All</button><button class="btn go" id="aGo" type="button">Move <output id="aOut">${n}</output></button></div>`;
    const set = v => { ui.adv.n = Math.max(0, Math.min(a.max, v)); $("aRange").value = ui.adv.n; $("aOut").textContent = ui.adv.n; };
    $("aRange").oninput = e => set(+e.target.value); $("aMinus").onclick = () => set(ui.adv.n - 1); $("aPlus").onclick = () => set(ui.adv.n + 1);
    bar.querySelectorAll("[data-q]").forEach(b => b.onclick = () => set(b.dataset.q === "all" ? a.max : b.dataset.q === "half" ? Math.ceil(a.max / 2) : 0));
    $("aGo").onclick = () => send({ t: "advance", n: ui.adv.n }); return;
  }
  if (g.phase === "setup") {
    bar.innerHTML = `<div class="big">Your turn</div><div class="what">Choose your <b>home sun</b>. Tap one of the pulsing <b>+</b> suns. Home suns give 2 extra ships a turn while you hold them.</div>
      <div class="row"><button class="btn" id="bRand" type="button">Pick for me</button></div>${timerText(g, true)}`;
    $("bRand").onclick = () => { const ch = hqChoices(MAP, g); send({ t: "hq", sys: ch[Math.floor(Math.random() * ch.length)] }); }; return;
  }
  if (g.phase === "reinforce") {
    const left = g.reinforcements - placed(), hand = g.cards[k] || [], force = mustTrade(g, k);
    bar.innerHTML = `${phaseRow}<div class="big">${force ? "Trade cards" : left > 0 ? `Place ${left} ship${left === 1 ? "" : "s"}` : "Ready"}</div>
      <div class="what">${force ? "You hold 5 cards: trade a set first." : left > 0 ? "Tap your suns to add ships. Borders next to enemies need them most." : "All ships placed. Confirm to start attacking."}</div>
      <div class="row">${hand.length >= 3 ? `<button class="btn" id="bCards" type="button">Cards (${hand.length})</button>` : ""}
        <button class="btn" id="bUndo" type="button" ${placed() ? "" : "disabled"}>Undo</button>
        ${ui.sel >= 0 && g.owner[ui.sel] === k && left > 0 ? `<button class="btn" id="bAllHere" type="button">All ${left} here</button>` : ""}
        <button class="btn go" id="bPlace" type="button" ${left === 0 && !force ? "" : "disabled"}>Confirm</button>${awayBtn}</div>${timerText(g, true)}`;
    if ($("bCards")) $("bCards").onclick = openCards;
    $("bUndo").onclick = () => { const keys = Object.keys(ui.pending); const last = ui.sel >= 0 && ui.pending[ui.sel] ? ui.sel : keys[keys.length - 1]; if (last !== undefined) { ui.pending[last]--; if (!ui.pending[last]) delete ui.pending[last]; } render(); };
    if ($("bAllHere")) $("bAllHere").onclick = () => { ui.pending[ui.sel] = (ui.pending[ui.sel] || 0) + left; render(); };
    $("bPlace").onclick = () => { send({ t: "place", placement: { ...ui.pending } }); ui.pending = {}; };
    wireAway(); return;
  }
  if (g.phase === "attack") {
    const from = ui.sel >= 0 && g.owner[ui.sel] === k && g.armies[ui.sel] >= 2 ? ui.sel : -1;
    const roll = g.lastRoll && g.lastRoll.from !== undefined ? `<div class="dice">${g.lastRoll.a.map(x => `<span class="die a">${x}</span>`).join("")}<span style="opacity:.5">vs</span>${g.lastRoll.d.map(x => `<span class="die d">${x}</span>`).join("")}</div>` : "";
    bar.innerHTML = `${phaseRow}<div class="big">Attack</div><div class="what">${from >= 0 ? `From <b>${esc(disp(S[from]))}</b> (${g.armies[from]} ships): tap a <span style="color:#ff6b75">red</span> enemy or <b>white</b> empty sun.` : "Tap one of your glowing suns with 2+ ships, then a target next to it. Empty suns are taken without a fight."}</div>
      ${roll}<div class="row"><button class="btn go" id="bEndAtk" type="button">Done attacking</button>${awayBtn}</div>${timerText(g, true)}`;
    $("bEndAtk").onclick = () => send({ t: "endAttack" }); wireAway(); return;
  }
  if (g.phase === "fortify") {
    const f = ui.fort;
    if (f && f.to >= 0 && !g.fortified) {
      const max = g.armies[f.from] - 1; f.n = Math.min(f.n || max, max);
      bar.innerHTML = `${phaseRow}<div class="big">Fortify</div><div class="what">Move ships from <b>${esc(disp(S[f.from]))}</b> to <b>${esc(disp(S[f.to]))}</b>. One move per turn.</div>
        <div class="stepper"><button class="btn" id="fMinus" type="button">−</button><input type="range" id="fRange" min="1" max="${max}" value="${f.n}" aria-label="Ships to move"><button class="btn" id="fPlus" type="button">+</button></div>
        <div class="row"><button class="btn" id="fCancel" type="button">Cancel</button><button class="btn go" id="fGo" type="button">Move <output id="fOut">${f.n}</output></button></div>`;
      const set = v => { f.n = Math.max(1, Math.min(max, v)); $("fRange").value = f.n; $("fOut").textContent = f.n; };
      $("fRange").oninput = e => set(+e.target.value); $("fMinus").onclick = () => set(f.n - 1); $("fPlus").onclick = () => set(f.n + 1);
      $("fCancel").onclick = () => { ui.fort = null; selectSun(-1); render(); };
      $("fGo").onclick = () => { send({ t: "fortify", from: f.from, to: f.to, n: f.n }); ui.fort = null; }; return;
    }
    bar.innerHTML = `${phaseRow}<div class="big">Fortify</div><div class="what">${g.fortified ? "Ships moved. End your turn when ready." : ui.fort ? "Now tap a <span style='color:#6fb3ff'>blue</span> sun to send ships to." : "Optional: tap one of your suns, then another connected through your space, to move ships."}</div>
      <div class="row"><button class="btn go" id="bEnd" type="button">End turn</button>${awayBtn}</div>${timerText(g, true)}`;
    $("bEnd").onclick = () => send({ t: "endTurn" }); wireAway();
  }
}
function wireAway() { const b = $("bAway"); if (b) b.onclick = () => room.send({ t: "away", on: true }); }
function timerText(g, mineOnly) {
  if (!st.deadline) return "";
  const left = Math.max(0, Math.round((st.deadline - (Date.now() - (st._skew || 0))) / 1000));
  const warn = st.warnAt && Date.now() >= st.warnAt;
  const txt = left > 3600 ? `${Math.floor(left / 3600)} h ${Math.floor(left % 3600 / 60)} min left` : left > 60 ? `${Math.floor(left / 60)} min ${left % 60} s left` : `${left} s left`;
  return mineOnly ? `<div class="timer ${warn ? "warn" : ""}">${warn ? "The AI takes over in " + left + " s" : txt}</div>` : ` <span class="timer">${txt}</span>`;
}
setInterval(() => { if (st && st.deadline && st.game && st.status === "playing") { const t = document.querySelector(".timer"); if (t) renderBar(); } }, 1000);
function paceRow() {
  const cur = (st.opts && st.opts.pace) || "normal";
  return `<div class="seg" style="justify-content:center" data-pace>${["slow", "normal", "fast", "instant"].map(p => `<button type="button" data-p="${p}" aria-pressed="${p === cur}">${p[0].toUpperCase() + p.slice(1)}</button>`).join("")}</div>`;
}
function wirePace() { document.querySelectorAll("[data-pace] button").forEach(b => b.onclick = () => room.send({ t: "pace", pace: b.dataset.p })); }

function renderPlayers() {
  const el = $("players"); el.hidden = ui.panel !== "players"; $("hPlayers").setAttribute("aria-expanded", ui.panel === "players");
  if (el.hidden) return;
  const g = st.game, total = MAP.n;
  el.innerHTML = `<p class="eyebrow">${g ? `Turn ${g.turnNo} · win at ${effPct(g)}%` : "Players"}</p>` + st.seats.map((s, k) => {
    const sys = g ? ownedBy(g, k) : 0, ships = g ? g.armies.reduce((a, v, i) => a + (g.owner[i] === k ? v : 0), 0) : 0, out = g && g.phase !== "setup" && !g.alive[k];
    const tag = s.ai ? "AI" : s.away ? "AI playing" : !s.online ? "offline" : s.id === mySeat ? "you" : "";
    const cards = g && g.cards[k] ? g.cards[k].length : 0;
    return `<div class="prow ${g && g.turn === k && g.status === "playing" ? "turn" : ""} ${out ? "out" : ""}" style="--pc:${esc(s.main)}">
      <span class="swatch s" style="--sw-main:${esc(s.main)};--sw-sub:${esc(s.sub)}"></span>
      <span class="nm">${esc(s.name)}${tag ? `<small>${tag}</small>` : ""}</span>
      <span class="st">${g ? `${sys} ☀ · ${ships}${cards ? ` · ${cards}▤` : ""}` : ""}${!g && isCreator && s.id !== mySeat ? `<button class="btn small ghost" data-rm="${esc(s.id)}" type="button" aria-label="Remove">✕</button>` : ""}</span>
      ${g ? `<span class="bar-track"><i style="width:${(100 * sys / total).toFixed(1)}%"></i></span>` : ""}</div>`;
  }).join("") + (mySeat ? `<button class="btn small ghost" id="pLook" type="button">Edit my look</button>` : `<p class="hint">You're watching.</p>`);
  el.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => room.send({ t: "removeSeat", id: b.dataset.rm }));
  if ($("pLook")) $("pLook").onclick = () => lookDialog();
}
function renderLog() {
  const el = $("logPanel"); el.hidden = ui.panel !== "log"; if (el.hidden) return;
  el.innerHTML = `<p class="eyebrow">Log</p>` + (st.log || []).slice().reverse().map(l => `<div class="logline">${esc(l.text)}</div>`).join("");
}
function renderBadge() {
  const b = $("hCards").querySelector(".badge"), g = st.game, k = seatIx(), h = g && k >= 0 ? g.cards[k] || [] : [];
  b.hidden = !h.length; b.textContent = h.length; b.classList.toggle("hot", h.length >= 5);
}
function renderSunCard() {
  const el = $("sunCard"), i = ui.sel;
  if (i < 0 || !st) { el.hidden = true; return; }
  const s = S[i], g = st.game, o = g ? g.owner[i] : -1, a = g ? g.armies[i] : 0, c = specClass(s), kind = MAP.sun[i];
  const f = fleetOf(a), fleet = a ? CLASSES.slice().reverse().filter(x => f[x.key]).map(x => `${f[x.key]} ${x.name}${f[x.key] > 1 ? "s" : ""}`).join(", ") : "none";
  const cont = MAP.continents[MAP.contOf[i]];
  el.hidden = false;
  el.innerHTML = `<p class="eyebrow">${esc(cont ? cont.name : "")}${cont ? ` · +${cont.bonus} for holding all ${cont.members.length}` : ""}</p>
    <h3><span class="swatch s" style="--sw-main:${o < 0 ? "#eef2ff" : esc(lookOf(o).main)};--sw-sub:${o < 0 ? "#05070c" : esc(lookOf(o).sub)}"></span>${esc(disp(s))}</h3>
    <dl><dt>Held by</dt><dd>${esc(nameOf(o))}${g && g.hq.indexOf(i) >= 0 ? " ★ home" : ""}</dd><dt>Ships</dt><dd>${a} ${a ? `(${fleet})` : ""}</dd>
    <dt>Sun</dt><dd><span class="sundot" style="color:${CARD_COLOR[kind]};background:${CARD_COLOR[kind]}"></span>${esc((s.spect || "").trim() || "type unknown")}${c ? ` · ${SUN_WORDS[c] || ""}` : ""}</dd>
    <dt>Surface</dt><dd>${surfaceTemp(s)}</dd><dt>Light</dt><dd>${lightText(s)}</dd><dt>From Earth</dt><dd>${s.name === "Sol" ? "home" : s.distLy.toFixed(1) + " ly"}</dd></dl>
    ${STAR_FACTS[s.name] ? `<p class="fact">${esc(STAR_FACTS[s.name])}</p>` : ""}`;
}

// ---------- cards ----------
function cardFace(id, pressed) {
  const k = cardKind(MAP, id);
  if (id >= MAP.n) return `<button type="button" class="cardface k3" data-card="${id}" aria-pressed="${pressed}"><span class="top"><span class="sundot" style="color:${CARD_COLOR[3]};background:${CARD_COLOR[3]}"></span>Wild</span><span class="ty">Counts as any sun colour.</span></button>`;
  const s = S[id], c = specClass(s), held = st.game.owner[id] === seatIx();
  return `<button type="button" class="cardface k${k}" data-card="${id}" aria-pressed="${pressed}"><span class="top"><span class="sundot" style="color:${CARD_COLOR[k]};background:${CARD_COLOR[k]}"></span>${esc(disp(s))}</span>
    <span class="ty">${CARD_NAMES[k]}${c ? ` · ${SUN_WORDS[c]}` : ""}</span><span class="ty">${surfaceTemp(s)} · ${s.name === "Sol" ? "home" : s.distLy.toFixed(1) + " ly"}</span>${held ? `<span class="fact">You hold it: +2 ships there when traded.</span>` : ""}</button>`;
}
function openCards() {
  const g = st && st.game, k = seatIx(); if (!g || k < 0) return;
  const draw = () => {
    const hand = g.cards[k] || [], sel = [...ui.cards].filter(c => hand.includes(c)), ok = sel.length === 3 && isSet(MAP, sel), canTrade = myTurn() && g.phase === "reinforce";
    openDialog(`<div class="dlg"><h2>Your cards</h2>
      <p class="hint">Trade three of a kind, one of each colour, or any two with a wild. The next set is worth <b>${tradeValue(g.trades)}</b> ships (it goes up every trade at the table). ${hand.length >= 5 ? "<b style='color:var(--red)'>Five cards: you must trade now.</b>" : ""}</p>
      ${hand.length ? `<div class="cards">${hand.map(id => cardFace(id, sel.includes(id))).join("")}</div>` : `<p class="hint">No cards yet. Take at least one sun in a turn to earn one.</p>`}
      <div class="row end"><button class="btn ghost" id="kClose" type="button">Close</button><button class="btn" id="kBest" type="button" ${canTrade ? "" : "disabled"}>Pick best set</button><button class="btn go" id="kTrade" type="button" ${ok && canTrade ? "" : "disabled"}>Trade for ${tradeValue(g.trades)}</button></div></div>`, el => {
        el.querySelectorAll("[data-card]").forEach(b => b.onclick = () => { const id = +b.dataset.card; ui.cards.has(id) ? ui.cards.delete(id) : ui.cards.size < 3 && ui.cards.add(id); draw(); });
        el.querySelector("#kClose").onclick = () => dlg.close();
        el.querySelector("#kBest").onclick = () => { const b = bestSet(hand); if (b) { ui.cards = new Set(b); draw(); } else toast("No set in your hand yet."); };
        el.querySelector("#kTrade").onclick = () => { send({ t: "trade", cards: sel }); ui.cards.clear(); dlg.close(); };
      });
  };
  draw();
}
function bestSet(h) {
  let best = null, bs = -1e9;
  for (let a = 0; a < h.length; a++) for (let b = a + 1; b < h.length; b++) for (let c = b + 1; c < h.length; c++) {
    const ids = [h[a], h[b], h[c]]; if (!isSet(MAP, ids)) continue;
    const sc = (ids.some(x => x < MAP.n && st.game.owner[x] === seatIx()) ? 2 : 0) - ids.filter(x => x >= MAP.n).length * 3; if (sc > bs) { bs = sc; best = ids; }
  }
  return best;
}

// ---------- win ----------
function winDialog() {
  const g = st && st.game; if (!g || g.winner < 0) return;
  const w = lookOf(g.winner).main, k = seatIx();
  openDialog(`<div class="dlg win" style="--wc:${esc(w)}"><div class="crown">♛</div><h2>${esc(nameOf(g.winner))} rules the stars</h2>
    <p class="hint">${g.winner === k ? "You are the Stellarch of the known stars." : "The war is over."} ${ownedBy(g, g.winner)} of ${MAP.n} suns after ${g.turnNo} turns.</p>
    <div class="row"><button class="btn" id="wClose" type="button">Look at the map</button><button class="btn go" id="wMenu" type="button">Menu</button></div></div>`, el => {
      el.querySelector("#wClose").onclick = () => dlg.close(); el.querySelector("#wMenu").onclick = () => leaveRoom();
    });
}

// ---------- top bar ----------
$("hMenu").onclick = () => openDialog(`<div class="dlg"><h2>Menu</h2>
  <div class="field"><span>Show</span><div class="seg"><button type="button" id="mNames" aria-pressed="${!!ui.allNames}">All sun names</button><button type="button" id="mSpin" aria-pressed="${!!ui.spin}">Slow rotation</button></div></div>
  ${"Notification" in window && Notification.permission === "default" ? `<button class="btn" id="mNotify" type="button">Alert me when it's my turn</button>` : ""}
  <div class="row end"><button class="btn" id="mLeave" type="button">Leave game</button><button class="btn go" id="mBack" type="button">Back to the war</button></div></div>`, el => {
    el.querySelector("#mNames").onclick = () => { ui.allNames = !ui.allNames; scene.setAllNames(ui.allNames); dlg.close(); };
    el.querySelector("#mSpin").onclick = () => { ui.spin = !ui.spin; scene.setAutoRotate(ui.spin); dlg.close(); };
    const nb = el.querySelector("#mNotify"); if (nb) nb.onclick = () => { Notification.requestPermission(); dlg.close(); };
    el.querySelector("#mLeave").onclick = () => leaveRoom(); el.querySelector("#mBack").onclick = () => dlg.close();
  });
$("hCode").onclick = share;
$("hPlayers").onclick = () => { ui.panel = ui.panel === "players" ? null : "players"; $("logPanel").hidden = true; render(); };
$("hLog").onclick = () => { ui.panel = ui.panel === "log" ? null : "log"; $("players").hidden = true; renderLog(); if (ui.panel !== "log") $("logPanel").hidden = true; render(); };
$("hCards").onclick = openCards;
$("hFind").onclick = () => {
  const g = st && st.game, k = seatIx();
  openDialog(`<div class="dlg"><h2>Find a sun</h2><input id="fQ" placeholder="Name, e.g. Sirius" autocomplete="off">
    <div class="seg">${k >= 0 && g ? `<button type="button" id="fHome">My home sun</button><button type="button" id="fBorder">My busiest border</button>` : ""}<button type="button" id="fSol">Sol</button></div><div class="rooms" id="fList"></div></div>`, el => {
      const list = el.querySelector("#fList"), go = i => { dlg.close(); selectSun(i); scene.focus(i, 22); render(); };
      const show = q => { q = q.trim().toLowerCase(); const hits = q ? S.map((s, i) => [s, i]).filter(([s]) => s.name.toLowerCase().includes(q) || (s.members || []).some(m => m.toLowerCase().includes(q))).slice(0, 12) : [];
        list.innerHTML = hits.map(([s, i]) => `<div class="roomrow"><div class="grow"><div>${esc(disp(s))}</div><div class="mini">${s.name === "Sol" ? "home" : s.distLy.toFixed(1) + " ly"} · ${esc(g ? nameOf(g.owner[i]) : "")}</div></div><button class="btn small" data-go="${i}" type="button">Go</button></div>`).join("");
        list.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(+b.dataset.go)); };
      el.querySelector("#fQ").oninput = e => show(e.target.value); el.querySelector("#fSol").onclick = () => go(0);
      const h = el.querySelector("#fHome"); if (h) h.onclick = () => g.hq[k] >= 0 ? go(g.hq[k]) : toast("No home sun yet.");
      const bd = el.querySelector("#fBorder"); if (bd) bd.onclick = () => { let best = -1, bt = -1; for (let i = 0; i < MAP.n; i++) if (g.owner[i] === k) { const t = MAP.adj[i].reduce((a, j) => a + (g.owner[j] >= 0 && g.owner[j] !== k ? g.armies[j] : 0), 0); if (t > bt) { bt = t; best = i; } } if (best >= 0) go(best); };
      setTimeout(() => el.querySelector("#fQ").focus(), 50);
    });
};
async function share() {
  if (!st || !st.code) return;
  const url = location.origin + "/r/" + st.code;
  try { if (navigator.share && matchMedia("(pointer: coarse)").matches) await navigator.share({ title: "Stellarchy", text: "Join my Stellarchy war", url }); else { await navigator.clipboard.writeText(url); toast("Invite link copied."); } } catch (e) { toast(url); }
}

// a /r/CODE link opens that room directly
const linked = location.pathname.match(/^\/r\/([A-Za-z0-9]{4})$/);
if (linked) needName(() => joinCode(linked[1]));
window.stellarchy = { MAP, scene, get state() { return st; }, ui };   // for debugging and tests
// keep floating cards clear of the action bar, whatever its height
new ResizeObserver(() => document.documentElement.style.setProperty("--barh", $("bar").offsetHeight + "px")).observe($("bar"));
