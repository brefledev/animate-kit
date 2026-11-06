  // SCORE BODY — world map demo (inside buildScore(); see kit/score-head.js). Bouncy pizzicato, pops and whooshes.
  const T = TIMELINE, q = T.cues;
  to = 'm';
  const prog = [['D4', 'F4', 'A4', 'F4'], ['Bb3', 'D4', 'F4', 'D4'], ['C4', 'E4', 'G4', 'E4'], ['A3', 'Cs4', 'E4', 'A4']];
  for (let e = 0; e < 24; e++) {                       // pizzicato 8ths, one chord per bar
    if (e === 9 || e === 10) continue;                 // a breath before the pin lands
    if (e * E8 >= crossT[1] - 0.6 && e * E8 < crossT[1]) continue;   // silence before the payoff
    const ch = prog[Math.floor(e / 8)];
    pluck(e * E8, nz(ch[e % 4]), 0.1, e % 2 ? 0.25 : -0.25, 0.22, 2600, 0.2);
  }
  for (let b = 0; b < 12; b++) bass(b * BEAT, nz(['D2', 'Bb1', 'C2'][Math.floor(b / 4)]), 0.16);
  to = 's';
  for (const t of [q.labels, q.labels + 0.15, q.line + 0.45, q.name, 3.1, 3.2, 3.3, 3.4]) blip(t, 700, 1500, 0.06, 0.05);
  sweep(q.zoom, q.zoom + 0.7, 0.03, 300, 2400, 0);     // map whoosh on the zoom
  sweep(2.5, 3.05, 0.025, 2400, 400, 0);               // whoosh out through the morph
  noiseHit(q.pin + 0.12, 0.12, 'lowpass', 600, 1, 0.12); sub(q.pin + 0.12, 0.1);   // the pin lands
  for (let i = 0; i < 6; i++) blip(q.line + i * 0.1, 2400, 2200, 0.015, 0.02);      // the border ticks on
  // the payoff: the second border crossing, the counter hits 2
  to = 's'; sub(crossT[1], 0.4); noiseHit(crossT[1], 0.3, 'lowpass', 900, 1, 0.25); blip(crossT[0], 700, 1500, 0.08, 0.08);
  to = 'm'; chime(crossT[1], [nz('D5'), nz('F5'), nz('A5'), nz('D6')], 0.1);
