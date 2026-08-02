import { createHash } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const artifactDir = join(projectRoot, 'artifacts', 'movement-qa');
const chromeCandidates = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
].filter(Boolean);

async function chromeExecutable() {
  for (const candidate of chromeCandidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  throw new Error('Movement QA needs Chrome or Chromium.');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function finite(value) {
  return Number.isFinite(value) ? value : 0;
}

function jointRotation(frame, role, axis) {
  return finite(frame.animation.pose?.joints?.[role]?.rotation?.[axis]);
}

async function snapshot(page, id, label) {
  const state = await page.evaluate(() => ({
    player: window.__67VERSE_QA__.player(),
    camera: window.__67VERSE_QA__.camera(),
    animation: window.__67VERSE_QA__.animation(),
  }));
  const file = join(artifactDir, `${id}.png`);
  const bytes = await page.screenshot({ path: file });
  return {
    id,
    label,
    screenshot: relative(projectRoot, file),
    screenshotSha256: sha256(bytes),
    ...state,
    bytes,
  };
}

async function captureContactSheet(browser, frames) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1320, height: 980, deviceScaleFactor: 1 });
  const cards = frames.map((frame) => {
    const pose = frame.animation.pose;
    const summary = [
      frame.animation.locomotionState,
      `phase ${finite(pose?.phase).toFixed(2)}`,
      `stride ${finite(pose?.stride).toFixed(2)}`,
      `foot ${frame.animation.contact?.foot || '?'}`,
    ].join(' · ');
    return `
      <figure>
        <img src="data:image/png;base64,${frame.bytes.toString('base64')}">
        <figcaption><strong>${frame.label}</strong><br>${summary}</figcaption>
      </figure>
    `;
  }).join('');
  await page.setContent(`
    <!doctype html>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 20px;
        color: #f8f4ec;
        background: #17202a;
        font: 15px/1.35 system-ui, sans-serif;
      }
      h1 { margin: 0 0 16px; font-size: 24px; }
      main { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      figure {
        margin: 0;
        overflow: hidden;
        border: 2px solid #314557;
        border-radius: 12px;
        background: #22303d;
      }
      img { display: block; width: 100%; height: auto; }
      figcaption { padding: 10px 12px 12px; }
      strong { color: #f2bf52; }
    </style>
    <h1>67VERSE procedural QA Runner - browser movement proof</h1>
    <main>${cards}</main>
  `, { waitUntil: 'load' });
  const file = join(artifactDir, 'movement-contact-sheet.png');
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
  return relative(projectRoot, file);
}

async function run() {
  await mkdir(artifactDir, { recursive: true });
  const server = await createServer({
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address !== 'object') {
    throw new Error('Movement QA server did not bind.');
  }
  const browser = await puppeteer.launch({
    executablePath: await chromeExecutable(),
    headless: true,
    args: ['--hide-scrollbars', '--mute-audio'],
  });

  const errors = [];
  const frames = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${address.port}/?qa=1&perf=1`, {
      waitUntil: 'domcontentloaded',
    });
    await page.click('#enter-game');
    await page.waitForFunction(() => (
      window.__67VERSE_QA__?.animation()?.characterId === 'qa-runner'
    ));
    await page.evaluate(() => {
      document.querySelector('#dev-overlay')?.remove();
      document.querySelector('.ps-objective')?.remove();
    });

    await page.keyboard.down('KeyW');
    await page.waitForFunction(() => {
      const animation = window.__67VERSE_QA__?.animation();
      return animation?.locomotionState === 'run'
        && animation.pose?.locomotionWeight > 0.8
        && animation.pose?.stride > 0.72;
    }, { timeout: 8_000 });
    frames.push(await snapshot(page, 'stride-a', 'Run - right leg back'));

    await page.waitForFunction((serial) => {
      const animation = window.__67VERSE_QA__?.animation();
      return animation?.contact?.serial > serial
        && animation.pose?.stride < -0.72;
    }, { timeout: 8_000 }, frames[0].animation.contact.serial);
    frames.push(await snapshot(page, 'stride-b', 'Run - left leg back'));

    await page.keyboard.down('Space');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 90));
    await page.keyboard.up('Space');
    await page.waitForFunction(() => {
      const animation = window.__67VERSE_QA__?.animation();
      const player = window.__67VERSE_QA__?.player();
      return animation?.locomotionState === 'jump' && player?.y > 0.28;
    }, { timeout: 5_000 });
    frames.push(await snapshot(page, 'jump-rise', 'Jump - rising pose'));

    await page.waitForFunction(() => (
      window.__67VERSE_QA__?.animation()?.locomotionState === 'fall'
    ), { timeout: 5_000 });
    frames.push(await snapshot(page, 'jump-fall', 'Jump - falling pose'));
    await page.keyboard.up('KeyW');
    await page.close();

    const strideA = frames[0];
    const strideB = frames[1];
    const evidence = {
      stateSequence: frames.map((frame) => frame.animation.locomotionState),
      contactSerialDelta:
        strideB.animation.contact.serial - strideA.animation.contact.serial,
      playerDistance:
        Math.hypot(
          strideB.player.x - strideA.player.x,
          strideB.player.z - strideA.player.z,
        ),
      armSwingRadians: {
        left: Math.abs(
          jointRotation(strideA, 'arm-l', 'x')
          - jointRotation(strideB, 'arm-l', 'x'),
        ),
        right: Math.abs(
          jointRotation(strideA, 'arm-r', 'x')
          - jointRotation(strideB, 'arm-r', 'x'),
        ),
      },
      legSwingRadians: {
        left: Math.abs(
          jointRotation(strideA, 'leg-l', 'x')
          - jointRotation(strideB, 'leg-l', 'x'),
        ),
        right: Math.abs(
          jointRotation(strideA, 'leg-r', 'x')
          - jointRotation(strideB, 'leg-r', 'x'),
        ),
      },
      jumpHeight: Math.max(frames[2].player.y, frames[3].player.y),
    };
    const failures = [];
    if (errors.length) failures.push(...errors);
    if (evidence.stateSequence.join(',') !== 'run,run,jump,fall') {
      failures.push(`unexpected state sequence ${evidence.stateSequence.join(',')}`);
    }
    if (evidence.contactSerialDelta < 1) failures.push('feet did not alternate');
    if (evidence.playerDistance < 0.2) failures.push('player did not move');
    for (const [side, radians] of Object.entries(evidence.armSwingRadians)) {
      if (radians < 0.9) failures.push(`${side} arm swing ${radians.toFixed(2)}rad`);
    }
    for (const [side, radians] of Object.entries(evidence.legSwingRadians)) {
      if (radians < 1.1) failures.push(`${side} leg swing ${radians.toFixed(2)}rad`);
    }
    if (evidence.jumpHeight < 0.4) failures.push('jump did not visibly leave the ground');

    const contactSheet = await captureContactSheet(browser, frames);
    const report = {
      kind: '67verse-movement-qa-report',
      generatedAt: new Date().toISOString(),
      caveat: 'Procedural QA placeholder, not a production character rig.',
      status: failures.length ? 'fail' : 'pass',
      failures,
      evidence,
      contactSheet,
      frames: frames.map(({ bytes, ...frame }) => frame),
    };
    const reportFile = join(artifactDir, 'report.json');
    await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
    if (failures.length) {
      throw new Error(`Movement QA failed:\n- ${failures.join('\n- ')}`);
    }
    console.log(
      `movement QA PASS -> ${relative(projectRoot, reportFile)}; `
      + `arms ${evidence.armSwingRadians.left.toFixed(2)}/`
      + `${evidence.armSwingRadians.right.toFixed(2)}rad; `
      + `legs ${evidence.legSwingRadians.left.toFixed(2)}/`
      + `${evidence.legSwingRadians.right.toFixed(2)}rad`,
    );
  } finally {
    await browser.close();
    await server.close();
  }
}

await run();
process.exit(0);
