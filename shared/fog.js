// Fog of war (a room option; a Warzone staple players asked for): you see your own suns and their
// neighbours, nothing else. Used by the room server and by solo play, so both hide the same things.
export const FOGGED = -2;   // owner value for a sun the viewer cannot see

// whether this viewer sees through the fog right now: fog is off while home suns are chosen and once
// the game is over, and players who are out (and watchers) see everything
export function fogActive(g, seat, fog) {
  return !!fog && g && g.status === "playing" && g.phase !== "setup" && seat >= 0 && g.alive[seat];
}

// which suns the seat can see
export function visibleTo(map, g, seat) {
  const vis = new Uint8Array(map.n);
  for (let i = 0; i < map.n; i++) if (g.owner[i] === seat) { vis[i] = 1; for (const j of map.adj[i]) vis[j] = 1; }
  return vis;
}

// the board as this seat sees it
export function maskBoard(map, g, seat) {
  const vis = visibleTo(map, g, seat);
  return { vis, owner: g.owner.map((o, i) => vis[i] ? o : FOGGED), armies: g.armies.map((a, i) => vis[i] ? a : 0) };
}

// only the events this seat could have seen (a battle shows if either end is visible)
export function maskEvents(events, vis) {
  return events.filter(e => {
    if (e.t === "bt" || e.t === "mv") return vis[e.from] || vis[e.to];
    if (e.t === "rf" || e.t === "hq") return vis[e.s];
    return true;
  });
}

// suns held and ships per seat, which the players panel shows even under fog
export const totals = g => g.seats.map((_, k) => { let held = 0, ships = 0; for (let i = 0; i < g.owner.length; i++) if (g.owner[i] === k) { held++; ships += g.armies[i]; } return { held, ships }; });
