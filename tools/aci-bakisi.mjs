// tools/aci-bakisi.mjs — perspective captures from a named angle.
//
// kus-bakisi.mjs looks straight down, which is right for measuring a plan and
// wrong for judging a ride: a ferris wheel stands upright, so from overhead it
// is a line. Oscar's references are three-quarter views, so the comparison has
// to be one too.
//
// usage: node tools/aci-bakisi.mjs <out-dir> [name:x,z,dist,elev,azim ...]
//   x,z    the point the camera looks at
//   dist   metres back from it
//   elev   degrees above the ground
//   azim   degrees, 0 = camera due south of the target looking north,
//          rising anticlockwise seen from above
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';

const OUT = process.argv[2];
if (!OUT) throw new Error('usage: node tools/aci-bakisi.mjs <out-dir> [name:x,z,dist,elev,azim ...]');
await mkdir(OUT, { recursive: true });

const SHOTS = process.argv.slice(3).length
  ? process.argv.slice(3).map((spec) => {
    const [name, rest] = spec.split(':');
    const [x, z, dist, elev, azim] = rest.split(',').map(Number);
    return {
      name, x, z, dist, elev: elev ?? 35, azim: azim ?? 0,
    };
  })
  : [{
    name: 'lunapark', x: 31, z: -36, dist: 46, elev: 34, azim: 45,
  }];

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
await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 1 });
await page.goto(`${base}/?qa=1&perf=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__SHOT__, { timeout: 60_000 });
await page.waitForSelector('#enter-game', { timeout: 20_000 });
await wait(1200);
await page.click('#enter-game');
await page.waitForFunction(() => window.__67VERSE_QA__?.player, { timeout: 60_000 });
await wait(6000);

for (const shot of SHOTS) {
  const result = await page.evaluate((s) => new Promise((resolve) => {
    const { renderer, scene, ctx, THREE } = window.__SHOT__;
    ctx.quality?.applyPreference?.('low');
    scene.updateMatrixWorld(true);
    const rad = Math.PI / 180;
    const el = s.elev * rad;
    const az = s.azim * rad;
    // Ground offset from the target, then lifted by the elevation.
    const flat = Math.cos(el) * s.dist;
    const cam = new THREE.PerspectiveCamera(38, 1400 / 1000, 0.1, 900);
    cam.position.set(
      s.x - Math.sin(az) * flat,
      Math.sin(el) * s.dist,
      s.z + Math.cos(az) * flat,
    );
    cam.lookAt(s.x, 1.5, s.z);
    cam.updateProjectionMatrix();
    requestAnimationFrame(() => {
      renderer.setRenderTarget(null);
      renderer.render(scene, cam);
      resolve(renderer.domElement.toDataURL('image/png'));
    });
  }), shot);
  const png = Buffer.from(result.split(',')[1], 'base64');
  await writeFile(join(OUT, `${shot.name}.png`), png);
  console.log(`${shot.name}: ${Math.round(png.length / 1024)}KB  ` +
    `(${shot.x}, ${shot.z}) dist=${shot.dist} elev=${shot.elev} azim=${shot.azim}`);
}

await browser.close();
await server.close();
