#!/usr/bin/env node
// Render one frame of a piece to a PNG (a style's sample.png, a frame to compare against a reference),
// or several side by side (the look check's 2-4 style frames): seconds = '2.25,9.75,16.5'.
//   usage: node tools/still.mjs <piece dir | index.html> <seconds[,seconds...]> <out.png> [--scale 0.5] [--format 1:1] [--gpu]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchGpu } from './gpu.mjs';
const require = createRequire(import.meta.url);
const { chromium } = (() => { try { return require('playwright'); } catch { return require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); } })();
const args = process.argv.slice(2);
const si = args.indexOf('--scale'), scale = si >= 0 ? Number(args.splice(si, 2)[1]) : 1;
const fi = args.indexOf('--format'), format = fi >= 0 ? args.splice(fi, 2)[1] : null;
const gi = args.indexOf('--gpu'), gpu = gi >= 0 && !!args.splice(gi, 1);
const [src, sec, out] = args;
if (!src || sec == null || !out) { console.error('usage: node tools/still.mjs <piece dir | index.html> <seconds> <out.png> [--scale 0.5] [--format 1:1] [--gpu]'); process.exit(2); }
const file = src.endsWith('.html') ? src : path.join(src, 'index.html');
let browser = await chromium.launch(), page;
async function open() {
  page = await browser.newPage();
  page.on('pageerror', (e) => { console.error('PAGE ERROR:', e.message); process.exitCode = 1; });
  await page.goto(pathToFileURL(path.resolve(file)).href + '?export=1' + (format ? `&format=${encodeURIComponent(format)}` : ''));
  await page.waitForFunction(() => window.TIMELINE && window.renderFrame);
  await page.evaluate(() => document.fonts.ready);
}
await open();
// WebGL pieces (TIMELINE.gpu or --gpu) re-open on the real GPU
if (gpu || await page.evaluate(() => !!window.TIMELINE.gpu)) { await browser.close(); browser = await launchGpu(chromium); await open(); }
const times = String(sec).split(',').map(Number);
const url = await page.evaluate(([ts, k]) => {
  const T = window.TIMELINE, c = document.createElement('canvas'); c.width = T.width; c.height = T.height;
  const w = Math.round(T.width * k), h = Math.round(T.height * k), GAP = ts.length > 1 ? Math.round(24 * k) : 0;
  const s = document.createElement('canvas'); s.width = ts.length * w + (ts.length - 1) * GAP; s.height = h;
  const g = s.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, s.width, s.height); g.imageSmoothingQuality = 'high';
  ts.forEach((t, i) => { window.renderFrame(Math.round(t * T.fps) / T.fps, c); g.drawImage(c, i * (w + GAP), 0, w, h); });
  return s.toDataURL('image/png');
}, [times, scale]);
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
console.log('still', out, `t=${times.join(', ')}s`, `scale ${scale}`);
await browser.close();
