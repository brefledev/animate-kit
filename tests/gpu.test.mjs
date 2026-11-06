import test from 'node:test';
import assert from 'node:assert/strict';
import { launchGpu, GPU_ARGS } from '../plugins/animate/skills/animate/tools/gpu.mjs';

function fakeChromium(outcomes) {
  const launches = [], browsers = [];
  return { launches, browsers, async launch(options) {
    launches.push(options);
    const result = outcomes.shift();
    if (result instanceof Error) throw result;
    const b = { closed: false, pageClosed: false,
      async newPage() { return { evaluate: async () => result,
        close: async () => { b.pageClosed = true; } }; },
      async close() { b.closed = true; } };
    browsers.push(b); return b;
  } };
}
test('hardware renderer keeps launch flags and closes probe page', async () => {
  const c = fakeChromium([{ ok: true, renderer: 'hardware' }]);
  const b = await launchGpu(c, ['--custom']);
  assert.deepEqual(c.launches[0].args, ['--custom', ...GPU_ARGS]);
  assert.equal(b.pageClosed, true); assert.equal(b.closed, false); await b.close();
});
test('missing WebGL retries default flags and closes failed browser', async () => {
  const c = fakeChromium([{ ok: false, renderer: 'no WebGL' }, { ok: false, renderer: 'SwiftShader' }]);
  const b = await launchGpu(c, ['--custom']);
  assert.deepEqual(c.launches[1].args, ['--custom']);
  assert.equal(c.browsers[0].closed, true); assert.equal(b.pageClosed, true); await b.close();
});
test('GPU launch error falls back', async () => {
  const c = fakeChromium([new Error('driver failed'), { ok: false, renderer: 'llvmpipe' }]);
  const b = await launchGpu(c); assert.equal(c.launches.length, 2); await b.close();
});
test('both renderers unavailable fails and releases both browsers', async () => {
  const c = fakeChromium([{ ok: false, renderer: 'no WebGL' }, { ok: false, renderer: 'no WebGL' }]);
  await assert.rejects(launchGpu(c), /WebGL is unavailable/);
  assert.ok(c.browsers.every(b => b.closed && b.pageClosed));
});
