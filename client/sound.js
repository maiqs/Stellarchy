// Stellarchy sound: small synthesised cues (no audio files, so nothing to license). Quiet by design.
// Browsers only allow sound after the player has clicked or tapped, so the context wakes on the first gesture.
let ctx = null, master = null, on = true, lastLaser = 0;
function wake() {
  if (ctx) { if (ctx.state === "suspended") ctx.resume(); return true; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
  ctx = new AC(); master = ctx.createGain(); master.gain.value = .16; master.connect(ctx.destination); return true;
}
addEventListener("pointerdown", () => on && wake(), { passive: true });

function tone(freq, start, dur, { type = "sine", vol = 1, slide = 0 } = {}) {
  const t = ctx.currentTime + start, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02);
}
const play = fn => { if (!on || !ctx || ctx.state !== "running") return; try { fn(); } catch (e) {} };

export const sound = {
  setOn(v) { on = !!v; if (on) wake(); },
  get on() { return on; },
  turn: () => play(() => { tone(660, 0, .18, { vol: .7 }); tone(990, .12, .3, { vol: .6 }); }),   // your turn
  laser: () => { const now = performance.now(); if (now - lastLaser < 140) return; lastLaser = now; play(() => tone(1400, 0, .14, { type: "sawtooth", vol: .25, slide: .25 })); },
  capture: () => play(() => { tone(520, 0, .12, { type: "triangle", vol: .6 }); tone(780, .08, .2, { type: "triangle", vol: .55 }); }),
  lost: () => play(() => tone(220, 0, .25, { type: "triangle", vol: .5, slide: .6 })),
  out: () => play(() => { tone(110, 0, .6, { vol: .9, slide: .5 }); tone(82, .05, .7, { type: "triangle", vol: .5 }); }),
  win: () => play(() => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * .14, .5, { type: "triangle", vol: .55 }))),
};
