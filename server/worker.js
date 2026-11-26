// Stellarchy Worker: serves the page (static assets), creates rooms and routes each room's
// WebSocket to its Durable Object. The lobby is one more Durable Object listing public rooms.
export { Room } from "./room.js";

// room codes: no 0/O, 1/I/L, so they read aloud and type easily
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), b => ALPHABET[b % ALPHABET.length]).join("");
const CODE = /^[A-Z2-9]{4}$/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname;
    if (p === "/api/rooms" && req.method === "POST") {
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
      for (const c of cands) {
        const fresh = await env.ROOMS.get(env.ROOMS.idFromName(c.code)).fetch(`https://room/api/rooms/${c.code}`).then(r => r.ok ? r.json() : null).catch(() => null);
        if (fresh && fresh.status === "playing" && fresh.aiSeats > 0) return Response.json({ code: c.code, joined: true });
      }
      for (let tries = 0; tries < 6; tries++) {
        const code = newCode(), stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const r = await stub.fetch("https://room/init", { method: "POST", body: JSON.stringify({ quick: true, maxSeats: 4, size: 100, mode: "legacy", targetPct: 100, pace: "normal", code }) });
        if (r.status === 200) return Response.json({ code, joined: false });
      }
      return new Response("could not make a room", { status: 503 });
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
  constructor(ctx) { this.ctx = ctx; this.rooms = null; ctx.blockConcurrencyWhile(async () => { this.rooms = (await ctx.storage.get("rooms")) || {}; }); }
  async fetch(req) {
    const url = new URL(req.url), now = Date.now();
    for (const [c, r] of Object.entries(this.rooms)) if (now - r.seen > 15 * 60000 || (r.status === "over" && now - r.seen > 2 * 60000)) delete this.rooms[c];
    if (url.pathname === "/report") {
      const r = await req.json();
      if (r.public) this.rooms[r.code] = { ...r, seen: now }; else delete this.rooms[r.code];
      await this.ctx.storage.put("rooms", this.rooms); return new Response("ok");
    }
    const list = Object.values(this.rooms).sort((a, b) => (a.status === "lobby" ? 0 : 1) - (b.status === "lobby" ? 0 : 1) || b.seen - a.seen).slice(0, 50);
    return Response.json({ rooms: list });
  }
}
