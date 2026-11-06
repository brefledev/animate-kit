// End-to-end renderer regression: requires Playwright Chromium and ffmpeg on PATH.
// node tests/rendering.mjs [output-directory]; artifacts are retained for inspection.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skill = path.join(repo, 'plugins/animate/skills/animate');
const output = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'animate-kit-test-'));
fs.mkdirSync(output, { recursive: true });
function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  fs.appendFileSync(path.join(output, 'commands.log'), `${cmd} ${args.join(' ')}\n${r.stdout || ''}${r.stderr || ''}\n`);
  assert.equal(r.status, 0, `${cmd} failed: ${r.error?.message || r.stderr || r.stdout}`);
  return r.stdout;
}
const tool = (name, ...args) => run(process.execPath, [path.join(skill, 'tools', name + '.mjs'), ...args]);
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const probe = file => JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));
const map = path.join(output, 'world-map');
fs.mkdirSync(map, { recursive: true });
fs.cpSync(path.join(skill, 'styles/world-map/demo/src'), path.join(map, 'src'), { recursive: true });
fs.copyFileSync(path.join(skill, 'styles/world-map/demo/piece.json'), path.join(map, 'piece.json'));
tool('build', map);
tool('still', map, '1,3.5,5.5', path.join(output, 'world-map.png'), '--scale', '0.25');
tool('export', map, '--only-audio', '--no-mux', '--exact-audio');
const audioHash = hash(path.join(map, 'renders/audio.wav'));
tool('export', map, '--only-audio', '--no-mux', '--exact-audio');
assert.equal(hash(path.join(map, 'renders/audio.wav')), audioHash, 'exact score audio changed between browser launches');

// Exercise the exact-audio graph edit contract in a real browser, including a disconnected source.
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
let graph;
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.join(map, 'index.html')).href + '?export=1&exact-audio');
  graph = await page.evaluate(async () => {
    const ac = new OfflineAudioContext(1, 1024, 48000);
    const a = ac.createConstantSource(), b = ac.createConstantSource();
    a.offset.value = .25; b.offset.value = .5;
    a.connect(ac.destination); b.connect(ac.destination); a.disconnect(ac.destination);
    a.start(); b.start();
    const result = await Promise.race([ac.startRendering(), new Promise((_, reject) => setTimeout(() => reject(new Error('Offline graph render timed out')), 10000))]);
    return Array.from(result.getChannelData(0));
  });
  assert.ok(graph.every(v => v === .5), 'disconnect must remove deferred audio edges');
} finally { await browser.close(); }

// A small loud fixture exercises both aspect variants, captions, peak repair and AAC stream copying.
const fixture = path.join(output, 'fixture'); fs.mkdirSync(fixture, { recursive: true });
fs.writeFileSync(path.join(fixture, 'piece.json'), JSON.stringify({ formats: ['1:1', '16:9'] }));
fs.writeFileSync(path.join(fixture, 'index.html'), `<!doctype html><canvas id="c"></canvas><script>
const wide=new URLSearchParams(location.search).get('format')==='16:9', c=document.getElementById('c');
c.width=wide?320:240;c.height=wide?180:240;
window.TIMELINE={width:c.width,height:c.height,frames:24,fps:12,narration:[{t0:0,t1:1.8,text:'Caption format check'}]};
window.STYLE={ones:true};
window.renderFrame=t=>{const g=c.getContext('2d');g.fillStyle='#164866';g.fillRect(0,0,c.width,c.height);g.fillStyle='#ff9933';g.fillRect(10+t*40,30,40,40);};
window.renderAudioWav=async()=>{const n=96000,b=new ArrayBuffer(44+n*4),v=new DataView(b),s=(o,t)=>{for(let i=0;i<t.length;i++)v.setUint8(o+i,t.charCodeAt(i))};
s(0,'RIFF');v.setUint32(4,36+n*4,true);s(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,48000,true);v.setUint32(28,192000,true);v.setUint16(32,4,true);v.setUint16(34,16,true);s(36,'data');v.setUint32(40,n*4,true);
for(let i=0;i<n;i++){const x=Math.round(Math.sin(i*2*Math.PI*1000/48000)*32700);v.setInt16(44+i*4,x,true);v.setInt16(46+i*4,x,true)}
let z='';for(const x of new Uint8Array(b))z+=String.fromCharCode(x);return btoa(z)};
</script>`);
tool('export', fixture, '--formats', '1:1,16:9', '--workers', '2', '--share', '--blur', '2');
const videos = [];
for (const suffix of ['', '-320x180']) for (const prefix of ['final', 'share', 'final-caption-placeholder']) {
  const filename = prefix === 'final-caption-placeholder' ? `final${suffix}-captions.mp4` : `${prefix}${suffix}.mp4`;
  const file = path.join(fixture, 'renders', filename), data = probe(file), video = data.streams.find(s => s.codec_type === 'video');
  assert.equal(video.width, suffix ? 320 : 240); assert.equal(video.height, suffix ? 180 : 240);
  assert.equal(video.color_space, 'bt709'); assert.equal(data.streams.find(s => s.codec_type === 'audio').codec_name, 'aac');
  videos.push({ file: filename, width: video.width, height: video.height, duration: data.format.duration });
}
for (const suffix of ['', '-320x180']) {
  for (const prefix of ['final', 'share']) run('ffmpeg', ['-y', '-v', 'error', '-i', path.join(fixture, 'renders', `${prefix}${suffix}.mp4`), '-map', '0:a:0', '-c', 'copy', '-f', 'adts', path.join(output, `${prefix}${suffix}.aac`)]);
  assert.equal(hash(path.join(output, `final${suffix}.aac`)), hash(path.join(output, `share${suffix}.aac`)), 'share must preserve the AAC bytes');
}
tool('export', fixture, '--only-audio', '--format', '16:9', '--share');
fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ status: 'passed', exactAudioSha256: audioHash, disconnectedGraph: 'passed', videos }, null, 2));
console.log(`Renderer regressions passed. Artifacts: ${output}`);
