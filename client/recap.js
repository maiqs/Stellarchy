// "While you waited" (player wish, round 38): the game moves at the room's pace, so instead of slowing it for
// everyone, each player gets a recap of what happened to them since their last turn, with a tap to fly to each sun.
// Pure functions, so the tests can run them without a page.

// note one event if it matters to seat k (attacks on k, knock-outs, broken truces)
export function noteEvent(list, e, k) {
  if (k < 0) return list;
  if (e.t === "bt" && e.d === k) list.push({ t: "hit", sun: e.to, by: e.a, cap: !!e.cap, lost: e.ld || 0, killed: e.la || 0 });
  else if (e.t === "elim" && e.seat !== k && e.by !== k) list.push({ t: "out", seat: e.seat, by: e.by });
  else if (e.t === "truceBroken" && e.with === k) list.push({ t: "broke", by: e.by });
  return list;
}

// fold the notes into: suns lost (still not ours now), suns held, ships lost and destroyed, and the other news
export function summarise(list, owner, k) {
  const suns = new Map();
  for (const n of list) if (n.t === "hit") {
    const s = suns.get(n.sun) || { sun: n.sun, by: n.by, hits: 0, lost: 0, killed: 0, taken: false };
    s.hits++; s.lost += n.lost; s.killed += n.killed; s.by = n.by; if (n.cap) s.taken = true; suns.set(n.sun, s);
  }
  const all = [...suns.values()];
  const lost = all.filter(s => owner[s.sun] !== k), held = all.filter(s => owner[s.sun] === k);
  return {
    lost, held,
    shipsLost: all.reduce((a, s) => a + s.lost, 0), shipsKilled: all.reduce((a, s) => a + s.killed, 0),
    news: list.filter(n => n.t === "out" || n.t === "broke"),
    any: list.length > 0,
  };
}

// the one-line headline for the bar
export function recapLine(sum) {
  if (!sum || !sum.any) return "";
  const parts = [];
  if (sum.lost.length) parts.push(`lost ${sum.lost.length} sun${sum.lost.length === 1 ? "" : "s"}`);
  if (sum.held.length) parts.push(`held ${sum.held.length}`);
  if (!parts.length && sum.news.length) parts.push(`${sum.news.length} piece${sum.news.length === 1 ? "" : "s"} of news`);
  return parts.length ? `While you waited: ${parts.join(" · ")}` : "";
}
