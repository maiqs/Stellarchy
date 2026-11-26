// Quick chat: preset lines and emoji only, so there is no free text to moderate (a player wish).
export const EMOTES = ["gg", "nice", "wow", "oops", "thanks", "hurry", "truce?", "betrayal!", "👋", "😂", "😱", "🔥", "🤝", "💀"];

// computer players react now and then, so a room full of AI still feels alive
const pick = (a, rng) => a[Math.floor(rng() * a.length)];
export function botEmotes(events, seats, rng) {
  const out = [], isBot = k => seats[k] && (seats[k].ai || seats[k].away);
  for (const e of events) {
    if (e.t === "elim") {
      if (isBot(e.seat) && rng() < .7) out.push({ seat: e.seat, e: pick(["gg", "💀", "😱"], rng) });
      if (isBot(e.by) && rng() < .4) out.push({ seat: e.by, e: pick(["🔥", "nice", "gg"], rng) });
    } else if (e.t === "hqTaken") {
      if (isBot(e.from) && rng() < .5) out.push({ seat: e.from, e: pick(["betrayal!", "😱", "oops"], rng) });
    } else if (e.t === "win" && isBot(e.seat) && rng() < .8) out.push({ seat: e.seat, e: pick(["gg", "🔥", "thanks"], rng) });
    else if (e.t === "bt" && e.cap && e.d >= 0 && e.ld >= 10 && isBot(e.d) && rng() < .15) out.push({ seat: e.d, e: pick(["wow", "oops", "😱"], rng) });
  }
  return out.slice(0, 2);
}
