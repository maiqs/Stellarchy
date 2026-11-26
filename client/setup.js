// Shareable setups: which settings a setup link may carry, and reading them back safely.
// Pure (no page state), so tests can check that a link cannot smuggle anything else in.
export const SETUP_KEYS = { aiLevel: "s", size: "n", centre: "s", mode: "s", targetPct: "n", fog: "b", cards: "s", hqArmies: "n", flagships: "b", bots: "n", maxSeats: "n", timer: "n", public: "b", pace: "s" };
// only known keys, with the right kind of value; the dialogs check the values themselves
export function readSetup(p) {
  const o = {};
  for (const [k, t] of Object.entries(SETUP_KEYS)) {
    const v = p.get(k); if (v === null || v.length > 40) continue;
    if (t === "n" && /^\d+$/.test(v)) o[k] = +v; else if (t === "b" && (v === "true" || v === "false")) o[k] = v === "true"; else if (t === "s" && /^[\w '’-]+$/.test(v)) o[k] = v;
  }
  return o;
}

// the link for a set of settings (kind: "solo" or "room")
export function setupLink(origin, kind, o) {
  const p = new URLSearchParams({ play: kind });
  for (const k in SETUP_KEYS) if (o[k] !== undefined) p.set(k, String(o[k]));
  return `${origin}/?${p}`;
}
