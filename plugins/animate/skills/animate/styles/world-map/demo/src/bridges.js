// =====================================================================
//  ERAS, CAMERAS, BRIDGES — world map demo (read by kit/morph.js)
// =====================================================================
const ERA_BG = [WM.ocean, WM.ocean];
// an ease-out camera move (blueprint Template 1: fast in, gentle settle)
const wmCam = (t, a, b, cam) => { const u = EZ.o3(seg(t, a, b)); return u > 0 ? camMix(CAM0, camOf(cam), u) : null; };
function pieceCam(era, t) {
  if (era === 0) return wmCam(t, cu.zoom, cu.zoom + 1.4, { z: 2.0, p: [410, 1030], to: [540, 880] });
  return camOf({ z: 0.94 + 0.06 * EZ.io(seg(t, 3.0, 6.0)), p: [620, 950], to: [540, 900] });
}
const BRIDGES = [
  // the gold tip at close range -> the same tip on the wide map
  { tc: 3.0, A: () => ({ P: wmCoast(TIP, 'tip'), c: WM.gold }), B: () => ({ P: wmCoast(TIP, 'tip'), c: WM.gold }) },
];
