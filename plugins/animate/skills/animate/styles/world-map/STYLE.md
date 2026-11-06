# World map ("The World In the Making")

Optional style contributed by Edern Lalanne, adopted from [revision 4dfa15423cbf677b923e846f323eb34e0ee0efed](https://github.com/edernlalanne-dotcom/animate_EL-version/commit/4dfa15423cbf677b923e846f323eb34e0ee0efed). Select `"style": "world-map"` in a piece. The blueprint and original validation notes below describe that upstream implementation; font availability depends on the local machine. Animate Kit shifts the demo's parallel label inward to keep it visible during the zoom.

![sample](sample.png)

A map-driven geography and history explainer for 60-90s Shorts. A flat vector map is the stage for the whole piece: slate ocean, light land, and territories filled gold (the focus) against a muted steel blue or navy (the other side). Coasts and borders are 4px charcoal at any zoom, land casts a soft offset shadow on the water. Labels are bold ALL CAPS sans, white with a dark shadow or set in a box. Pins drop, flags pop and wave, badges and counters tick, stamps slam. The camera tells the story: fast ease-out zooms onto a place, wide pulls for scale. Motion on 1s.

Made from the user's written blueprint (`Style Blueprint & Reverse-Engineering Analysis: "The World In the Making"`, sections 3-5). No reference frames were supplied, so nothing below is measured from pixels: the numbers are the blueprint's.

## Palette and meaning (`WM` in kit.js)

| role | hex | from |
|---|---|---|
| ocean (the ground, the morph paper) | `#2b3a42` | blueprint 5.2 map base |
| graticule and wave lines | `#344854` | derived, one step lighter than the ocean |
| neutral land (no side chosen yet) | `#e8ecef` | blueprint 5.2 map base |
| focal territory, the hero's land, highlighted caption words | `#f4a93b` amber | blueprint 5.2 primary `#ff9f1c`, softened at the user's request |
| opposing territory | `#7b9bb3` steel blue (`WM.rival`) | replaces the blueprint's crimson as the default other side: the user asked for less red |
| warnings only: stamps, small marks | `#d26a5c` soft coral | blueprint 5.2 crimson `#e63946`, softened; never a large area |
| second opposing colour, routes, badges | `#1d3557` navy | blueprint 5.2 secondary |
| coasts, borders, outlines, text shadows | `#212529` charcoal | blueprint 5.2 lines |
| rising water, rivers, the globe's sea | `#3d8fc4` | added for Template 8 |

Type: `"Montserrat", "Inter", "Arial Black", "Helvetica Neue", Arial, sans-serif`, weight 900, ALL CAPS (blueprint 5.2). Map labels 34-64px, captions 46-58px, tags 56px, all at screen size.

## Line, fill, geometry

- Coasts and borders 4px (`WM_LINE`), round joins; `wmPx()` divides by the camera zoom so a 2x push never thickens a line.
- Coastlines are roughened once by seeded, smoothed noise (`wmCoast`): static, no boil.
- Fills are flat. Land gets a hard drop shadow 7px right, 9px down, `#1c272d`. No gradients except the soft vignette in `post`.
- A two-sided split (`wmLand` with `fill: [{ clip, c }, ...]`) colours one landmass by zone: draw the border on top with `wmBorder` (dashed while it draws, solid once it is settled).

## Motion habits

- On 1s (`ones: true`). Camera zooms ease out (`EZ.o3`, blueprint Template 1: 1.4-1.8s); slow drifts in between.
- Labels, flags and badges pop with a back overshoot (`popS`); the pin drops on a spring; stamps slam from 2.2x scale in 0.18s.
- Caption words pop in one at a time, 0.12s apart (Template 10); the key words turn gold.
- Idle life: waves drift on the ocean, flags wave, the hero bobs and blinks, routes march.
- A visual change every 2-4s (blueprint 3.5). One shape morph per era change: a territory becomes the next era's territory.

## Frame checklist (on top of grammar/FRAME.md)

1. **The map is the stage.** Every frame shows water and land; no blank cards.
2. **One gold thing.** Gold marks the focus (the territory, the pin, the key caption words). The other side is steel blue (`WM.rival`) or navy, never gold. Red is for small warnings only: no large red areas.
3. **Light land carries dark text.** On `#e8ecef` set labels in a charcoal box; white text with a shadow only on ocean, steel blue, navy or amber.
4. **Lines stay 4px** at every zoom. Check the frame at the deepest zoom.
5. **Labels stay inside the safe zone** (x <= 940, y 240-1500 at 1080x1920). Fade map labels out (`o.out`) before a zoom pushes them off-screen.
6. **Every number has a picture**: a counter, a measure line, a stamp (blueprint 7: the analogy gate).
7. **One idea per caption line**, no lone word on a second line.

## Kit API (`kit.js`, on top of `kit/core.js`)

- Map: `wmOcean({ key, grid, waves })`, `wmLand(P, { key, fill, amt, raw, shadow })`, `wmCoast(P, key, amt)`, `wmBorder(P, frac, { solid, color, w })`, `wmRoute(P, frac, { color, w })` (returns the head point).
- Type: `wmText(str, x, y, size, { box, color, align, world, scale })`, `wmLabel(str, x, y, t0, size, { box, color, out })`.
- Icons: `wmPin(x, y, t0, { c, size })`, `wmFlag(x, y, t0, { colors, kind: 'stripes'|'tri'|'cross', size })`, `wmBadge(str, x, y, t0, { c, color, size })`, `wmCounter(label, x, y, t0, ticks)`, `wmStamp(str, x, y, t0, { shape: 'tri', c, r })`, `wmMeasure(a, b, frac, label)`.
- Hero: `wmGlobe(x, y, r, { key, look, hop })`: a globe with gold continents that turn, eyes that blink and look, an idle bob, a hop. Sets `SPARK_AT`.
- Captions: `wmCaption(str, { hl, size, at, y })`, `wmTag(str, { c })` (through `DEFER`).
- Helpers: `wmPx(px)`, `wmZ()`, `wmStroke(color, w)`, `wmPath(P, closed)`.
- `STYLE`: `paper` = ocean, `window` = a coast-shaped hole with a charcoal rim, `blob` = a piece of land with shadow and coast, `hero` = the globe, `post` = vignette, `ones: true`.

## Mapping the blueprint's scene templates to the kit

| template | kit |
|---|---|
| 1 Spatial map zoom-in | `pieceCam` with an `EZ.o3` move to z 2-3.5 + `wmPin` |
| 2 Definitional paradox | `wmStamp('?')` or `wmStamp('false')` on the subject |
| 3 Bipolar split | `wmLand` with two `fill` zones + `wmBorder` drawing on + two `wmFlag` |
| 4 Human-scale comparison | `wmMeasure` + `wmRoute` + a counting label |
| 5 Escalation ladder | a column of `wmBadge`s with staggered `t0` |
| 6 Ritual / absurdity loop | `wmCounter` + items crossing with `wmRoute` |
| 7 Barrier draw | `wmBorder(P, frac, { solid: true, w: 10 })` along the terrain |
| 8 Submersion bowl | not yet a primitive: fill a rising `WM.water` rect clipped to a cross-section |
| 9 Treaty / compromise | `wmBorder` dashed -> solid + percentage `wmBadge`s |
| 10 Ironic epilogue | `wmGlobe` close-up + `wmCaption` word by word |

## Do / don't

- Do design the map in world units at zoom 1 and let the camera do the moves.
- Do keep labels at screen size; give a label a world size (`world: true`) only when it is painted on the land itself.
- Don't use gold for two competing things in one frame.
- Don't draw real coastlines from memory as if they were survey-accurate: the look is stylized, the facts on screen must still be checked.

## Not matched (open)

- **No reference pixels.** Palette, type and line weight come from the blueprint's recommendations, not from measured frames. Send a reference video or stills and the numbers can be measured (`new-style.md` step 2).
- **Montserrat is not installed** here; Inter Black renders instead. Both are in the font stack.
- **Character avatars** (leaders, animals) are not primitives yet; the globe is the only character.
- **Template 8** (rising water cross-section) has no helper yet.
- The blueprint's 1.8s 100%-350% zoom is shortened to 1.4s at 200% in a 6s demo.

## Proven on

`demo/` (6s, 9:16, 120 BPM, 24fps): the 49th parallel draws across a peninsula and splits it steel blue and amber, the camera zooms to Point Roberts, a pin drops and a flag pops; the gold tip morphs at 3.0s into the wide map, where the 25-mile drive home through Canada draws on and a counter ticks two border crossings. Tile deterministic; review: cuts and morph on grid, story arc 2/2, text 0 cut-off or overlap, loudest moment in the payoff act, -17.1 LUFS.
