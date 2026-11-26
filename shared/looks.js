// Player looks shared by the room server, solo play and the page: the neon palette, AI names,
// hull keys (the 3D shapes live in client/scene.js) and the AI speed presets.
export const PALETTE = ["#ff4d5a", "#3e9bff", "#f5d90a", "#3fcf6a", "#b06bff", "#ff8a2a", "#22d3c5", "#ff6fb5", "#9dff3a", "#ffffff", "#5b6bff", "#ff3df2", "#00e5ff", "#ffb3a7", "#c9a227", "#7cffc4"];
export const PSUB = ["#ffe066", "#ffffff", "#ff4d5a", "#0b0f18", "#3fcf6a", "#3e9bff", "#ff6fb5", "#22d3c5", "#b06bff", "#ff4d5a", "#f5d90a", "#ffffff", "#ff8a2a", "#3e9bff", "#0b0f18", "#b06bff"];
export const BOT_NAMES = ["Unit Ceres", "Overmind Vega", "Captain Null", "Admiral Byte", "Warden Kepler", "The Archivist", "Marshal Orbit", "Sentinel Nine", "Lady Parsec", "Echo Prime", "Count Quasar", "Vector Seven", "Doctor Nebula", "Baron Redshift", "Queen Corona", "Pilot Zero"];
export const HULL_KEYS = ["triangle", "brick", "tube", "orb", "saucer"];
export const PACES = { slow: 900, normal: 450, fast: 150, instant: 25 };   // ms between computer moves
export const HEX = /^#[0-9a-fA-F]{6}$/;

// the first palette colour nobody at the table has yet (with its matching highlight)
export function freeLook(seats) {
  const used = new Set(seats.map(x => (x.main || "").toLowerCase())), k = PALETTE.findIndex(c => !used.has(c.toLowerCase()));
  const i = k < 0 ? seats.length % PALETTE.length : k; return { main: PALETTE[i], sub: PSUB[i] };
}
// the first AI name not yet taken
export const botName = seats => { const used = new Set(seats.map(x => x.name)); return BOT_NAMES.find(b => !used.has(b)) || "Bot " + (seats.length + 1); };
