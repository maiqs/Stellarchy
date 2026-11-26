// Results screen pieces: the suns-held chart and the war's best moments. Pure functions of the game and a
// small view object {seats, n, lookOf, nameOf, sunName}, so they don't depend on the page's state.
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function historyChart(g, v) {
  const s = g.hist && g.hist.samples; if (!s || s.length < 2) return "";
  const W = 560, H = 200, P = 6, x = i => P + (W - 2 * P) * i / (s.length - 1), y = val => H - P - (H - 2 * P) * val / v.n;
  const lines = v.seats.map((_, j) => `<polyline points="${s.map((p, i) => `${x(i).toFixed(1)},${y(p.held[j]).toFixed(1)}`).join(" ")}" style="--lc:${esc(v.lookOf(j).main)}" class="${j === g.winner ? "lead" : ""}"/>`).join("");
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Suns held by each player over the game">
    <line x1="${P}" y1="${y(v.n / 2)}" x2="${W - P}" y2="${y(v.n / 2)}" class="grid"/>${lines}</svg>
    <figcaption><span>Turn 1</span><span>Suns held</span><span>Turn ${g.turnNo}</span></figcaption></figure>`;
}

export function highlights(g, v) {
  const out = [], name = k => `<b style="color:${esc(v.lookOf(k).main)}">${esc(v.nameOf(k))}</b>`;
  if (g.best) {   // the biggest single battle
    let k = -1; g.best.forEach((b, j) => { if (b && (k < 0 || b.ld > g.best[k].ld)) k = j; });
    if (k >= 0) { const b = g.best[k]; out.push(`<li><span>💥</span><span>Biggest battle: ${name(k)} destroyed <b>${b.ld}</b> ships at ${esc(v.sunName(b.to))}${b.cap ? " and took it" : ""} (turn ${b.turn}).</span></li>`); }
  }
  if (g.kos) { const top = Math.max(...g.kos); if (top > 0) { const k = g.kos.indexOf(top); out.push(`<li><span>☠</span><span>Most knock-outs: ${name(k)}, ${top} player${top === 1 ? "" : "s"}.</span></li>`); } }
  const s = g.hist && g.hist.samples;   // the strongest runner-up, at their peak
  if (s && s.length > 2) {
    let k = -1, peak = 0, turn = 0;
    v.seats.forEach((_, j) => { if (j === g.winner) return; s.forEach(p => { if (p.held[j] > peak) { peak = p.held[j]; k = j; turn = p.turn; } }); });
    if (k >= 0) out.push(`<li><span>📈</span><span>Closest rival: ${name(k)} held <b>${peak}</b> suns at turn ${turn}.</span></li>`);
  }
  return out.length ? `<ul class="moments">${out.join("")}</ul>` : "";
}

// fairness: your own dice against a fair die's average (3.5), so "the dice cheat" can be checked
export function diceLine(g, me) {
  const d = g.dice && me >= 0 && g.dice[me]; if (!d || d.n < 10) return "";
  const avg = d.sum / d.n;
  return `<p class="hint">🎲 Your dice: ${d.n} rolled, averaging <b>${avg.toFixed(2)}</b> (a fair die averages 3.50). ${Math.abs(avg - 3.5) < .15 ? "Right on the odds." : avg > 3.5 ? "Luck was with you." : "Luck was against you this time."}</p>`;
}
