  // =====================================================================
  //  kit/score-tail.js — render, fold the tail over the loop point, loudness stage
  //  (integrated loudness to -15 LUFS, true-peak limiter at -2 dBTP; stems share the mix gain curve)
  // =====================================================================
  const buf = await ac.startRendering();
  // fold the tail over the loop point so the loop is seamless
  const N = Math.round(LOOP_T * sampleRate), L = new Float32Array(N), Rr = new Float32Array(N);
  const c0 = buf.getChannelData(0), c1 = buf.getChannelData(1);
  for (let i = 0; i < N; i++) { L[i] = c0[i] + (i + N < len ? c0[i + N] : 0); Rr[i] = c1[i] + (i + N < len ? c1[i + N] : 0); }
  // loudness for a phone: integrated loudness (ITU-R BS.1770: K-weighted, gated) to -15 LUFS, the middle of review's
  // -16 to -14 target, then a look-ahead limiter on the true (4x oversampled) peak at -2 dBTP. The AAC encode adds 0.4 to
  // 1 dB of overshoot on a typical score, so that file stays at or under -1 dBTP; hard full-scale transients took about
  // 3 dB in a test, so tools/export.mjs measures the decoded file and limits lower until it is. A make-up pass restores
  // what the limiter took; a peaky score (square waves) gets more passes only while it sits under -16 LUFS, since each
  // costs more gain reduction.
  // Stems reuse the mix's gain and gain curve, so they sum back to the mix.
  let k = normIn?.k, g = normIn?.g;
  if (!g) {
    const TARGET = -15, FLOOR = -16, CEIL = 10 ** (-2 / 20);
    g = new Float32Array(N).fill(1);
    k = 10 ** ((TARGET - lufs(L, Rr, null, 1, sampleRate)) / 20);
    for (let pass = 0; ; pass++) {
      truePeakGain(L, Rr, k, CEIL, sampleRate, g);
      const l = lufs(L, Rr, g, k, sampleRate);
      if (pass === 3 || (pass > 0 && l >= FLOOR)) break;
      k *= 10 ** ((TARGET - l) / 20);
    }
  }
  for (let i = 0; i < N; i++) { L[i] *= k * g[i]; Rr[i] *= k * g[i]; }
  return { left: L, right: Rr, sampleRate, norm: { k, g } };
}
// integrated loudness (LUFS) of k * g[i] * (L, R): K-weighting with the BS.1770 filters at any sample rate (libebur128's
// formulas), 400 ms blocks every 100 ms, an absolute gate at -70 LUFS and a relative gate 10 LU under the mean
function lufs(L, R, g, k, sr) {
  const shelf = (() => { const K = Math.tan(Math.PI * 1681.974450955533 / sr), Q = 0.7071752369554196, Vh = 10 ** (3.999843853973347 / 20), Vb = Vh ** 0.4996667741545416, a0 = 1 + K / Q + K * K;
    return { b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], a: [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] }; })();
  const hp = (() => { const K = Math.tan(Math.PI * 38.13547087602444 / sr), Q = 0.5003270373238773, a0 = 1 + K / Q + K * K;
    return { b: [1, -2, 1], a: [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] }; })();
  const biquad = ({ b, a }, x) => { const y = new Float64Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
  const kw = (x) => { const s = new Float64Array(x.length); for (let i = 0; i < x.length; i++) s[i] = x[i] * k * (g ? g[i] : 1); return biquad(hp, biquad(shelf, s)); };
  const yl = kw(L), yr = kw(R), B = Math.round(0.4 * sr), S = Math.round(0.1 * sr), P = new Float64Array(L.length + 1);
  for (let i = 0; i < L.length; i++) P[i + 1] = P[i] + yl[i] * yl[i] + yr[i] * yr[i];
  const z = []; for (let s = 0; s + B <= L.length; s += S) z.push((P[s + B] - P[s]) / B);
  const ld = (e) => -0.691 + 10 * Math.log10(e + 1e-15);
  const abs = z.filter((e) => ld(e) > -70); if (!abs.length) return -70;
  const rel = ld(abs.reduce((a, b) => a + b, 0) / abs.length) - 10, gated = abs.filter((e) => ld(e) > rel);
  return ld(gated.reduce((a, b) => a + b, 0) / gated.length);
}
// lower g (in place) so the 4x-oversampled peak of k * g * (L, R) stays under ceil: per-sample need from a windowed-sinc
// interpolation at the three in-between phases, then a look-ahead attack (1.5 ms) and a release (90 ms)
function truePeakGain(L, R, k, ceil, sr, g) {
  const N = L.length, TAPS = 16, win = (x) => 0.5 + 0.5 * Math.cos(Math.PI * x / (TAPS + 1));
  const coef = [0.25, 0.5, 0.75].map((p) => Array.from({ length: 2 * TAPS }, (_, j) => { const d = j - TAPS + 1 - p; return (Math.abs(d) < 1e-9 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d)) * win(d); }));
  const need = new Float32Array(N).fill(1);
  for (const X of [L, R]) for (let i = 0; i < N; i++) {
    let pk = Math.abs(X[i] * g[i]);
    // the phases sit between i and i + 1, so a peak rising into a loud sample from a quiet one is checked too
    if (Math.max(pk, i + 1 < N ? Math.abs(X[i + 1] * g[i + 1]) : 0) * k > ceil * 0.5) for (const c of coef) { let v = 0; for (let j = 0; j < 2 * TAPS; j++) { const n = i + j - TAPS + 1; if (n >= 0 && n < N) v += c[j] * X[n] * g[n]; } pk = Math.max(pk, Math.abs(v)); }
    const p = pk * k; if (p > ceil) need[i] = Math.min(need[i], ceil / p);
  }
  const att = Math.exp(-1 / (0.0015 * sr)), rel = Math.exp(-1 / (0.09 * sr));
  for (let i = N - 2; i >= 0; i--) need[i] = Math.min(need[i], 1 - (1 - need[i + 1]) * att);
  let r = 1; for (let i = 0; i < N; i++) { r = Math.min(need[i], 1 - (1 - r) * rel); g[i] *= r; }
}
function wavB64(s) {
  const bytes = encodeWav(s.left, s.right, s.sampleRate);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function renderAudioWav() { return wavB64(await buildScore(48000, 'mix')); }
async function renderAudioStems() {
  const mix = await buildScore(48000, 'mix');
  const music = await buildScore(48000, 'music', mix.norm), sfx = await buildScore(48000, 'sfx', mix.norm);
  return { music: wavB64(music), sfx: wavB64(sfx) };
}
window.renderAudioWav = renderAudioWav;
window.renderAudioStems = renderAudioStems;
</script>
</body>
</html>
