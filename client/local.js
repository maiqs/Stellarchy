// Solo play with no server: a stand-in for the room that speaks the same messages
// ("welcome", "state", "error"), so the game screen cannot tell the difference.
import { newGame, act } from "./shared/rules.js";
import { botIntent, STYLE_KEYS } from "./shared/bot.js";
import { mulberry32 } from "./shared/map.js";
import { EMOTES, botEmotes } from "./shared/emotes.js";

const PALETTE = ["#ff4d5a", "#3e9bff", "#f5d90a", "#3fcf6a", "#b06bff", "#ff8a2a", "#22d3c5", "#ff6fb5", "#9dff3a", "#ffffff", "#5b6bff", "#ff3df2", "#00e5ff", "#ffb3a7", "#c9a227", "#7cffc4"];
const PSUB = ["#ffe066", "#ffffff", "#ff4d5a", "#0b0f18", "#3fcf6a", "#3e9bff", "#ff6fb5", "#22d3c5", "#b06bff", "#ff4d5a", "#f5d90a", "#ffffff", "#ff8a2a", "#3e9bff", "#0b0f18", "#b06bff"];
const BOT_NAMES = ["Unit Ceres", "Overmind Vega", "Captain Null", "Admiral Byte", "Warden Kepler", "The Archivist", "Marshal Orbit", "Sentinel Nine", "Lady Parsec", "Echo Prime", "Count Quasar", "Vector Seven", "Doctor Nebula", "Baron Redshift", "Queen Corona"];
const HULLS = ["triangle", "brick", "tube", "orb", "saucer"];
export const PACES = { slow: 900, normal: 450, fast: 150, instant: 25 };

export class LocalRoom {
  // opts: {bots, mode, targetPct, pace, watch (computer-only game)}; me: {name, main, sub, hull, style}
  constructor(map, opts, me) {
    this.map = map; this.listeners = []; this.timer = 0; this.rev = 0; this.log = [];
    const seed = (Math.random() * 2 ** 31) | 0; let k = 0; this.rng = () => mulberry32(seed ^ Math.imul(++k, 0x9E3779B1))();
    this.pace = PACES[opts.pace] ? opts.pace : "normal";
    const seats = [];
    if (!opts.watch) seats.push({ id: "me", name: me.name || "Stellarch", main: me.main, sub: me.sub, hull: me.hull, style: me.style || "balanced", ai: false, away: false, online: true });
    const used = new Set(seats.map(s => s.main.toLowerCase()));
    const bots = Math.max(1, Math.min(15, opts.bots | 0));
    for (let b = 0; b < bots + (opts.watch ? 1 : 0); b++) {
      const c = PALETTE.findIndex(x => !used.has(x.toLowerCase())); used.add(PALETTE[c].toLowerCase());
      seats.push({ id: "ai_" + b, name: BOT_NAMES[b], main: PALETTE[c], sub: PSUB[c], hull: HULLS[(b + 1) % 5], style: STYLE_KEYS[b % STYLE_KEYS.length], ai: true, away: false, online: true });
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
    this.emit({ t: "state", rev: this.rev, code: null, local: true, status: this.g.status === "over" ? "over" : "playing", opts: { pace: this.pace },
                seats: this.seats.map(s => ({ ...s })), game: this.g, events, log: this.log.slice(-20), deadline: 0, warnAt: 0, now: Date.now() });
    clearTimeout(this.timer);
    const k = this.g.turn, st = this.seats[k];
    if (this.g.status === "playing" && (st.ai || st.away)) this.timer = setTimeout(() => this.botStep(), PACES[this.pace]);
  }
  botStep() {
    const g = this.g, k = g.turn;
    const it = botIntent(this.map, g, k, this.seats[k].style, this.rng);
    let r = it ? act(this.map, g, k, it, this.rng) : { ok: false };
    if (!r.ok) r = act(this.map, g, k, g.advance ? { t: "advance", n: 0 } : g.phase === "attack" ? { t: "endAttack" } : { t: "endTurn" }, this.rng);
    this.commit(r.ok ? r.events : []);
  }
}
