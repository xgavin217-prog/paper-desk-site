"use strict";
// Static snapshot app (hosting option B). Reads the JSON files the desk publishes; read-only.
// Settings / pause / mode cannot be changed from a static page: those controls are shown as "change via Telegram".
// FOMO links are never built here: every URL comes from the published JSON (made by links.py on the desk).
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const money = (n, d = 2) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", {minimumFractionDigits: d, maximumFractionDigits: d});
const num = (n, d = 2) => Number(n).toLocaleString("en-US", {minimumFractionDigits: d, maximumFractionDigits: d});
const px = (p) => (p == null ? "—" : p >= 1 ? p.toFixed(4) : p >= 0.01 ? p.toFixed(5) : Number(p).toPrecision(4));
const TZ = "America/Los_Angeles";
const tfmt = (ts) => new Date(ts * 1000).toLocaleTimeString("en-US", {timeZone: TZ, hour: "numeric", minute: "2-digit"});
const ago = (ts) => { if (!ts) return "never"; const s = Math.max(0, Math.round(Date.now() / 1000 - ts)); return s < 60 ? s + "s ago" : s < 3600 ? Math.round(s / 60) + "m ago" : s < 86400 ? Math.round(s / 3600) + "h ago" : Math.round(s / 86400) + "d ago"; };
const STALE_S = 25 * 60;
const FILES = ["state", "chart", "activity", "account", "settings", "agents", "coins"];
let D = {}, range = "1D", tab = "home";
const DPR = () => window.devicePixelRatio || 1;

async function load() {
  const r = await Promise.all(FILES.map((f) => fetch(f + ".json?t=" + Date.now(), {cache: "no-store"}).then((x) => { if (!x.ok) throw new Error(f); return x.json(); })));
  FILES.forEach((f, i) => (D[f] = r[i]));
}

function setup(canvas, h) {
  const w = canvas.clientWidth || 340, d = DPR();
  canvas.width = Math.round(w * d); canvas.height = Math.round(h * d); canvas.style.height = h + "px";
  const g = canvas.getContext("2d"); g.setTransform(d, 0, 0, d, 0, 0);
  return [g, w, h];
}

// ---------- odometer
function odometer(el, text) {
  const old = el.dataset.v; el.dataset.v = text;
  if (old === text) return;
  el.innerHTML = "";
  [...text].forEach((ch) => {
    if (/\d/.test(ch)) {
      const c = document.createElement("span"); c.className = "odo-c";
      const s = document.createElement("span");
      s.innerHTML = "0123456789".split("").join("<br>");
      c.appendChild(s); el.appendChild(c);
      s.style.transform = "translateY(0)";
      requestAnimationFrame(() => requestAnimationFrame(() => { s.style.transform = `translateY(${-66 * Number(ch)}px)`; }));
    } else { const s = document.createElement("span"); s.className = "odo-s"; s.textContent = ch; el.appendChild(s); }
  });
}

// ---------- charts
const RANGES = {LIVE: 1800, "1H": 3600, "4H": 14400, "1D": 86400, "1W": 604800, ALL: Infinity};
function drawEquity(canvas) {
  const [g, W, H] = setup(canvas, 220), now = Date.now() / 1000;
  const span = RANGES[range];
  let pts = D.chart.points.filter((p) => span === Infinity || p.ts >= now - span);
  if (pts.length < D.chart.points.length && pts.length) { const prev = D.chart.points.filter((p) => p.ts < now - span).pop(); if (prev) pts = [{ts: now - span, equity_usd: prev.equity_usd}, ...pts]; }
  g.clearRect(0, 0, W, H);
  if (!pts.length) { g.fillStyle = "#8e8e93"; g.font = "14px " + getComputedStyle(document.body).fontFamily; g.textAlign = "center"; g.fillText("No balance data in this range", W / 2, H / 2); return; }
  const start = D.chart.start_usd, last = pts[pts.length - 1];
  const x0 = span === Infinity ? pts[0].ts : now - span, x1 = Math.max(now, last.ts);
  const ys = pts.map((p) => p.equity_usd).concat([start]);
  let lo = Math.min(...ys), hi = Math.max(...ys); const padv = Math.max((hi - lo) * 0.2, 0.5); lo -= padv; hi += padv;
  const L = 6, R = 6, T = 26, B = 16;
  const X = (t) => L + (W - L - R) * (t - x0) / Math.max(1, x1 - x0), Y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  g.strokeStyle = "rgba(84,84,88,.55)"; g.setLineDash([3, 5]); g.lineWidth = 1; g.beginPath(); g.moveTo(L, Y(start)); g.lineTo(W - R, Y(start)); g.stroke(); g.setLineDash([]);
  const path = () => { g.beginPath(); g.moveTo(X(pts[0].ts), Y(pts[0].equity_usd)); pts.forEach((p, i) => { if (i) { g.lineTo(X(p.ts), Y(pts[i - 1].equity_usd)); g.lineTo(X(p.ts), Y(p.equity_usd)); } }); g.lineTo(X(x1), Y(last.equity_usd)); };
  path(); g.lineTo(X(x1), H - B); g.lineTo(X(pts[0].ts), H - B); g.closePath();
  const gr = g.createLinearGradient(0, T, 0, H - B); gr.addColorStop(0, "rgba(0,211,90,.28)"); gr.addColorStop(1, "rgba(0,211,90,0)"); g.fillStyle = gr; g.fill();
  path(); g.strokeStyle = "#00d35a"; g.lineWidth = 2.5; g.lineJoin = "round"; g.stroke();
  g.fillStyle = "#00d35a"; g.beginPath(); g.arc(X(x1), Y(last.equity_usd), 4, 0, 7); g.fill();
  // marks: Bought (blue), +$N (green), -stop% · -$N (red)
  const col = {buy: "#0a84ff", win: "#00d35a", loss: "#ff453a"}; g.font = "600 11px " + getComputedStyle(document.body).fontFamily; g.textAlign = "center";
  const used = [];
  D.chart.marks.filter((m) => m.ts >= x0 && m.ts <= x1).forEach((m) => {
    const eqAt = (() => { let v = pts[0].equity_usd; pts.forEach((p) => { if (p.ts <= m.ts + 1) v = p.equity_usd; }); return v; })();
    let x = Math.min(Math.max(X(m.ts), 40), W - 40), y = Y(eqAt), ty = y - 12;
    while (used.some((u) => Math.abs(u[0] - x) < 70 && Math.abs(u[1] - ty) < 14)) ty -= 14;
    if (ty < 10) ty = y + 20 + (used.length % 3) * 14; used.push([x, ty]);
    g.fillStyle = col[m.kind]; g.beginPath(); g.arc(X(m.ts), y, 4.5, 0, 7); g.fill(); g.fillText(m.label, x, ty);
  });
}

function drawCandles(canvas, coin) {
  const [g, W, H] = setup(canvas, 280), cs = coin.candles.candles;
  g.clearRect(0, 0, W, H);
  const font = getComputedStyle(document.body).fontFamily;
  if (cs.length < 2) { g.fillStyle = "#8e8e93"; g.font = "14px " + font; g.textAlign = "center"; g.fillText(`Not enough price samples yet (${coin.candles.samples})`, W / 2, H / 2); return; }
  const pos = coin.position && !coin.position.closed ? coin.position : null;
  const vals = cs.flatMap((c) => [c.h, c.l]); if (pos && pos.stop_price) vals.push(pos.stop_price);
  let lo = Math.min(...vals), hi = Math.max(...vals); const pv = (hi - lo || hi * 0.01) * 0.12; lo -= pv; hi += pv;
  const volH = 50, T = 8, B = 18, L = 4, R = 54, ph = H - T - B - volH - 6;
  const Y = (v) => T + ph * (1 - (v - lo) / (hi - lo)), cw = (W - L - R) / cs.length, vmax = Math.max(...cs.map((c) => c.v), 1);
  g.strokeStyle = "rgba(84,84,88,.35)"; g.lineWidth = 1; g.fillStyle = "#8e8e93"; g.font = "10px " + font; g.textAlign = "left";
  for (let i = 0; i <= 3; i++) { const v = lo + (hi - lo) * i / 3, y = Y(v); g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke(); g.fillText(px(v), W - R + 4, y + 3); }
  cs.forEach((c, i) => {
    const x = L + cw * i + cw / 2, up = c.c >= c.o, col = up ? "#00d35a" : "#ff453a";
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, Y(c.h)); g.lineTo(x, Y(c.l)); g.stroke();
    const bt = Y(Math.max(c.o, c.c)), bh = Math.max(1.5, Math.abs(Y(c.o) - Y(c.c))); g.fillRect(x - cw * 0.34, bt, cw * 0.68, bh);
    g.globalAlpha = 0.45; const vh = volH * c.v / vmax; g.fillRect(x - cw * 0.34, H - B - vh, cw * 0.68, vh); g.globalAlpha = 1;
  });
  if (pos && pos.stop_price) {
    const y = Y(pos.stop_price); g.strokeStyle = "#ff9f0a"; g.lineWidth = 1.6; g.setLineDash([6, 5]); g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke(); g.setLineDash([]);
    g.fillStyle = "#ff9f0a"; g.font = "600 11px " + font; g.textAlign = "left"; g.fillText("Risk trailing stop", L + 4, y - 5);
  }
  g.fillStyle = "#8e8e93"; g.font = "10px " + font; g.textAlign = "left"; g.fillText(tfmt(cs[0].t), L, H - 4); g.textAlign = "right"; g.fillText(tfmt(cs[cs.length - 1].t), W - R, H - 4);
}

// ---------- auditor discs
let anim = null;
function drawDiscs(canvas, layers, animate) {
  cancelAnimationFrame(anim);
  const [g, W, H] = setup(canvas, 300), cx = W / 2, rx = 92, ry = 20, th = 13, gap = 33, top = 40;
  const checked = layers.findIndex((l) => l.status === "grey"); const nChecked = checked === -1 ? 8 : checked;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; const t0 = performance.now(), per = 380;
  const font = getComputedStyle(document.body).fontFamily;
  const frame = (now) => {
    const prog = animate && !reduce ? Math.min((now - t0) / per, nChecked + 0.4) : nChecked + 1; // beam position in layers
    g.clearRect(0, 0, W, H);
    for (let i = 7; i >= 0; i--) {
      const y = top + i * gap, l = layers[i], read = i < prog;
      const st = read ? l.status : "grey";
      const fill = st === "green" ? "#0c4a26" : st === "red" ? "#5a1814" : "#2c2c2e", edge = st === "green" ? "#00d35a" : st === "red" ? "#ff453a" : "#48484a";
      g.fillStyle = fill; g.beginPath(); g.ellipse(cx, y + th, rx, ry, 0, 0, Math.PI); g.lineTo(cx - rx, y); g.ellipse(cx, y, rx, ry, 0, Math.PI, 0, true); g.closePath(); g.fill();
      g.strokeStyle = edge; g.lineWidth = 1.5; g.beginPath(); g.ellipse(cx, y + th, rx, ry, 0, 0, Math.PI); g.stroke();
      g.beginPath(); g.moveTo(cx - rx, y); g.lineTo(cx - rx, y + th); g.moveTo(cx + rx, y); g.lineTo(cx + rx, y + th); g.stroke();
      g.fillStyle = "#3a3a3c"; if (st === "green") g.fillStyle = "#12622f"; if (st === "red") g.fillStyle = "#7a2019";
      g.beginPath(); g.ellipse(cx, y, rx, ry, 0, 0, 7); g.fill(); g.strokeStyle = edge; g.stroke();
      g.fillStyle = st === "grey" ? "#8e8e93" : "#fff"; g.font = "700 12px " + font; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(read && st !== "grey" ? (st === "green" ? "✓" : "✕") : String(i + 1), cx, y + 1);
      g.textAlign = "left"; g.fillStyle = "#8e8e93"; g.font = "11px " + font; g.fillText(layers[i].name, cx + rx + 8 > W - 90 ? cx + rx - 150 : cx + rx + 8, y + 1);
    }
    g.textBaseline = "alphabetic";
    if (animate && !reduce && prog < nChecked + 0.4) { // cyan beam reading each layer
      const by = top + Math.min(prog, 7.4) * gap; g.fillStyle = "rgba(100,210,255,.16)"; g.fillRect(cx - rx, 10, rx * 2, by - 10);
      g.strokeStyle = "#64d2ff"; g.lineWidth = 2; g.beginPath(); g.ellipse(cx, by, rx + 6, ry + 3, 0, 0, 7); g.stroke();
      anim = requestAnimationFrame(frame);
    }
  };
  frame(performance.now());
}

// ---------- views
function dotCls(s) { return s === "running" ? "run" : s === "paused" ? "paused" : s === "error" ? "err" : ""; }
function evRow(e) { const href = e.mint && D.coins.coins[e.mint] ? ` href="#coin/${e.mint}"` : ""; return `<a class="ev"${href}><div class="m">${esc(e.msg)}</div><div class="tm">${tfmt(e.ts)}</div></a>`; }

function viewHome() {
  const s = D.state, p = s.paper, run = s.agents.filter((a) => a.status === "running").length, age = Date.now() / 1000 - s.generated_at;
  const up = p.today_pct >= 0;
  $("#view").innerHTML = `
  <div class="top"><span>FOMO Desk</span><span><span class="dot ${age < STALE_S ? "run" : "err"}"></span>${age < STALE_S ? "snapshot " : "STALE snapshot "}${ago(s.generated_at)}</span></div>
  <div class="balrow"><div class="bal" id="bal"></div><span class="pill org">PAPER</span></div>
  <div class="chg"><span class="${up ? "up" : "dn"}">${up ? "+" : ""}${num(p.today_pct)}% today</span><span class="pill ${p.multiple >= 1 ? "grn" : "red"}">${num(p.multiple, 2)}×</span><span class="muted small">start ${money(p.start_usd)}</span></div>
  <div class="chart-wrap"><canvas id="eq"></canvas></div>
  <div class="ranges">${Object.keys(RANGES).map((r) => `<button data-r="${r}" class="${r === range ? "on" : ""}">${r}</button>`).join("")}</div>
  <h2>Agents · ${run} running</h2>
  <div class="car">${s.agents.map((a) => `<a class="card" href="#agents"><div><span class="dot ${dotCls(a.status)}"></span><b>${esc(a.name)}</b></div><div class="n">${a.today}</div><div class="muted small">today · ${esc(a.status)}</div></a>`).join("")}</div>
  ${s.positions.length ? `<h2>Open PAPER positions</h2><div class="card pad0">${s.positions.map((q) => `<a class="row" href="#coin/${q.mint}"><div class="l"><b>${esc(q.symbol)}</b><div class="muted small">${money(q.entry_usd)} · stop ${px(q.stop_price)}</div></div><div class="r ${q.pnl_pct >= 0 ? "up" : "dn"}">${q.pnl_pct >= 0 ? "+" : ""}${num(q.pnl_pct)}%</div></a>`).join("")}</div>` : ""}
  <h2>Activity <a href="#activity">See all</a></h2>
  <div class="card pad0">${D.activity.events.slice(0, 5).map(evRow).join("") || '<div class="empty">No activity yet</div>'}</div>
  <p class="muted small" style="text-align:center;margin-top:18px">PAPER only · simulated money · no real orders</p>`;
  odometer($("#bal"), money(p.equity_usd));
  drawEquity($("#eq"));
  document.querySelectorAll(".ranges button").forEach((b) => b.onclick = () => { range = b.dataset.r; document.querySelectorAll(".ranges button").forEach((x) => x.classList.toggle("on", x === b)); drawEquity($("#eq")); });
}

function viewAgents() {
  const a = D.agents;
  const cards = a.agents.map((ag) => {
    const dec = a.decisions[ag.name] || [];
    const items = dec.map((d) => {
      const target = ag.name === "Auditor" ? "audit" : "coin", ok = D.coins.coins[d.mint] ? ` href="#${target}/${d.mint}"` : "";
      const bad = ["kill", "reject", "skip", "drop"].includes(d.decision);
      return `<a class="row"${ok}><div class="l t"><b>${esc(d.coin || d.mint.slice(0, 6))}</b> <span class="pill mono">${esc(d.decision)}</span><div class="muted small t">${esc(d.reason || "")}${d.score != null && ag.name === "Analyst" ? " · score " + d.score : ""}</div></div><div class="r ${bad ? "dn" : ""}">${tfmt(d.ts)}</div></a>`;
    }).join("") || '<div class="empty">No decisions yet</div>';
    const cmd = ag.name === "Risk" ? "pause Risk (refused while a position is open)" : `pause ${ag.name}`;
    return `<div class="card pad0"><div class="ac-h"><span class="dot ${dotCls(ag.status)}"></span><div class="nm">${esc(ag.name)}<div class="muted small" style="font-weight:400">${esc(ag.status)}${ag.detail ? " · " + esc(ag.detail) : ""}</div></div><div class="n">${ag.today}</div><div class="sw ${ag.paused ? "" : "on"}"></div></div>
    <div class="note">Switch is read-only here. Change via Telegram: <span class="mono">${esc(cmd)}</span></div>${items}</div>`;
  }).join("");
  $("#view").innerHTML = `<h1>Agents</h1>${cards}<p class="muted small" style="text-align:center">Today's count · scanner: migrations seen, auditor: audits, analyst: verdicts, executor: pushes, risk: exits.</p>`;
}

function viewActivity() {
  $("#view").innerHTML = `<h1>Activity</h1><div class="card pad0">${D.activity.events.map(evRow).join("") || '<div class="empty">No activity yet</div>'}</div>`;
}

function viewAccount() {
  const a = D.account, st = D.settings.settings;
  const grp = Object.keys(st).map((g) => `<h2 style="font-size:16px">${esc(g)}</h2><div class="card pad0">${Object.entries(st[g]).map(([k, v]) => `<div class="kv"><span class="muted">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join("")}</div>`).join("");
  $("#view").innerHTML = `<h1>Account</h1>
  <div class="card pad0"><div class="seg"><div class="on">PAPER</div><div class="dis">LIVE</div></div>
    <div class="note" style="padding-top:8px">Mode is read-only here. Change via Telegram: <span class="mono">paper</span> / <span class="mono">live</span>. LIVE: ${esc(a.live_note)}.</div>
    <div class="kv"><span class="muted">PAPER stack</span><span class="v">${money(a.paper_stack)}</span></div>
    <div class="kv"><span class="muted">LIVE stack</span><span class="v">${a.live_stack ? money(Number(a.live_stack)) : "not set"}</span></div>
    <div class="note" style="padding-top:8px">Stack is read-only here. Change via Telegram: <span class="mono">stack 1240</span> (sets the LIVE stack).</div>
    <div class="kv"><span class="muted">Min stack for $47.50 tickets</span><span class="v">${money(a.min_stack)}</span></div>
    ${a.ticket_note ? `<div class="note">${esc(a.ticket_note)}</div>` : ""}</div>
  <div class="card pad0"><a class="row" href="${esc(a.profile_url)}" target="_blank" rel="noopener"><div class="l"><b>Your FOMO profile</b><div class="muted small">@${esc(a.fomo_handle)}</div></div><div class="r">›</div></a>
    <a class="row" id="invite" href="${esc(a.signup_url)}"><div class="l"><b>Invite a friend</b><div class="muted small">Share your FOMO signup link</div></div><div class="r">›</div></a>
    <div class="row"><div class="l"><b>Morning report</b></div><div class="r">${a.report_url ? `<a href="${esc(a.report_url)}" class="up">open</a>` : "none yet"}</div></div></div>
  <h2>Settings</h2><p class="muted small" style="margin-top:-4px">Read-only snapshot. Change via Telegram: <span class="mono">set stop to -8%</span>.</p>${grp}
  <p class="muted small" style="text-align:center">PAPER since ${a.paper_since ? new Date(a.paper_since * 1000).toLocaleString("en-US", {timeZone: TZ, dateStyle: "medium", timeStyle: "short"}) + " PT" : "—"}<br>Public static page · no login · fictitious data only</p>`;
  $("#invite").onclick = async (e) => { if (navigator.share) { e.preventDefault(); try { await navigator.share({title: "FOMO", url: a.signup_url}); } catch (_) {} } };
}

function viewAudit(mint) {
  const c = D.coins.coins[mint], au = c && c.audit;
  if (!au) { $("#view").innerHTML = `<a class="back" href="#agents">‹ Agents</a><div class="empty">No audit for this coin yet.</div>`; return; }
  const greens = au.layers.filter((l) => l.status === "green").length;
  $("#view").innerHTML = `<a class="back" href="#agents">‹ Agents</a>
  <div style="display:flex;justify-content:space-between;align-items:center"><h1 style="margin:0">${esc(c.symbol || mint.slice(0, 6))}</h1><span class="pill ${au.verdict === "pass" ? "grn" : "red"}">${au.verdict === "pass" ? "Auditor 8/8" : greens + "/8 · refused"}</span></div>
  <div class="muted small" style="margin:4px 0 8px">Audited ${tfmt(au.ts)} PT · stops at the first red layer · no data is never a pass</div>
  <div class="disc-wrap"><canvas id="discs"></canvas></div>
  <div class="card pad0">${au.layers.map((l) => `<div class="lrow ${l.status === "red" ? "red" : ""}"><div class="lic ${l.status === "green" ? "g" : l.status === "red" ? "r" : ""}">${l.status === "green" ? "✓" : l.status === "red" ? "✕" : l.n}</div><div><div class="nm">${l.n}. ${esc(l.name)}</div><div class="v">${esc(l.value)}</div></div></div>`).join("")}</div>
  <a class="btn b" href="${esc(au.fomo_url)}" target="_blank" rel="noopener">Open on FOMO</a>`;
  drawDiscs($("#discs"), au.layers, true);
}

function viewCoin(mint) {
  const c = D.coins.coins[mint];
  if (!c) { $("#view").innerHTML = `<a class="back" href="#home">‹ Home</a><div class="empty">No data for this coin in the snapshot.</div>`; return; }
  const p = c.position, open = p && !p.closed, last = open ? p.last_price : (c.candles.candles.length ? c.candles.candles[c.candles.candles.length - 1].c : null);
  $("#view").innerHTML = `<a class="back" href="#home">‹ Back</a>
  <div style="display:flex;justify-content:space-between;align-items:center"><h1 style="margin:0">${esc(c.symbol || mint.slice(0, 6))}</h1><span class="pill mono">${esc(c.status)}</span></div>
  <div class="big2" style="margin-top:6px">${last != null ? "$" + px(last) : "—"}</div>
  <div class="muted small">${esc(c.name || "")}${c.final_reason ? " · " + esc(c.final_reason) : ""}</div>
  <div class="card" style="padding:8px 4px 4px;margin-top:12px"><canvas id="cdl"></canvas><div class="note" style="padding:4px 10px 0">${c.candles.bucket_s ? "Candles " + c.candles.bucket_s + "s · " : ""}volume: ${esc(c.candles.volume_note || "DexScreener 5m volume")}</div></div>
  <h2>Your position</h2>
  ${p ? `<div class="card pad0"><div class="kv"><span class="muted">Status</span><span class="v">${open ? "open (PAPER)" : "closed: " + esc(p.close_reason)}</span></div>
    <div class="kv"><span class="muted">Entry</span><span class="v">${money(p.entry_usd)} @ ${px(p.entry_price)}</span></div>
    <div class="kv"><span class="muted">${open ? "Now" : "Exit"}</span><span class="v">${px(open ? p.last_price : p.exit_price)}</span></div>
    <div class="kv"><span class="muted">P&amp;L</span><span class="v ${(p.pnl_usd || 0) >= 0 ? "up" : "dn"}">${(p.pnl_usd || 0) >= 0 ? "+" : ""}${money(p.pnl_usd || 0)} (${p.pnl_pct >= 0 ? "+" : ""}${num(p.pnl_pct)}%)</span></div>
    ${open ? `<div class="kv"><span class="muted">Risk stop</span><span class="v" style="color:var(--org)">${px(p.stop_price)} ${p.trailing ? "(trailing " + num(p.trail_pct, 0) + "%)" : "(-" + num(p.stop_pct, 0) + "%)"}</span></div>` : ""}</div>`
    : `<div class="card empty">No PAPER position in this coin.${c.signal ? " A push was sent." : ""}</div>`}
  ${c.audit ? `<a class="btn c" href="#audit/${mint}">Auditor · ${c.audit.verdict === "pass" ? "8/8" : "refused"} ›</a>` : ""}
  <a class="btn g" href="${esc(c.fomo_url)}" target="_blank" rel="noopener">Buy on FOMO</a>
  ${open ? `<a class="btn r" href="${esc(c.fomo_url)}" target="_blank" rel="noopener">Sell on FOMO</a>` : ""}`;
  drawCandles($("#cdl"), c);
}

// ---------- router
function route() {
  const h = location.hash.replace(/^#/, "") || "home", [name, arg] = h.split("/");
  tab = ["home", "agents", "activity", "account"].includes(name) ? name : name === "audit" ? "agents" : "home";
  document.querySelectorAll("#tabbar a").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
  if (!D.state) return;
  const rp = D.state.replay; const b = $("#banner"); b.classList.toggle("hidden", !rp); b.textContent = rp ? "REPLAY DATA · " + rp : "";
  ({home: viewHome, agents: viewAgents, activity: viewActivity, account: viewAccount, audit: () => viewAudit(arg), coin: () => viewCoin(arg)}[name] || viewHome)();
  if (!window.__keepScroll) window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
window.addEventListener("resize", () => { const c = $("#eq"); if (c) drawEquity(c); const d = $("#cdl"); if (d && location.hash.startsWith("#coin/")) drawCandles(d, D.coins.coins[location.hash.split("/")[1]]); });

async function refresh(first) {
  try { await load(); window.__keepScroll = !first; route(); window.__keepScroll = false; }
  catch (e) { if (first) $("#view").innerHTML = `<div class="empty">Can't load the snapshot yet.</div>`; }
}
refresh(true);
setInterval(() => { if (!location.hash.startsWith("#audit")) refresh(false); }, 60000);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
