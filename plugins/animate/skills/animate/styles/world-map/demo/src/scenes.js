// =====================================================================
//  SCENES — world map demo. One map in world units (~px at zoom 1); the camera does the storytelling.
//  The border is the 49th parallel at y = 900: land above is Canada (steel blue), land below is the U.S. (amber).
// =====================================================================
const cu = TIMELINE.cues;
const LINE_Y = 900;
const LANDP = [[-300, -300], [1400, -300], [1400, 1800], [860, 1800], [800, 1500], [830, 1250], [770, 1050], [740, 900], [700, 840], [610, 800],
  [530, 820], [520, 980], [500, 1100], [430, 1160], [340, 1140], [300, 1040], [290, 900], [260, 800], [150, 760], [-300, 790]];
const TIP = [[290, 900], [405, 905], [520, 900], [520, 980], [500, 1100], [430, 1160], [340, 1140], [300, 1040]];
const ROUTE = [[405, 1080], [405, 960], [400, 820], [430, 740], [560, 705], [720, 715], [850, 760], [870, 900], [885, 1080], [880, 1220]];
// the route fractions where it crosses the border (computed once from the path)
const CROSS = (() => { const Q = resample(ROUTE, false, 4), L = pathLen(Q), out = []; let s = 0;
  for (let i = 1; i < Q.length; i++) { s += dist(Q[i - 1], Q[i]); if ((Q[i - 1][1] - LINE_Y - 0.5) * (Q[i][1] - LINE_Y - 0.5) < 0) out.push(s / L); } return out; })();
const routeFrac = () => EZ.io(seg(TT, cu.route, cu.routeEnd));
const crossT = CROSS.map((f) => { for (let t = cu.route; t <= cu.routeEnd; t += 1 / 96) { if (EZ.io(seg(t, cu.route, cu.routeEnd)) >= f) return t; } return cu.routeEnd; });

// the map, with the two sides coloured in by u (0 = neutral land, 1 = split)
function drawMap(u) {
  wmOcean({ key: 'pr' });
  const north = () => { ctx.beginPath(); ctx.rect(-3000, -3000, 7000, 3000 + LINE_Y); };
  const south = () => { ctx.beginPath(); ctx.rect(-3000, LINE_Y, 7000, 4000); };
  wmLand(LANDP, { key: 'pr', fill: [{ clip: north, c: mixHex(WM.land, WM.rival, u) }, { clip: south, c: mixHex(WM.land, WM.gold, u) }] });
}

// ---- era 1: the line cuts the tip off
function sceneCut() {
  drawMap(EZ.io(ev(cu.fill, 0.35)));
  wmBorder([[-300, LINE_Y], [1400, LINE_Y]], EZ.o2(ev(cu.line, 0.6)), { solid: TT > cu.fill + 0.3 });
  wmLabel('Canada', 560, 470, cu.labels, 60, { box: WM.line, out: cu.zoom });
  wmLabel('USA', 830, 1330, cu.labels + 0.15, 60, { box: WM.line, out: cu.zoom });
  wmLabel('49th parallel', 300, 850, cu.line + 0.45, 34, { box: WM.white, color: WM.line, out: cu.zoom + 0.1 });
  wmPin(410, 1050, cu.pin);
  wmLabel('Point Roberts', 410, 1205, cu.name, 46, { box: WM.gold, color: WM.line });
  if (TT > cu.pin) wmFlag(470, 1110, cu.pin + 0.3, { size: 70, colors: [WM.gold, WM.white, WM.navy] });
  wmTag('1846');
  wmCaption('The 49th parallel cut it off', { hl: ['49TH', 'PARALLEL'], size: 46 });
  if (DEFER) DEFER.push(() => wmGlobe(150, 1200, 70, { key: 'hero', look: 0.8, hop: cu.pin }));
}

// ---- era 2: the drive home
function sceneDrive() {
  drawMap(1);
  wmBorder([[-300, LINE_Y], [1400, LINE_Y]], 1, { solid: true });
  const head = wmRoute(ROUTE, routeFrac());
  CROSS.forEach((f, i) => { if (TT >= crossT[i]) wmStamp('!', pointAt(resample(ROUTE, false, 4), f)[0] + 60, LINE_Y - 60, crossT[i], { r: 34, c: WM.crimson }); });
  if (TT > cu.route) { ctx.save(); ctx.beginPath(); ctx.arc(head[0], head[1], wmPx(16), 0, TAU); ctx.fillStyle = WM.white; ctx.fill(); wmStroke(WM.line, 5); ctx.stroke(); ctx.restore(); }
  wmLabel('Canada', 300, 640, 3.1, 56);
  wmLabel('USA', 930, 1330, 3.2, 56);
  wmLabel('Point Roberts', 440, 1215, 3.3, 34, { box: WM.gold, color: WM.line });
  wmTag('The drive home', { c: WM.white });
  if (DEFER) DEFER.push(() => wmCounter('Borders crossed', 820, 470, 3.4, crossT));
  wmCaption('25 miles through Canada', { hl: ['25', 'MILES'], at: 1.9 });
  if (DEFER) DEFER.push(() => wmGlobe(150, 1290, 70, { key: 'hero', look: 0.6, hop: crossT[1] }));
}
