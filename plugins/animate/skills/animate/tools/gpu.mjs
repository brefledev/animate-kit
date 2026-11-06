// GPU launch flags per platform, and a check that WebGL really runs on a GPU.
// Headless Chromium falls back to software rendering (SwiftShader / llvmpipe) when it can't reach the GPU:
// the frames are still correct, just many times slower. WebGL pieces set TIMELINE.gpu (or pass --gpu):
// export, review, still and framehash then launch with launchGpu().
export const GPU_ARGS = process.platform === 'win32' ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
  : process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
  : ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'];   // Linux: angle=vulkan gives no WebGL headless; angle=gl reaches the GPU (RTX 3050: 31 vs 464 ms/frame software)

// Launch for a WebGL piece: GPU flags first; if WebGL won't start with them, relaunch without (software, correct but slow).
export async function launchGpu(chromium, base = []) {
  let browser;
  try {
    browser = await chromium.launch({ args: [...base, ...GPU_ARGS] });
    const p = await browser.newPage();
    let r;
    try { r = await gpuReport(p); } finally { await p.close(); }
    if (r.renderer !== 'no WebGL') return browser;
  } catch (e) {
    console.warn(`GPU launch failed: ${e.message}`);
  }
  if (browser) await browser.close();
  console.warn('GPU flags unavailable: relaunching with default rendering');
  const sw = await chromium.launch({ args: base });
  try {
    const q = await sw.newPage();
    let r;
    try { r = await gpuReport(q); } finally { await q.close(); }
    if (r.renderer === 'no WebGL') throw new Error('WebGL is unavailable with both GPU and default Chromium flags. Check the graphics driver or install a software WebGL backend.');
    return sw;
  } catch (e) { await sw.close(); throw e; }
}

export async function gpuReport(page) {
  const r = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    if (!gl) return { ok: false, renderer: 'no WebGL' };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return { ok: !/swiftshader|llvmpipe|software|basic render/i.test(renderer), renderer };
  });
  if (r.ok) console.log(`gpu: ${r.renderer}`);
  else console.warn(`WARNING: WebGL renderer: ${r.renderer}. ` +
    (process.platform === 'darwin' ? 'On macOS expect software rendering in headless mode, or run with a display.' : 'Check the graphics driver.'));
  return r;
}
