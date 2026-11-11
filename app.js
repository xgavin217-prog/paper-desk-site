"use strict";
// Static mode: reads state.json / chart.json / activity.json published next to this page. Read-only; no login, no push.
const $ = (id) => document.getElementById(id);
const fmt = (n) => "$" + Number(n).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const ago = (t) => { if (!t) return "never"; const s = Math.max(0, Math.round(Date.now() / 1000 - t)); return s < 60 ? s + "s ago" : s < 3600 ? Math.round(s / 60) + "m ago" : Math.round(s / 3600) + "h ago"; };
const STALE_S = 25 * 60;  // publisher cadence is ~10 min; older than 25 min = stale

async function getJSON(name) {
  const r = await fetch(name + "?t=" + Date.now(), {cache: "no-store"});
  if (!r.ok) throw new Error(name + " " + r.status);
  return r.json();
}

function drawChart(points, start) {
  const c = $("chart"), g = c.getContext("2d"), W = c.width, H = c.height, pad = 28;
  g.clearRect(0, 0, W, H);
  const ys = points.map((p) => p.equity_usd).concat([start]);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < 1) { lo -= 5; hi += 5; }
  const xs = points.map((p) => p.ts), x0 = Math.min(...xs), x1 = Math.max(...xs, x0 + 1);
  const X = (t) => pad + (W - 2 * pad) * (t - x0) / (x1 - x0), Y = (v) => H - pad - (H - 2 * pad) * (v - lo) / (hi - lo);
  g.strokeStyle = "#222a3b"; g.fillStyle = "#8a93a6"; g.font = "18px sans-serif"; g.lineWidth = 1;
  for (let i = 0; i <= 3; i++) { const v = lo + (hi - lo) * i / 3, y = Y(v); g.beginPath(); g.moveTo(pad, y); g.lineTo(W - pad, y); g.stroke(); g.fillText(v.toFixed(0), 2, y - 3); }
  g.setLineDash([6, 6]); g.strokeStyle = "#8a93a6"; g.beginPath(); g.moveTo(pad, Y(start)); g.lineTo(W - pad, Y(start)); g.stroke(); g.setLineDash([]);
  g.strokeStyle = "#7c5cff"; g.lineWidth = 3; g.beginPath();
  points.forEach((p, i) => { const x = points.length === 1 ? W / 2 : X(p.ts), y = Y(p.equity_usd); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.stroke();
  const last = points[points.length - 1];
  g.fillStyle = "#7c5cff"; g.beginPath(); g.arc(points.length === 1 ? W / 2 : X(last.ts), Y(last.equity_usd), 6, 0, 7); g.fill();
}

async function refresh() {
  try {
    const [s, e, a] = await Promise.all([getJSON("state.json"), getJSON("chart.json"), getJSON("activity.json")]);
    $("bal").textContent = fmt(s.paper.equity_usd);
    $("pnl").textContent = (s.paper.pnl_usd >= 0 ? "+" : "") + fmt(s.paper.pnl_usd);
    $("start").textContent = fmt(s.paper.start_usd);
    $("note").textContent = s.paper.note;
    const age = Date.now() / 1000 - s.generated_at;
    $("dot").className = "dot " + (age < STALE_S ? "ok" : "bad");
    $("hb").textContent = (age < STALE_S ? "snapshot " : "STALE snapshot ") + ago(s.generated_at);
    $("agents").innerHTML = s.agents.map((x) => `<li><span>${esc(x.name)}</span><span class="muted">${esc(x.status.replace("_", " "))}</span></li>`).join("");
    $("pos").textContent = s.positions.length ? s.positions.map((p) => p.symbol).join(", ") : "None";
    $("events").innerHTML = a.events.map((v) => `<li><span>${esc(v.msg)}</span><span class="muted">${ago(v.ts)}</span></li>`).join("") || "<li>None</li>";
    drawChart(e.points, e.start_usd);
  } catch (err) { $("dot").className = "dot bad"; $("hb").textContent = "can't load snapshot"; }
}
refresh();
setInterval(refresh, 60000);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
