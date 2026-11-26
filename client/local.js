// Solo play with no server: a stand-in for the room that speaks the same messages
// ("welcome", "state", "error"), so the game screen cannot tell the difference.
import { newGame, act } from "./shared/rules.js";
import { botStep, STYLE_KEYS } from "./shared/bot.js";
import { HULL_KEYS, PACES, freeLook, BOT_NAMES } from "./shared/looks.js";
export { PACES };
import { mulberry32 } from "./shared/map.js";
import { EMOTES, botEmotes } from "./shared/emotes.js";
import { fogActive, maskBoard, maskEvents, totals } from "./shared/fog.js";


export class LocalRoom {
  // opts: {bots, mode, targetPct, pace, watch (computer-only game)}; me: {name, main, sub, hull, style}
  constructor(map, opts, me) {
    this.map = map; this.listeners = []; this.timer = 0; this.rev = 0; this.log = [];
    const seed = (Math.random() * 2 ** 31) | 0; let k = 0; this.rng = () => mulberry32(seed ^ Math.imul(++k, 0x9E3779B1))();
    this.pace = PACES[opts.pace] ? opts.pace : "normal"; this.fog = !!opts.fog;
    const seats = [];
    if (!opts.watch) seats.push({ id: "me", name: me.name || "Stellarch", main: me.main, sub: me.sub, hull: me.hull, style: me.style || "balanced", ai: false, away: false, online: true });
    const bots = Math.max(1, Math.min(15, opts.bots | 0));
    for (let b = 0; b < bots + (opts.watch ? 1 : 0); b++) {
      const f = freeLook(seats);
      seats.push({ id: "ai_" + b, name: BOT_NAMES[b], main: f.main, sub: f.sub, hull: HULL_KEYS[(b + 1) % 5], style: STYLE_KEYS[b % STYLE_KEYS.length], ai: true, away: false, online: true });
    }
    this.seats = seats;
    this.g = newGame(map, { mode: opts.mode, targetPct: opts.targetPct, seats }, this.rng);
    this.say("The war begins");
    setTimeout(() => { this.emit({ t: "welcome", seat: opts.watch ? null : "me", token: null, creator: true }); this.commit([]); }, 0);
  }
  on(fn) { this.listeners.push(fn); }
  emit(m) { for (const f of this.listeners) f(m); }
  say(text) { this.log.push({ text, t: Date.now() }); if (this.log.length > 40) this.log.shift(); }
  close() { clearTimeout(this.timer); this.listeners = []; }
  send(m) {
    const g = this.g, me = this.seats.findIndex(s => s.id === "me");
    if (m.t === "pace" && PACES[m.pace]) { this.pace = m.pace; return this.commit([]); }
    if (m.t === "emote" && EMOTES.includes(m.e) && me >= 0) { this.emit({ t: "emote", seat: "me", e: m.e }); return; }
    if (m.t === "away") { if (me >= 0) { this.seats[me].away = !!m.on; this.g.seats = this.seats; } return this.commit([]); }
    if (m.t !== "intent" || me < 0) return;
    if (this.seats[me].away) this.seats[me].away = false;
    const r = act(this.map, g, me, m.intent, this.rng);
    if (!r.ok) return this.emit({ t: "error", error: r.error });
    this.commit(r.events);
  }
  commit(events) {
    for (const b of botEmotes(events, this.seats, this.rng)) setTimeout(() => this.emit({ t: "emote", seat: this.seats[b.seat].id, e: b.e }), 400 + this.rng() * 900);
    this.rev++;
    for (const e of events) {
      if (e.t === "elim") this.say(`${this.seats[e.seat].name} was wiped out by ${this.seats[e.by].name}`);
      if (e.t === "win") this.say(`${this.seats[e.seat].name} wins with ${e.systems} suns`);
    }
    // under fog of war the page only gets what the human seat can see (same rules as the room server)
    const me = this.seats.findIndex(s => s.id === "me"), g = this.g;
    let game = g, evs = events;
    if (fogActive(g, me, this.fog)) {
      const v = maskBoard(this.map, g, me);
      game = { ...g, owner: v.owner, armies: v.armies, totals: totals(g), fog: true, lastRoll: g.lastRoll && !(v.vis[g.lastRoll.from] || v.vis[g.lastRoll.to]) ? null : g.lastRoll };
      evs = maskEvents(events, v.vis);
    } else game = { ...g, totals: totals(g), fog: !!this.fog };
    this.emit({ t: "state", rev: this.rev, code: null, local: true, status: g.status === "over" ? "over" : "playing", opts: { pace: this.pace, fog: !!this.fog },
                seats: this.seats.map(s => ({ ...s })), game, events: evs, log: this.log.slice(-20), deadline: 0, warnAt: 0, now: Date.now() });
    clearTimeout(this.timer);
    const k = this.g.turn, st = this.seats[k];
    if (this.g.status === "playing" && (st.ai || st.away)) this.timer = setTimeout(() => this.aiMove(), PACES[this.pace]);
  }
  aiMove() {
    const k = this.g.turn, r = botStep(this.map, this.g, k, this.seats[k].style, this.rng);   // never stalls
    this.commit(r.ok ? r.events : []);
  }
}
