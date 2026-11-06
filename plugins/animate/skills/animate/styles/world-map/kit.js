// =====================================================================
//  styles/world-map/kit.js — "The World In the Making": a map-driven geography / history explainer.
//  Flat vector map: slate ocean, light land, territories filled gold (the focus) against crimson or navy
//  (the other side), 4px charcoal coast and border lines that stay 4px at any zoom, a soft offset shadow
//  under land. Bold ALL CAPS labels (white with a dark shadow, or in a dark box). Pins drop, flags pop,
//  badges and counters tick. The camera pans and zooms over the map with ease-out moves. Motion on 1s.
//  Built from the user's written blueprint (no reference frames). Built on kit/core.js.
//  Needs from the piece head: W, H, FPS, CX (caption centre x).
// =====================================================================

// ---- palette (from the blueprint, section 5.2) and its meaning
const WM = {
  ocean: '#2b3a42',     // the ground: open water
  oceanLn: '#344854',   // graticule and wave lines on the water
  land: '#e8ecef',      // neutral land, before a side is chosen
  gold: '#f4a93b',      // the focal territory, the hero's land, the one thing to look at (a softened amber)
  rival: '#7b9bb3',     // the opposing territory: a muted steel blue, calm next to the gold
  crimson: '#d26a5c',   // warnings only (stamps, small marks): a soft coral, never a large area
  navy: '#1d3557',      // a second opposing colour, routes, badges
  line: '#212529',      // coasts, borders, outlines, label shadows
  shadow: '#1c272d',    // the land's drop shadow on the water
  white: '#ffffff',
  water: '#3d8fc4',     // rising water, rivers (Template 8)
};
const WM_FONT = '"Montserrat", "Inter", "Arial Black", "Helvetica Neue", Arial, sans-serif';
const WM_LINE = 4;      // coast and border weight in screen px

// ---------------------------------------------------------------------
//  zoom-independent sizes: the map is drawn under the camera, lines and labels are not scaled by it
// ---------------------------------------------------------------------
const wmZ = () => ctx.getTransform().a || 1;
const wmPx = (px) => px / wmZ();
function wmStroke(color = WM.line, w = WM_LINE) { ctx.lineWidth = wmPx(w); ctx.strokeStyle = color; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; }

// a coastline: the outline resampled and roughened along its normal by smoothed seeded noise (static, no boil)
const WM_COAST = new Map();
function wmCoast(P, key, amt = 9, step = 12) {
  const id = key + '|' + amt + '|' + step + '|' + P.length;
  const geometry = JSON.stringify(P), cached = WM_COAST.get(id);
  if (cached?.geometry === geometry) return cached.points;
  const Q = resample(P, true, step), n = Q.length, R = RNG('coast', key);
  let r = Q.map(() => R.n(1));
  for (let k = 0; k < 3; k++) r = r.map((v, i) => (r[(i - 1 + n) % n] + v * 2 + r[(i + 1) % n]) / 4);
  const out = Q.map((q, i) => {
    const a = Q[(i - 1 + n) % n], b = Q[(i + 1) % n], nx = a[1] - b[1], ny = b[0] - a[0], l = Math.hypot(nx, ny) || 1;
    return [q[0] + nx / l * r[i] * amt * 2.2, q[1] + ny / l * r[i] * amt * 2.2];
  });
  WM_COAST.set(id, { geometry, points: out }); return out;
}
function wmPath(P, closed = true) { ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); if (closed) ctx.closePath(); }

// ---------------------------------------------------------------------
//  the map
// ---------------------------------------------------------------------
// the ocean: flat slate, a faint graticule in world space (it moves with the camera), a few wave dashes
function wmOcean(o = {}) {
  fillAll(o.c || WM.ocean);
  const g = o.grid ?? 180, bb = { x0: -1200, y0: -1200, x1: W + 1200, y1: H + 1200 };
  ctx.save(); wmStroke(WM.oceanLn, 2); ctx.globalAlpha = 0.9;
  for (let x = Math.floor(bb.x0 / g) * g; x < bb.x1; x += g) { ctx.beginPath(); ctx.moveTo(x, bb.y0); ctx.lineTo(x, bb.y1); ctx.stroke(); }
  for (let y = Math.floor(bb.y0 / g) * g; y < bb.y1; y += g) { ctx.beginPath(); ctx.moveTo(bb.x0, y); ctx.lineTo(bb.x1, y); ctx.stroke(); }
  const R = RNG('waves', o.key ?? 'sea');
  wmStroke(WM.oceanLn, 3);
  for (let i = 0; i < (o.waves ?? 26); i++) {
    const x = R.r(-200, W + 200), y = R.r(-200, H + 200), ph = R.r(0, TAU), dx = Math.sin(TT * 1.6 + ph) * 8;
    ctx.beginPath(); ctx.moveTo(x + dx, y); ctx.quadraticCurveTo(x + dx + 14, y - 8, x + dx + 28, y); ctx.quadraticCurveTo(x + dx + 42, y + 8, x + dx + 56, y); ctx.stroke();
  }
  ctx.restore();
}
// land: shadow, fill (one colour, or split into zones by clip functions), coast line
//   o.fill   a colour, or [{ clip: () => path, c }] zones drawn in order (each clip builds a path)
//   o.key    the coastline seed; o.raw = true skips roughening (a morphing blob)
function wmLand(P, o = {}) {
  const C = o.raw ? P : wmCoast(P, o.key ?? 'land', o.amt ?? 9);
  ctx.save();
  if (o.shadow !== false) { ctx.save(); ctx.translate(wmPx(7), wmPx(9)); wmPath(C); ctx.fillStyle = WM.shadow; ctx.fill(); ctx.restore(); }
  wmPath(C); ctx.fillStyle = typeof o.fill === 'string' ? o.fill : WM.land; ctx.fill();
  if (Array.isArray(o.fill)) for (const z of o.fill) { ctx.save(); wmPath(C); ctx.clip(); z.clip(); ctx.clip(); fillAll(z.c); ctx.restore(); }
  wmPath(C); wmStroke(o.line || WM.line); ctx.stroke();
  ctx.restore();
  return C;
}
// a border: a straight or poly line drawn on with frac; dashed until o.solid
function wmBorder(P, frac = 1, o = {}) {
  if (frac <= 0) return;
  ctx.save(); wmStroke(o.color || WM.line, o.w ?? WM_LINE + 2);
  if (!o.solid) ctx.setLineDash([wmPx(22), wmPx(14)]);
  wmPath(subPath(resample(P, false, 6), frac), false); ctx.stroke();
  ctx.restore();
}
// a route: white casing under a coloured dashed line, drawn on with frac; returns the head point
function wmRoute(P, frac, o = {}) {
  const Q = subPath(resample(P, false, 6), clamp(frac));
  if (frac <= 0 || Q.length < 2) return P[0];
  ctx.save();
  wmStroke(WM.white, (o.w ?? 10) + 6); wmPath(Q, false); ctx.stroke();
  wmStroke(o.color || WM.navy, o.w ?? 10); ctx.setLineDash([wmPx(18), wmPx(10)]); ctx.lineDashOffset = -wmPx(TT * 60); wmPath(Q, false); ctx.stroke();
  ctx.restore();
  return Q[Q.length - 1];
}

// ---------------------------------------------------------------------
//  type: bold ALL CAPS sans. Labels keep their screen size under the camera unless o.world.
// ---------------------------------------------------------------------
function wmText(str, x, y, size, o = {}) {
  const s = (o.world ? size : wmPx(size)) * (o.scale ?? 1);
  if (s <= 0.01) return 0;
  ctx.save(); ctx.font = `${o.weight ?? 900} ${s}px ${WM_FONT}`; ctx.textAlign = o.align ?? 'center'; ctx.textBaseline = 'middle';
  const txt = String(str).toUpperCase(), w = ctx.measureText(txt).width, sh = s * 0.11;
  if (o.box) {
    const px = s * 0.42, ph = s * 0.34, bx = o.align === 'left' ? x - px : o.align === 'right' ? x - w - px : x - w / 2 - px;
    ctx.fillStyle = WM.line; ctx.beginPath(); ctx.roundRect(bx + sh * 0.6, y - s / 2 - ph + sh * 0.6, w + px * 2, s + ph * 2, s * 0.22); ctx.fill();
    ctx.fillStyle = o.box; ctx.beginPath(); ctx.roundRect(bx, y - s / 2 - ph, w + px * 2, s + ph * 2, s * 0.22); ctx.fill();
  } else if (o.shadow !== false) { ctx.fillStyle = WM.line; ctx.fillText(txt, x + sh, y + sh); }
  ctx.fillStyle = o.color || WM.white; ctx.fillText(txt, x, y);
  ctx.restore(); return w;
}
// a map label that pops in at t0 (scale with a back overshoot)
const wmLabel = (str, x, y, t0, size = 44, o = {}) => wmText(str, x, y, size, { ...o, scale: popS(t0) * (o.out != null ? 1 - EZ.i2(ev(o.out, 0.2)) : 1) });

// ---------------------------------------------------------------------
//  icons: pin, flag, badge, counter, question / warning stamp, measure line. Constant screen size.
// ---------------------------------------------------------------------
// a map pin that drops from above and bounces; its tip sits on (x, y)
function wmPin(x, y, t0, o = {}) {
  if (TT < t0) return;
  const s = wmPx(o.size ?? 64), d = (1 - springEase(TT - t0, 260, 16)) * wmPx(260), c = o.c || WM.gold;
  ctx.save(); ctx.translate(x, y - d);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(0, d, s * 0.28 * clamp(1 - d / wmPx(260)), s * 0.09, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-s * 0.15, -s * 0.35, -s * 0.42, -s * 0.5, -s * 0.42, -s * 0.78);
  ctx.arc(0, -s * 0.78, s * 0.42, Math.PI, 0); ctx.bezierCurveTo(s * 0.42, -s * 0.5, s * 0.15, -s * 0.35, 0, 0); ctx.closePath();
  ctx.fillStyle = c; ctx.fill(); wmStroke(WM.line, 4); ctx.stroke();
  ctx.fillStyle = WM.white; ctx.beginPath(); ctx.arc(0, -s * 0.78, s * 0.16, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.restore();
}
// a flag on a pole that pops up at t0 and waves. o.colors = [field, stripe, canton]; o.kind 'stripes' | 'tri' | 'cross'
function wmFlag(x, y, t0, o = {}) {
  const k = popS(t0); if (k <= 0) return;
  const s = wmPx(o.size ?? 90) * k, fw = s * 0.9, fh = s * 0.56, [a, b, c] = o.colors || [WM.gold, WM.white, WM.navy];
  ctx.save(); ctx.translate(x, y);
  wmStroke(WM.line, 5); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 1.3); ctx.stroke();
  const wave = (u, v) => [u * fw, -s * 1.3 + v * fh + Math.sin(u * 5 - TT * 7 + (o.ph ?? 0)) * s * 0.05 * u];
  const quad = (u0, v0, u1, v1, col) => { const P = [], n = 8; for (let i = 0; i <= n; i++) P.push(wave(lerp(u0, u1, i / n), v0)); for (let i = n; i >= 0; i--) P.push(wave(lerp(u0, u1, i / n), v1)); wmPath(P); ctx.fillStyle = col; ctx.fill(); };
  quad(0, 0, 1, 1, a);
  if (o.kind === 'tri') { quad(0, 0, 0.3, 1, b); quad(0.7, 0, 1, 1, b); }
  else if (o.kind === 'cross') { quad(0.3, 0, 0.45, 1, b); quad(0, 0.42, 1, 0.58, b); }
  else { for (let i = 1; i < 6; i += 2) quad(0, i / 6, 1, (i + 1) / 6, b); quad(0, 0, 0.42, 0.5, c); }
  const P = []; for (let i = 0; i <= 8; i++) P.push(wave(i / 8, 0)); for (let i = 8; i >= 0; i--) P.push(wave(i / 8, 1));
  wmPath(P); wmStroke(WM.line, 4); ctx.stroke();
  ctx.restore();
}
// a badge: text in a coloured box with a hard dark offset, popping in at t0 (years, labels, counts)
const wmBadge = (str, x, y, t0, o = {}) => wmText(str, x, y, o.size ?? 54, { box: o.c || WM.navy, color: o.color || WM.white, align: o.align, scale: popS(t0) });
// a counter badge: label plus a number that ticks at the given times, each tick with a pop and a gold flash
function wmCounter(label, x, y, t0, ticks, o = {}) {
  const n = ticks.filter((t) => TT >= t).length, last = ticks[n - 1] ?? -9, f = Math.exp(-(TT - last) * 6);
  wmBadge(label, x, y, t0, { size: o.size ?? 40, c: WM.navy, align: 'right' });
  const k = popS(t0) * (1 + 0.25 * f);
  wmText(String(n), x + wmPx(70), y, (o.size ?? 40) * 1.5, { box: f > 0.05 && n ? WM.gold : WM.white, color: WM.line, scale: k });
}
// a stamp: "?" or "!" (or a word) in a circle / triangle that slams down at t0
function wmStamp(str, x, y, t0, o = {}) {
  if (TT < t0) return;
  const u = clamp((TT - t0) / 0.18), k = lerp(2.2, 1, EZ.o3(u)) * (u >= 1 ? 1 + 0.06 * Math.exp(-(TT - t0 - 0.18) * 10) : 1), r = wmPx(o.r ?? 58) * k;
  ctx.save(); ctx.globalAlpha = clamp(u * 2); ctx.translate(x, y); ctx.rotate((o.rot ?? -8) * DEG);
  if (o.shape === 'tri') { wmPath([[0, -r * 1.1], [r * 1.05, r * 0.75], [-r * 1.05, r * 0.75]]); } else { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); }
  ctx.fillStyle = o.c || WM.crimson; ctx.fill(); wmStroke(WM.line, 5); ctx.stroke();
  ctx.font = `900 ${r * (str.length > 1 ? 0.5 : 1.2)}px ${WM_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = WM.white;
  ctx.fillText(str.toUpperCase(), 0, o.shape === 'tri' ? r * 0.15 : r * 0.06);
  ctx.restore();
}
// a measure line between two points with end ticks, drawn on with frac, and a value that counts up
function wmMeasure(a, b, frac, label, o = {}) {
  if (frac <= 0) return;
  const p = [lerp(a[0], b[0], frac), lerp(a[1], b[1], frac)], nx = -(b[1] - a[1]), ny = b[0] - a[0], l = Math.hypot(nx, ny) || 1, tk = wmPx(18);
  ctx.save(); wmStroke(WM.white, 6);
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
  for (const q of [a, frac >= 1 ? b : null].filter(Boolean)) { ctx.beginPath(); ctx.moveTo(q[0] - nx / l * tk, q[1] - ny / l * tk); ctx.lineTo(q[0] + nx / l * tk, q[1] + ny / l * tk); ctx.stroke(); }
  ctx.restore();
  if (label) { const m = [(a[0] + p[0]) / 2 + nx / l * wmPx(o.off ?? 50), (a[1] + p[1]) / 2 + ny / l * wmPx(o.off ?? 50)]; wmText(typeof label === 'function' ? label(frac) : label, m[0], m[1], o.size ?? 40, { box: WM.white, color: WM.line }); }
}

// ---------------------------------------------------------------------
//  the hero: a little globe. Slate sea, gold land, charcoal rim, two eyes that blink, an idle bob.
//  o.look (-1..1) turns the eyes; o.hop is a time to hop at. Sets SPARK_AT for the anchor check.
// ---------------------------------------------------------------------
function wmGlobe(x, y, r, o = {}) {
  const key = o.key ?? 'globe';
  const hop = o.hop != null && TT >= o.hop ? Math.max(0, Math.sin(clamp((TT - o.hop) / 0.4) * Math.PI)) * r * 0.5 : 0;
  y += Math.sin(TT * TAU * 0.8 + key.length) * r * 0.05 - hop;
  SPARK_AT = toScreen(x, y);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y + r * 1.15 + hop, r * 0.7 * (1 - hop / r * 0.6), r * 0.12, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = WM.water; ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
  const spin = (TT * 0.25) % 1 * r * 3;
  for (const [u, v, s] of [[-0.4, -0.35, 0.5], [0.45, 0.1, 0.62], [-0.2, 0.55, 0.36], [1.1, -0.4, 0.45]]) {
    const cx = x + ((u * r + spin + r * 1.5) % (r * 3)) - r * 1.5;
    const coast = wmCoast(ellipsePts(0, 0, s * r, s * r * 0.75, u, 24), 'gl' + u, r * 0.03, r * 0.12);
    wmPath(coast.map(([px, py]) => [px + cx, py + y + v * r])); ctx.fillStyle = WM.gold; ctx.fill();
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); wmStroke(WM.line, Math.max(4, r * 0.07)); ctx.stroke();
  const blink = (Math.floor(TT * 12) + key.length * 7) % 41 < 2, lx = (o.look ?? 0) * r * 0.12;
  for (const s of [-1, 1]) {
    ctx.fillStyle = WM.white; ctx.beginPath(); ctx.ellipse(x + s * r * 0.3, y - r * 0.12, r * 0.19, blink ? r * 0.03 : r * 0.24, 0, 0, TAU); ctx.fill(); ctx.stroke();
    if (!blink) { ctx.fillStyle = WM.line; ctx.beginPath(); ctx.arc(x + s * r * 0.3 + lx, y - r * 0.08, r * 0.1, 0, TAU); ctx.fill(); }
  }
  ctx.beginPath(); ctx.arc(x, y + r * 0.22, r * 0.2, 0.15 * Math.PI, 0.85 * Math.PI); wmStroke(WM.line, Math.max(4, r * 0.06)); ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------
//  captions and tags (DEFER: drawn after the camera, at screen size)
//  wmCaption pops in word by word (Template 10); wmTag is the badge at the top left (a year, a chapter)
// ---------------------------------------------------------------------
function wmCaptionNow(str, y, o = {}) {
  const words = String(str).toUpperCase().split(' '), size = o.size ?? 52, gap = size * 0.3;
  ctx.save(); ctx.font = `900 ${size}px ${WM_FONT}`;
  const lines = [[]]; let lw = 0;
  for (const w of words) { const ww = ctx.measureText(w).width; if (lw + ww > (o.max ?? 900) && lines[lines.length - 1].length) { lines.push([]); lw = 0; } lines[lines.length - 1].push([w, ww]); lw += ww + gap; }
  ctx.restore();
  let i = 0;
  lines.forEach((L, li) => {
    const tw = L.reduce((s, [, ww]) => s + ww, 0) + gap * (L.length - 1); let x = CX - tw / 2;
    for (const [w, ww] of L) {
      const t = E0 + (o.at ?? 0.35) + i * (o.every ?? 0.12), hl = o.hl && o.hl.includes(w);
      if (TT >= t) wmText(w, x + ww / 2, y + li * size * 1.3, size, { scale: popS(t), color: hl ? WM.gold : WM.white });
      x += ww + gap; i++;
    }
  });
}
const wmCaption = (str, o = {}) => { const f = () => wmCaptionNow(str, o.y ?? 1400, o); if (DEFER) DEFER.push(f); else f(); };
const wmTag = (str, o = {}) => { const f = () => wmBadge(str, o.x ?? 80, o.y ?? 330, E0 + (o.at ?? 0.1), { size: 56, c: o.c || WM.gold, color: WM.line, align: 'left' }); if (DEFER) DEFER.push(f); else f(); };

// =====================================================================
//  STYLE — the renderer's hooks (styles/README.md has the contract)
// =====================================================================
const STYLE = {
  name: 'world-map',
  paper: WM.ocean,                                     // a morph happens on open water
  backdrop(c) { fillAll(c); },
  window(P, key, src) {                                // the world seen through a coastline-shaped hole, rimmed in charcoal
    ctx.save(); wmPath(P); ctx.clip(); ctx.drawImage(src, 0, 0); ctx.restore();
    ctx.save(); wmPath(P); ctx.lineWidth = WM_LINE + 2; ctx.strokeStyle = WM.line; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
  },
  blob(P, c) { wmLand(P, { fill: c, raw: true }); },  // the morphing shape is a piece of land with its shadow and coast
  hero(x, y, r, o) { wmGlobe(x, y, r * 0.7, o); },
  heroColor: WM.gold,
  post() {                                             // a soft vignette, so the centre of the map reads first
    const g = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.35, W / 2, H * 0.45, H * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.28)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  },
  ones: true,                                          // smooth pans and zooms: motion on 1s
};
