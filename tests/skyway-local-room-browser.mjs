import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { startLocalSkywayServer } from '../scripts/local-skyway-server.mjs';

const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

function chromeExecutable() {
  const executable = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!executable) throw new Error('Set CHROME_PATH to run the local Skyway browser proof');
  return executable;
}

async function openIsolatedSkyway(browser, url) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 960, height: 640, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body?.dataset.appReady === 'true');
  await page.waitForSelector('body.skyway-mode');
  return { context, page, errors };
}

test('two isolated browsers render local Skyway presence and visibly fall back to Echo Trial', {
  timeout: 60_000,
}, async () => {
  const vite = await createServer({
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  let local;
  let browser;
  const sessions = [];
  try {
    await vite.listen();
    const viteAddress = vite.httpServer.address();
    assert.ok(viteAddress && typeof viteAddress === 'object');
    local = await startLocalSkywayServer({ port: 0 });
    browser = await puppeteer.launch({
      executablePath: chromeExecutable(),
      headless: true,
      args: ['--hide-scrollbars', '--mute-audio'],
    });
    const url = `http://127.0.0.1:${viteAddress.port}/`
      + `?game=obstacle&qa=1&online=1&skywayPort=${local.port}&room=browser-proof`;
    sessions.push(await openIsolatedSkyway(browser, url));
    sessions.push(await openIsolatedSkyway(browser, url));

    await Promise.all(sessions.map(({ page }) => page.waitForFunction(() => (
      document.querySelector('.sw-mode')?.textContent === 'LOCAL DEV ROOM'
      && window.__67VERSE_SKYWAY_ROOM_QA__?.remotes?.length === 1
    ))));
    const before = await sessions[0].page.evaluate(() => ({
      ...window.__67VERSE_SKYWAY_ROOM_QA__.remotes[0],
    }));

    // Wait out the authored countdown so the course admits player controls.
    await sessions[1].page.bringToFront();
    await sessions[1].page.waitForFunction(() => (
      document.querySelector('.sw-time')?.textContent !== '0:00.0'
    ), { timeout: 8_000 });
    await sessions[1].page.keyboard.down('w');
    await new Promise((resolve) => setTimeout(resolve, 700));
    await sessions[1].page.keyboard.up('w');
    await sessions[0].page.waitForFunction((start) => {
      const remote = window.__67VERSE_SKYWAY_ROOM_QA__?.remotes?.[0];
      return remote && Math.hypot(remote.x - start.x, remote.z - start.z) > 0.08;
    }, { timeout: 5_000 }, before);
    // The opening Ribbon Run includes an authored jump seam and broad
    // sweeper. Pulse the documented jump control while running so the
    // edge-triggered input reaches the seam instead of firing once at room
    // join and then remaining held.
    const jumpTimer = setInterval(() => {
      sessions[1].page.keyboard.press('Space').catch(() => {});
    }, 650);
    await sessions[1].page.keyboard.down('w');
    try {
      try {
        await sessions[0].page.waitForFunction(() => {
          const remote = window.__67VERSE_SKYWAY_ROOM_QA__?.remotes?.[0];
          return remote
            && remote.checkpoint >= 1
            && remote.presentedCheckpoint === remote.checkpoint
            && window.__67VERSE_SKYWAY_ROOM_QA__?.course?.tick > 0;
        }, { timeout: 22_000 });
      } catch (error) {
        const authority = local.authority.inspectRoom('browser-proof');
        const observer = await sessions[0].page.evaluate(
          () => window.__67VERSE_SKYWAY_ROOM_QA__,
        );
        error.message += `; authority=${JSON.stringify(authority)}; observer=${JSON.stringify(observer)}`;
        throw error;
      }
    } finally {
      clearInterval(jumpTimer);
      await sessions[1].page.keyboard.up('w');
    }

    await local.stop();
    local = null;
    await Promise.all(sessions.map(({ page }) => page.waitForFunction(() => (
      document.querySelector('.sw-mode')?.textContent === 'ECHO TRIAL'
      && window.__67VERSE_SKYWAY_ROOM_QA__?.remotes?.length === 0
    ), { timeout: 5_000 })));
    assert.deepEqual(sessions.map(({ errors }) => errors), [[], []]);
  } finally {
    await Promise.all(sessions.map(({ context }) => context.close()));
    await browser?.close();
    await local?.stop();
    await vite.close();
  }
});
