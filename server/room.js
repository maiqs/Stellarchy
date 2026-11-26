// Stellarchy room: one Durable Object per room. It owns the game: clients send intents over a
// WebSocket, the room checks them with the shared rules, rolls the dice and broadcasts the result.
// Computer players, away players and turn timers all run here on alarms, so a game keeps going
// when every tab is closed.
import STARS from "../data/stars.json";
import { buildMap, clampSize } from "../shared/mapgen.js";
import { prepareMap, mulberry32 } from "../shared/map.js";
import { newGame, act, MAX_SEATS, SUNS_PER_SEAT } from "../shared/rules.js";
import { botIntent, STYLE_KEYS } from "../shared/bot.js";
import { EMOTES, botEmotes } from "../shared/emotes.js";

// maps are built per size and kept for reuse (the same size always gives the same map)
const MAPS = new Map();
export const mapFor = size => { size = clampSize(size); if (!MAPS.has(size)) MAPS.set(size, prepareMap(buildMap(STARS, size))); return MAPS.get(size); };
export const HULLS = ["triangle", "brick", "tube", "orb", "saucer"];
const PALETTE = ["#ff4d5a", "#3e9bff", "#f5d90a", "#3fcf6a", "#b06bff", "#ff8a2a", "#22d3c5", "#ff6fb5", "#9dff3a", "#ffffff", "#5b6bff", "#ff3df2", "#00e5ff", "#ffb3a7", "#c9a227", "#7cffc4"];
const PSUB = ["#ffe066", "#ffffff", "#ff4d5a", "#0b0f18", "#3fcf6a", "#3e9bff", "#ff6fb5", "#22d3c5", "#b06bff", "#ff4d5a", "#f5d90a", "#ffffff", "#ff8a2a", "#3e9bff", "#0b0f18", "#b06bff"];
const BOT_NAMES = ["Unit Ceres", "Overmind Vega", "Captain Null", "Admiral Byte", "Warden Kepler", "The Archivist", "Marshal Orbit", "Sentinel Nine", "Lady Parsec", "Echo Prime", "Count Quasar", "Vector Seven", "Doctor Nebula", "Baron Redshift", "Queen Corona", "Pilot Zero"];
export const PACES = { slow: 900, normal: 450, fast: 150, instant: 25 };
export const TIMERS = [0, 90, 180, 43200, 86400];   // seconds per turn: none, 90 s, 3 min, 12 h, 24 h
const GRACE_MS = 20000;        // a dropped connection gets this long before the AI covers the seat
const SKIP_WARN_MS = 10000;    // "AI takes over in 10 s" is shown this long before a timer runs out
const MAX_LOG = 60;

const HEX = /^#[0-9a-fA-F]{6}$/;
const cleanName = s => String(s ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
const rid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.s = null;
    ctx.blockConcurrencyWhile(async () => { this.s = (await ctx.storage.get("room")) || null; });
  }

  async save() { await this.ctx.storage.put("room", this.s); }
  get map() { return mapFor(this.s.opts.size || 300); }

  // ---- HTTP: create (from the Worker) and the WebSocket upgrade ----
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/init" && req.method === "POST") {
      if (this.s) return new Response("exists", { status: 409 });
      const o = await req.json();
      this.s = {
        code: o.code, created: Date.now(), updated: Date.now(), status: "lobby", public: !!o.public,
        opts: { maxSeats: clampInt(o.maxSeats, 2, MAX_SEATS, 6), mode: o.mode === "dealt" ? "dealt" : "legacy",
                targetPct: clampInt(o.targetPct, 30, 100, 100), timer: TIMERS.includes(o.timer) ? o.timer : 0,
                pace: PACES[o.pace] ? o.pace : "normal", size: 300 },
        seats: [], tokens: {}, creator: null, game: null, rev: 0, log: [], seed: (Math.random() * 2 ** 31) | 0, rngState: 0,
        turnStarted: 0, deadline: 0,
      };
      this.s.opts.size = Math.max(clampSize(o.size ?? 100), this.s.opts.maxSeats * SUNS_PER_SEAT);
      if (this.env.DEV && o.idleMs) this.s.opts.idleMs = clampInt(o.idleMs, 500, 3600000, 0);   // local tests only
      if (o.allAI) { for (let k = 0; k < this.s.opts.maxSeats; k++) this.addBot(); }
      await this.save(); await this.report();
      if (o.allAI) { this.start(); await this.commit(); } else await this.schedule();
      return Response.json({ ok: true });
    }
    if (!this.s) return new Response("no such room", { status: 404 });
    if (req.headers.get("Upgrade") !== "websocket") return Response.json(this.summary());
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ seat: null, bucket: 20, last: Date.now() });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  summary() {
    const s = this.s;
    return { code: s.code, status: s.status, public: s.public, seats: s.seats.length, humans: s.seats.filter(x => !x.ai).length,
             maxSeats: s.opts.maxSeats, mode: s.opts.mode, targetPct: s.opts.targetPct, timer: s.opts.timer, size: s.opts.size || 300, updated: s.updated,
             names: s.seats.map(x => x.name).slice(0, 6), turnNo: s.game ? s.game.turnNo : 0 };
  }
  async report() {   // tell the lobby about this room (public rooms only show there)
    try { await this.env.LOBBY.get(this.env.LOBBY.idFromName("lobby")).fetch("https://lobby/report", { method: "POST", body: JSON.stringify(this.summary()) }); } catch (e) {}
  }

  // ---- WebSocket messages ----
  async webSocketMessage(ws, raw) {
    if (!this.s) { try { ws.close(1000, "room closed"); } catch (e) {} return; }
    const a = ws.deserializeAttachment() || {};
    this.s.lastSeen = Date.now();   // people, not computer moves, keep a room alive
    const now = Date.now(); a.bucket = Math.min(20, (a.bucket ?? 20) + (now - (a.last || now)) / 250); a.last = now;   // 4 messages a second, bursts of 20
    if (a.bucket < 1) { ws.send(JSON.stringify({ t: "error", error: "slow down" })); ws.serializeAttachment(a); return; }
    a.bucket--; ws.serializeAttachment(a);   // saved every message, or the limit never bites
    let m; try { m = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)); } catch (e) { return; }
    if (!m || typeof m.t !== "string" || (typeof raw === "string" && raw.length > 4000)) return;
    const reply = o => ws.send(JSON.stringify(o));
    const s = this.s;
    if (m.t === "hello") {
      // a returning player's token finds their seat; otherwise they join the lobby or watch
      let seat = Object.keys(s.tokens).find(id => s.tokens[id] === m.token) || null;
      if (!seat && s.status === "lobby" && s.seats.length < s.opts.maxSeats && m.join !== false) {
        seat = this.addHuman(m); if (!s.creator) s.creator = seat;
      }
      a.seat = seat; a.needFull = true; ws.serializeAttachment(a);
      if (seat) { const st = s.seats.find(x => x.id === seat); if (st) { st.online = true; st.lostAt = 0; if (st.away && !st.autoAway) {} if (st.autoAway) { st.away = false; st.autoAway = false; this.log(`${st.name} is back`); } } this.syncGameSeats(); }
      reply({ t: "welcome", seat, token: seat ? s.tokens[seat] : null, creator: s.creator === seat });
      await this.commit(); return;
    }
    if (m.t === "resync") { a.needFull = true; ws.serializeAttachment(a); this.sendState(); return; }   // a client that missed a message asks for the full board
    const seatId = a.seat, seat = seatId ? s.seats.find(x => x.id === seatId) : null;
    if (!seat) { reply({ t: "error", error: "watching only" }); return; }
    const isCreator = s.creator === seatId;
    switch (m.t) {
      case "look": {
        const name = cleanName(m.name); if (name) seat.name = name;
        if (HEX.test(m.main)) seat.main = m.main; if (HEX.test(m.sub)) seat.sub = m.sub;
        if (HULLS.includes(m.hull)) seat.hull = m.hull; if (STYLE_KEYS.includes(m.style)) seat.style = m.style;
        this.syncGameSeats(); break;
      }
      case "addBot": if (isCreator && s.status === "lobby" && s.seats.length < s.opts.maxSeats) this.addBot(m.style); break;
      case "removeSeat": if (isCreator && s.status === "lobby" && m.id !== seatId) { s.seats = s.seats.filter(x => x.id !== m.id); delete s.tokens[m.id]; } break;
      case "options": if (isCreator && s.status === "lobby") {
        const o = s.opts;
        if (m.maxSeats !== undefined) o.maxSeats = clampInt(m.maxSeats, Math.max(2, s.seats.length), MAX_SEATS, o.maxSeats);
        if (m.mode) o.mode = m.mode === "dealt" ? "dealt" : "legacy";
        if (m.targetPct !== undefined) o.targetPct = clampInt(m.targetPct, 30, 100, o.targetPct);
        if (TIMERS.includes(m.timer)) o.timer = m.timer;
        if (m.public !== undefined) s.public = !!m.public;
        if (m.size !== undefined) o.size = clampSize(m.size);
        o.size = Math.max(o.size || 300, o.maxSeats * SUNS_PER_SEAT);
        break;
      }
      case "pace": if (PACES[m.pace]) s.opts.pace = m.pace; break;
      case "start": if (isCreator && s.status === "lobby" && s.seats.length >= 2) this.start(); else return reply({ t: "error", error: "only the room's creator can start, with 2 or more seats" });
        break;
      case "away": {   // "Let AI play for me" and taking the seat back
        seat.away = !!m.on; seat.autoAway = false; this.log(m.on ? `${seat.name} handed their seat to the AI` : `${seat.name} took their seat back`);
        this.syncGameSeats(); break;
      }
      case "emote": {   // one every 2 s per connection
        if (typeof m.e !== "string" || !EMOTES.includes(m.e) || now - (a.emoted || 0) < 2000) return;
        a.emoted = now; ws.serializeAttachment(a); this.broadcast({ t: "emote", seat: seatId, e: m.e }); return;
      }
      case "intent": {
        const g = s.game; if (!g || s.status !== "playing") return reply({ t: "error", error: "no game running" });
        const k = s.seats.indexOf(seat);
        if (seat.away) { seat.away = false; seat.autoAway = false; this.syncGameSeats(); }   // acting takes the seat back from the AI
        const r = act(this.map, g, k, m.intent, this.rng());
        if (!r.ok) return reply({ t: "error", error: r.error });
        this.afterEvents(r.events); break;
      }
      default: return;
    }
    await this.commit();
  }

  async webSocketClose(ws) { await this.dropped(ws); }
  async webSocketError(ws) { await this.dropped(ws); }
  async dropped(ws) {
    if (!this.s) return;
    this.s.lastSeen = Date.now();
    const a = ws.deserializeAttachment() || {}; if (!a.seat) { await this.schedule(); return; }
    const still = this.ctx.getWebSockets().some(w => w !== ws && (w.deserializeAttachment() || {}).seat === a.seat);
    const st = this.s.seats.find(x => x.id === a.seat); if (!st || still) return;
    st.online = false; st.lostAt = Date.now(); this.s.lastSeen = Date.now();
    if (this.s.status === "lobby") { /* keep lobby seats; the creator can remove them */ }
    await this.commit();
  }

  // ---- seats ----
  freeLook() {
    const used = new Set(this.s.seats.map(x => x.main.toLowerCase())), k = PALETTE.findIndex(c => !used.has(c.toLowerCase()));
    const i = k < 0 ? this.s.seats.length % 16 : k; return { main: PALETTE[i], sub: PSUB[i] };
  }
  addHuman(m) {
    const id = "p_" + rid(), f = this.freeLook(), used = new Set(this.s.seats.map(x => x.main.toLowerCase()));
    const main = HEX.test(m.main) && !used.has(m.main.toLowerCase()) ? m.main : f.main, sub = main === m.main && HEX.test(m.sub) ? m.sub : f.sub;
    this.s.seats.push({ id, name: cleanName(m.name) || "Stellarch", main, sub, hull: HULLS.includes(m.hull) ? m.hull : HULLS[this.s.seats.length % 5],
                        style: STYLE_KEYS.includes(m.style) ? m.style : "balanced", ai: false, away: false, online: true });
    this.s.tokens[id] = rid() + rid();
    this.log(`${this.s.seats.at(-1).name} joined`); return id;
  }
  addBot(style) {
    const used = new Set(this.s.seats.map(x => x.name)), f = this.freeLook();
    const name = BOT_NAMES.find(b => !used.has(b)) || "Bot " + (this.s.seats.length + 1);
    this.s.seats.push({ id: "ai_" + rid(), name, main: f.main, sub: f.sub, hull: HULLS[this.s.seats.length % 5],
                        style: STYLE_KEYS.includes(style) ? style : STYLE_KEYS[Math.floor(Math.random() * STYLE_KEYS.length)], ai: true, away: false, online: true });
  }
  syncGameSeats() { if (this.s.game) this.s.game.seats = this.s.seats.map(x => ({ ...x })); }

  start() {
    const s = this.s;
    if (this.map.n < s.seats.length * SUNS_PER_SEAT) return;
    s.game = newGame(this.map, { mode: s.opts.mode, targetPct: s.opts.targetPct, seats: s.seats }, this.rng());
    s.status = "playing"; this.log("The war begins"); this.turnBegan();
  }

  // ---- the clock: computer turns, away players, timers and dropped connections ----
  controlledByAI(k) { const st = this.s.seats[k]; return !!st && (st.ai || st.away); }
  turnBegan() { const s = this.s; s.turnStarted = Date.now(); s.deadline = s.opts.timer ? Date.now() + s.opts.timer * 1000 + this.extraTime() : 0; }
  extraTime() { const g = this.s.game; return g && g.phase === "reinforce" ? Math.min(60000, g.reinforcements * 1000) : 0; }   // more ships to place, more time

  afterEvents(ev) {
    const s = this.s, g = s.game;
    for (const e of ev) {
      if (e.t === "turn") this.turnBegan();
      if (e.t === "elim") this.log(`${s.seats[e.seat].name} was wiped out by ${s.seats[e.by].name}`);
      if (e.t === "win") { s.status = "over"; this.log(`${s.seats[e.seat].name} wins with ${e.systems} suns`); }
    }
    s.lastEvents = ev; s.lastEventsRev = s.rev + 1;
    for (const b of botEmotes(ev, s.seats, Math.random)) this.broadcast({ t: "emote", seat: s.seats[b.seat].id, e: b.e });
  }

  async alarm() {
    const s = this.s; if (!s) return;
    if (await this.cleanupDue()) return;
    if (s.status !== "playing") { await this.schedule(); return; }
    const g = s.game, k = g.turn, st = s.seats[k], now = Date.now();
    // a dropped human gets a short grace, then the AI covers them until they return
    for (const x of s.seats) if (!x.ai && !x.online && !x.away && x.lostAt && now - x.lostAt > GRACE_MS) { x.away = true; x.autoAway = true; this.log(`${x.name} lost connection: the AI is playing for them`); }
    if (st && !st.ai && !st.away && s.deadline && now >= s.deadline) { st.away = true; st.autoAway = true; this.log(`${st.name} ran out of time: the AI is playing for them`); }
    this.syncGameSeats();
    if (this.controlledByAI(k)) {
      const it = botIntent(this.map, g, k, s.seats[k].style, this.rng());
      let r = it ? act(this.map, g, k, it, this.rng()) : { ok: false };
      if (!r.ok) {   // never stall
        const fb = g.advance ? { t: "advance", n: 0 } : g.phase === "attack" ? { t: "endAttack" } : { t: "endTurn" };
        r = act(this.map, g, k, fb, this.rng());
      }
      if (r.ok) this.afterEvents(r.events);
    }
    await this.commit();
  }

  async schedule() {
    const s = this.s, now = Date.now(), times = [], cleanup = this.cleanupAt();
    if (cleanup) times.push(cleanup);
    if (s.status !== "playing") { if (times.length) await this.ctx.storage.setAlarm(Math.max(now + 20, times[0])); else await this.ctx.storage.deleteAlarm(); return; }
    const k = s.game.turn;
    if (this.controlledByAI(k)) times.push(now + PACES[s.opts.pace]);
    if (s.deadline) times.push(s.deadline);
    for (const x of s.seats) if (!x.ai && !x.online && !x.away && x.lostAt) times.push(x.lostAt + GRACE_MS + 50);
    if (!times.length) { await this.ctx.storage.deleteAlarm(); return; }
    await this.ctx.storage.setAlarm(Math.max(now + 20, Math.min(...times)));
  }

  // ---- cleanup: rooms nobody is connected to close after a while ----
  // 30 min idle (10 min once finished); long-turn rooms (12 h or 24 h timers) are kept for 7 days
  idleLimit() { const s = this.s; if (this.env.DEV && s.opts.idleMs) return s.opts.idleMs; return s.status === "over" ? 10 * 60000 : s.opts.timer >= 43200 ? 7 * 86400000 : 30 * 60000; }
  cleanupAt() { return this.ctx.getWebSockets().some(w => w.readyState === 1) ? 0 : (this.s.lastSeen || this.s.created || Date.now()) + this.idleLimit(); }
  async cleanupDue() {
    const at = this.cleanupAt(); if (!at || Date.now() < at) return false;
    const code = this.s.code;
    try { await this.env.LOBBY.get(this.env.LOBBY.idFromName("lobby")).fetch("https://lobby/report", { method: "POST", body: JSON.stringify({ code, public: false }) }); } catch (e) {}
    await this.ctx.storage.deleteAlarm(); await this.ctx.storage.deleteAll(); this.s = null;
    return true;
  }
  // ---- saving and broadcasting ----
  rng() { const s = this.s; s.rngState = (s.rngState + 1) | 0; return mulberry32(s.seed ^ Math.imul(s.rngState, 0x9E3779B1)); }
  log(text) { this.s.log.push({ text, t: Date.now() }); if (this.s.log.length > MAX_LOG) this.s.log.splice(0, this.s.log.length - MAX_LOG); }
  view() {
    const s = this.s, now = Date.now(), g = s.game;
    return { t: "state", rev: s.rev, code: s.code, status: s.status, public: s.public, opts: s.opts, creator: s.creator,
             seats: s.seats.map(x => ({ id: x.id, name: x.name, main: x.main, sub: x.sub, hull: x.hull, style: x.style, ai: x.ai, away: !!x.away, online: x.online !== false })),
             game: null, events: s.lastEventsRev === s.rev ? s.lastEvents : [], log: s.log.slice(-20),
             deadline: s.deadline, warnAt: s.deadline ? s.deadline - SKIP_WARN_MS : 0, now };
  }
  // Each viewer gets their own message: only their own hand (others are just counts), never the deck order,
  // and only the suns that changed since the last message (a full board on joining or when asked to resync).
  sendState() {
    const s = this.s, g = s.game, base = this.view(), sockets = this.ctx.getWebSockets();
    let diff = null;
    if (g && this.sentBoard && this.sentBoard.owner.length === g.owner.length) {
      diff = [];
      for (let i = 0; i < g.owner.length; i++) if (g.owner[i] !== this.sentBoard.owner[i] || g.armies[i] !== this.sentBoard.armies[i]) diff.push([i, g.owner[i], g.armies[i]]);
    }
    const pub = g ? { ...g, owner: undefined, armies: undefined, deck: undefined, discard: undefined, deckCount: g.deck.length, cards: undefined } : null;
    for (const ws of sockets) {
      const a = ws.deserializeAttachment() || {};
      let msg = base;
      if (g) {
        const me = s.seats.findIndex(x => x.id === a.seat);
        const board = a.needFull || !diff ? { full: true, owner: g.owner, armies: g.armies } : { base: this.sentRev, d: diff };
        msg = { ...base, game: { ...pub, cards: g.cards.map((h, k) => k === me ? h : new Array(h.length).fill(-1)) }, board };
        if (a.needFull) { a.needFull = false; ws.serializeAttachment(a); }
      }
      try { ws.send(JSON.stringify(msg)); } catch (e) {}
    }
    if (g) { this.sentBoard = { owner: g.owner.slice(), armies: g.armies.slice() }; this.sentRev = s.rev; }
  }
  broadcast(o) { const txt = JSON.stringify(o); for (const ws of this.ctx.getWebSockets()) { try { ws.send(txt); } catch (e) {} } }
  async commit() {
    const s = this.s; s.rev++; s.updated = Date.now();
    if (s.lastEventsRev !== s.rev) s.lastEvents = [];
    await this.save(); await this.schedule();
    this.sendState();
    if (s.rev % 10 === 1 || s.status !== "playing") await this.report();
  }
}

function clampInt(v, lo, hi, d) { v = Math.round(+v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; }
