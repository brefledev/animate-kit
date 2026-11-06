// node tests/world-map.mjs [artifact-directory]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skill = path.join(repo, 'plugins/animate/skills/animate');
const output = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'animate-map-'));
fs.mkdirSync(output, { recursive: true });
fs.cpSync(path.join(skill, 'styles/world-map/demo/src'), path.join(output, 'src'), { recursive: true });
fs.copyFileSync(path.join(skill, 'styles/world-map/demo/piece.json'), path.join(output, 'piece.json'));
const built = spawnSync(process.execPath, [path.join(skill, 'tools/build.mjs'), output], { encoding: 'utf8' });
assert.equal(built.status, 0, built.stderr);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.resolve(output, 'index.html')).href + '?export=1');
  await page.evaluate(() => document.fonts.ready);
  const hashes = [];
  for (const history of [[0, 4], [4], [5, 4]]) {
    const png = await page.evaluate(times => {
      WM_COAST.clear();
      for (const t of times) renderFrame(t);
      return document.querySelector('canvas').toDataURL();
    }, history);
    hashes.push(createHash('sha256').update(png).digest('hex'));
  }
  assert.equal(new Set(hashes).size, 1, 'Frame pixels must be independent of earlier timestamps');
  const translated = await page.evaluate(() => {
    const p = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const a = wmCoast(p, 'moving-fixture');
    const b = wmCoast(p.map(([x, y]) => [x + 200, y + 300]), 'moving-fixture');
    return a.every(([x, y], i) => Math.abs(b[i][0] - x - 200) < 1e-9 && Math.abs(b[i][1] - y - 300) < 1e-9);
  });
  assert.ok(translated, 'Reusing a coastline key must honor new input geometry');
  const result = { status: 'passed', histories: [[0, 4], [4], [5, 4]], hashes, translated };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
