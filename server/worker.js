// Stellarchy Worker: serves the page (static assets), creates rooms and routes each room's
// WebSocket to its Durable Object. The lobby is one more Durable Object listing public rooms.
export { Room } from "./room.js";

// room codes: no 0/O, 1/I/L, so they read aloud and type easily
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), b => ALPHABET[b % ALPHABET.length]).join("");
const CODE = /^[A-Z2-9]{4}$/;

const PER_VISITOR = 10, GLOBAL = 120;   // room-creation limits (launch protection)
// ask the lobby whether this visitor may make another room; returns a Response to send back when not
async function mayCreate(req, env) {
  const ip = req.headers.get("CF-Connecting-IP") || "local";
  // on the local dev server the limits are relaxed unless a test asks for the real ones (x-limit-test)
  const relaxed = env.DEV && !req.headers.get("x-limit-test");
  const r = await env.LOBBY.get(env.LOBBY.idFromName("lobby")).fetch(`https://lobby/allow?ip=${encodeURIComponent(ip)}${relaxed ? "&relaxed=1" : ""}`);
  return r.ok ? null : new Response(await r.text(), { status: 429, headers: { "content-type": "application/json" } });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname;
    if (p === "/api/rooms" && req.method === "POST") {
      const no = await mayCreate(req, env); if (no) return no;
      let o = {}; try { o = await req.json(); } catch (e) {}
      for (let tries = 0; tries < 6; tries++) {
        const code = newCode(), stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const r = await stub.fetch("https://room/init", { method: "POST", body: JSON.stringify({ ...o, code }) });
        if (r.status === 200) return Response.json({ code });
      }
      return new Response("could not make a room", { status: 503 });
    }
    // quick play: a running quick room with an AI seat to take over, else a fresh one (4 seats, 100 suns)
    if (p === "/api/quick" && req.method === "POST") {
      const list = await (await env.LOBBY.get(env.LOBBY.idFromName("lobby")).fetch("https://lobby/list")).json();
      // the lobby's list can be a few moves stale, so each candidate room is asked directly for a free AI seat
      const cands = list.rooms.filter(r => r.quick && r.status === "playing" && r.aiSeats > 0 && Date.now() - r.seen < 5 * 60000).sort((a, b) => a.turnNo - b.turnNo).slice(0, 5);
      for (const c of cands) {   // joining is never limited, only making new rooms
        const fresh = await env.ROOMS.get(env.ROOMS.idFromName(c.code)).fetch(`https://room/api/rooms/${c.code}`).then(r => r.ok ? r.json() : null).catch(() => null);
        if (fresh && fresh.status === "playing" && fresh.aiSeats > 0) return Response.json({ code: c.code, joined: true });
      }
      { const no = await mayCreate(req, env); if (no) return no; }
      for (let tries = 0; tries < 6; tries++) {
        const code = newCode(), stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const r = await stub.fetch("https://room/init", { method: "POST", body: JSON.stringify({ quick: true, maxSeats: 4, size: 100, mode: "legacy", targetPct: 100, pace: "normal", code }) });
        if (r.status === 200) return Response.json({ code, joined: false });
      }
      return new Response("could not make a room", { status: 503 });
    }
    // notes to the developer (round 42): anyone can leave one; only Paul's key reads them back (tools/notes.mjs)
    if (p === "/api/notes") {
      const stub = env.NOTES.get(env.NOTES.idFromName("notes"));
      if (req.method === "POST") {
        const ip = req.headers.get("CF-Connecting-IP") || "local";
        return stub.fetch(`https://notes/add?ip=${encodeURIComponent(ip)}${env.DEV && !req.headers.get("x-limit-test") ? "&relaxed=1" : ""}`, { method: "POST", body: await req.text() });
      }
      if (req.method === "GET") {
        if (!env.NOTES_KEY || req.headers.get("x-notes-key") !== env.NOTES_KEY) return new Response("not allowed", { status: 403 });
        return stub.fetch(`https://notes/list?after=${encodeURIComponent(url.searchParams.get("after") || "0")}`);
      }
      return new Response("method not allowed", { status: 405 });
    }
    if (p === "/api/rooms" && req.method === "GET") return env.LOBBY.get(env.LOBBY.idFromName("lobby")).fetch("https://lobby/list");
    const m = p.match(/^\/api\/rooms\/([A-Za-z0-9]{4})(\/ws)?$/);
    if (m) {
      const code = m[1].toUpperCase(); if (!CODE.test(code)) return new Response("bad code", { status: 400 });
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(req);
    }
    // /r/CODE links open the page; the page reads the code from the address
    if (/^\/r\/[A-Za-z0-9]{4}$/.test(p)) return env.ASSETS.fetch(new Request(new URL("/", url), req));
    return env.ASSETS.fetch(req);
  },
};

// the lobby: public rooms report in; anything quiet for 15 minutes (or finished for 2) drops off the list
export class Lobby {
  constructor(ctx) { this.ctx = ctx; this.rooms = null; this.savedAt = 0; this.tidiedAt = 0; ctx.blockConcurrencyWhile(async () => { this.rooms = (await ctx.storage.get("rooms")) || {}; }); }
  // round 41 (launch load): the list lives in memory and is written to storage at most every 10 s, not on every report
  async save() {
    const now = Date.now();
    if (now - this.savedAt >= 10000) { this.savedAt = now; await this.ctx.storage.put("rooms", this.rooms); }
    else if (!this.saveDue) { this.saveDue = true; await this.ctx.storage.setAlarm(this.savedAt + 10000); }
  }
  async alarm() { this.saveDue = false; this.savedAt = Date.now(); await this.ctx.storage.put("rooms", this.rooms); }
  async fetch(req) {
    const url = new URL(req.url), now = Date.now();
    if (now - this.tidiedAt > 5000) {   // drop rooms quiet for 15 minutes (or finished for 2), at most every 5 s
      this.tidiedAt = now;
      for (const [c, r] of Object.entries(this.rooms)) if (now - r.seen > 15 * 60000 || (r.status === "over" && now - r.seen > 2 * 60000)) delete this.rooms[c];
    }
    // launch protection: at most PER_VISITOR new rooms per visitor per 10 min, and GLOBAL a minute in all
    if (url.pathname === "/allow") {
      const ip = url.searchParams.get("ip") || "unknown", win = 10 * 60000;
      this.made = this.made || new Map(); this.recent = (this.recent || []).filter(t => now - t < 60000);
      const mine = (this.made.get(ip) || []).filter(t => now - t < win);
      if (mine.length >= (url.searchParams.get("relaxed") ? 1000 : PER_VISITOR)) return Response.json({ ok: false, error: "You've made a lot of rooms in the last few minutes. Join one, or try again shortly." }, { status: 429 });
      if (this.recent.length >= GLOBAL) return Response.json({ ok: false, error: "Stellarchy is very busy right now. Try again in a minute, or play vs AI." }, { status: 429 });
      mine.push(now); this.made.set(ip, mine); this.recent.push(now);
      if (this.made.size > 5000) for (const [k, v] of this.made) if (!v.some(t => now - t < win)) this.made.delete(k);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/report") {
      const r = await req.json();
      if (r.public) this.rooms[r.code] = { ...r, seen: now }; else delete this.rooms[r.code];
      await this.save(); return new Response("ok");
    }
    const list = Object.values(this.rooms).sort((a, b) => (a.status === "lobby" ? 0 : 1) - (b.status === "lobby" ? 0 : 1) || b.seen - a.seen).slice(0, 50);
    return Response.json({ rooms: list });
  }
}

// Notes to the developer: kept in order, each with a number, the kind, the text and a little context (screen size,
// room). Visitors' addresses are used only for the hourly limit, in memory, and never stored.
const NOTE_MAX = 2000, NOTES_PER_HOUR = 5;
const NOTE_KINDS = ["bug", "idea", "love", "other"];
export class Notes {
  constructor(ctx) { this.ctx = ctx; this.recent = new Map(); }
  async fetch(req) {
    const url = new URL(req.url), now = Date.now();
    if (url.pathname === "/add") {
      const ip = url.searchParams.get("ip") || "unknown", mine = (this.recent.get(ip) || []).filter(t => now - t < 3600000);
      if (mine.length >= (url.searchParams.get("relaxed") ? 1000 : NOTES_PER_HOUR)) return Response.json({ ok: false, error: "Thanks! That's plenty of notes for one hour. Try again later." }, { status: 429 });
      let m = {}; try { m = JSON.parse((await req.text()).slice(0, 8000)); } catch (e) {}
      const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, n);
      const text = clean(m.text, NOTE_MAX); if (text.length < 3) return Response.json({ ok: false, error: "Write a few words first." }, { status: 400 });
      mine.push(now); this.recent.set(ip, mine); if (this.recent.size > 5000) this.recent.clear();
      const id = ((await this.ctx.storage.get("next")) || 1);
      const c = m.context && typeof m.context === "object" ? m.context : {};
      const note = { id, at: new Date(now).toISOString(), kind: NOTE_KINDS.includes(m.kind) ? m.kind : "other", name: clean(m.name, 24), text,
                     context: { screen: clean(c.screen, 20), room: clean(c.room, 8), status: clean(c.status, 12), turn: Number.isFinite(+c.turn) ? +c.turn : null, solo: !!c.solo } };
      await this.ctx.storage.put({ ["n:" + String(id).padStart(8, "0")]: note, next: id + 1 });
      return Response.json({ ok: true, id });
    }
    if (url.pathname === "/list") {
      const after = Math.max(0, +url.searchParams.get("after") || 0);
      const got = await this.ctx.storage.list({ prefix: "n:", start: "n:" + String(after + 1).padStart(8, "0"), limit: 500 });
      return Response.json({ notes: [...got.values()] });
    }
    return new Response("not found", { status: 404 });
  }
}
