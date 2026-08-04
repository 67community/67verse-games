// tools/kus-bakisi.mjs — orthographic bird's-eye captures of the live hub.
//
// Serves the app with its own Vite server, appends one line to main.js that
// exposes the renderer and ctx, then draws a fixed orthographic camera over
// the world. Nothing is written into the repo's source.
//
// It forces the LOW quality tier before drawing. The high tier renders through
// the AO composer, which leaves a render target bound; a direct render then
// draws into that target and the canvas reads back solid black — every capture
// after ambient occlusion landed was a black PNG until this.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';

const OUT = process.argv[2];
if (!OUT) throw new Error('usage: node tools/kus-bakisi.mjs <out-dir> [name:x,z,half ...]');
await mkdir(OUT, { recursive: true });

// name:centreX,centreZ,halfExtent — default is the whole plan.
const SHOTS = process.argv.slice(3).length
  ? process.argv.slice(3).map((spec) => {
    const [name, rest] = spec.split(':');
    const [x, z, half] = rest.split(',').map(Number);
    return { name, x, z, half };
  })
  : [{ name: 'tum-harita', x: 0, z: 0, half: 62 }];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [{
    name: 'expose',
    transform(code, id) {
      if (id.replace(/\\/g, '/').endsWith('/src/main.js')) {
        return { code: `${code}\nwindow.__SHOT__ = { renderer, scene, camera, ctx, THREE };\n`, map: null };
      }
      return undefined;
    },
  }],
});
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--hide-scrollbars', '--mute-audio', '--use-gl=angle', '--enable-unsafe-swiftshader'],
});

const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  [page error]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 160)); });
await page.setViewport({ width: 1400, height: 1400, deviceScaleFactor: 1 });
await page.goto(`${base}/?qa=1&perf=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__SHOT__, { timeout: 60_000 });
await page.waitForSelector('#enter-game', { timeout: 20_000 });
await wait(1200);
await page.click('#enter-game');
await page.waitForFunction(() => window.__67VERSE_QA__?.player, { timeout: 60_000 });
await wait(6000);
if (process.env.HIDE) {
  await page.evaluate((names) => { window.__HIDE__ = names; }, process.env.HIDE.split(','));
}

for (const shot of SHOTS) {
  const result = await page.evaluate(({ x, z, half }) => new Promise((resolve) => {
    const { renderer, scene, ctx, THREE } = window.__SHOT__;
    ctx.quality?.applyPreference?.('low');
    scene.updateMatrixWorld(true);
    const hidden = [];
    const drop = (window.__HIDE__ || []);
    scene.traverse((o) => {
      if (!o.isMesh || o.visible === false) return;
      if (drop.some((n) => o.name === n)) { hidden.push(o); o.visible = false; return; }
      const box = new THREE.Box3().setFromObject(o);
      if (!box.isEmpty() && box.min.y > 14) { hidden.push(o); o.visible = false; }
    });
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 900);
    cam.position.set(x, 300, z);
    cam.up.set(0, 0, -1);
    cam.lookAt(x, 0, z);
    cam.updateProjectionMatrix();
    const fog = scene.fog;
    scene.fog = null;
    requestAnimationFrame(() => {
      renderer.setRenderTarget(null);
      renderer.render(scene, cam);
      const data = renderer.domElement.toDataURL('image/png');
      scene.fog = fog;
      hidden.forEach((o) => { o.visible = true; });
      resolve(data);
    });
  }), shot);
  const png = Buffer.from(result.split(',')[1], 'base64');
  await writeFile(join(OUT, `${shot.name}.png`), png);
  console.log(`${shot.name}: ${Math.round(png.length / 1024)}KB`);
}

await browser.close();
await server.close();
