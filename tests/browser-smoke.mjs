import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { compileLevelForPlay } from '../src/ugc/format.js';
import {
  createNearMaxPublishedLocalWorld,
  nearMaxLocalWorldCollection,
  NEAR_MAX_UGC_WORLD_ID,
  NEAR_MAX_UGC_WORLD_NAME,
} from './fixtures/ugc-worlds.mjs';

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
  if (!executable) {
    throw new Error(
      'Browser smoke tests need system Chrome/Chromium. Set PUPPETEER_EXECUTABLE_PATH or CHROME_PATH.',
    );
  }
  return executable;
}

let server;
let browser;
let baseUrl;

before(async () => {
  server = await createServer({
    logLevel: 'error',
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
    },
  });
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address && typeof address === 'object');
  baseUrl = `http://127.0.0.1:${address.port}`;

  browser = await puppeteer.launch({
    executablePath: chromeExecutable(),
    headless: true,
    args: ['--hide-scrollbars', '--mute-audio'],
  });
});

after(async () => {
  await browser?.close();
  await server?.close();
});

async function openPage(path = '/', viewport = {
  width: 1280,
  height: 800,
  deviceScaleFactor: 1,
}, initScript = null) {
  // Keep each smoke case's local prototype save isolated. Several cases run
  // complete reward loops, so a late storage write from a closing page must
  // never change another case's accounting assertions.
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  let contextClosed = false;
  page.close = async () => {
    if (contextClosed) return;
    contextClosed = true;
    await context.close();
  };
  await page.setViewport(viewport);
  if (initScript) await page.evaluateOnNewDocument(initScript);
  const errors = [];
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const source = message.location()?.url;
      errors.push(`console: ${message.text()}${source ? ` @ ${source}` : ''}`);
    }
  });
  page.on('requestfailed', (request) => {
    errors.push(`request: ${request.url()} (${request.failure()?.errorText || 'failed'})`);
  });
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body?.dataset.appReady === 'true');
  return { page, errors };
}

async function clickButton(page, label) {
  const count = await page.$$eval('button', (buttons, text) => (
    buttons.filter((button) => (
      button.textContent.trim() === text
      && button.getClientRects().length > 0
      && !button.disabled
    )).length
  ), label);
  assert.equal(count, 1, `expected one "${label}" button, found ${count}`);
  await page.$$eval('button', (buttons, text) => {
    buttons.find((button) => (
      button.textContent.trim() === text
      && button.getClientRects().length > 0
      && !button.disabled
    )).click();
  }, label);
}

async function clickButtonTwice(page, label) {
  const activated = await page.evaluate((text) => {
    const button = [...document.querySelectorAll('button')].find((candidate) => (
      candidate.textContent.trim() === text
      && candidate.getClientRects().length > 0
      && !candidate.disabled
    ));
    if (!button) return false;
    button.click();
    button.click();
    return true;
  }, label);
  assert.equal(activated, true, `expected one actionable "${label}" button`);
}

async function resetLocalProgress(page) {
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function savedCoins(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('67v.coins') || '0'));
}

async function resultCoins(page) {
  return page.$eval('[role="dialog"]', (dialog) => {
    const stat = [...dialog.querySelectorAll('.ps-result-stat')].find((candidate) => (
      candidate.querySelector('span')?.textContent.trim() === 'Coins earned'
    ));
    const match = stat?.querySelector('strong')?.textContent.match(/\+(\d+)\s+Coins/);
    return match ? Number(match[1]) : null;
  });
}

async function waitForBodyClass(page, className) {
  await page.waitForFunction(
    (name) => document.body.classList.contains(name),
    { timeout: 10_000 },
    className,
  );
}

async function waitForDialog(page, text, timeout = 15_000) {
  await page.waitForFunction(
    (expected) => [...document.querySelectorAll('[role="dialog"]')]
      .some((dialog) => dialog.textContent.includes(expected)),
    { timeout },
    text,
  );
}

async function waitForText(page, selector, text, timeout = 15_000) {
  await page.waitForFunction(
    ({ target, expected }) => [...document.querySelectorAll(target)]
      .some((element) => element.textContent.includes(expected)),
    { timeout },
    { target: selector, expected: text },
  );
}

async function assertHubCleanup(page, modeClass, hudSelector) {
  await page.waitForFunction(() => (
    document.activeElement?.id === 'primary-play'
    && document.querySelector('#hub-status')?.textContent
      === 'Returned to Skypark. Choose a local game or explore the hub.'
  ));
  const state = await page.evaluate(({ mode, hud }) => ({
    inGame: document.body.classList.contains('in-game'),
    modeClass: document.body.classList.contains(mode),
    dialogs: document.querySelectorAll('[role="dialog"]').length,
    huds: document.querySelectorAll(hud).length,
    canvases: document.querySelectorAll('canvas').length,
    modeName: document.querySelector('#mode-name')?.textContent,
    activeId: document.activeElement?.id,
    hubStatus: document.querySelector('#hub-status')?.textContent,
    hubStatusRole: document.querySelector('#hub-status')?.getAttribute('role'),
    hubStatusLive: document.querySelector('#hub-status')?.getAttribute('aria-live'),
  }), { mode: modeClass, hud: hudSelector });
  assert.deepEqual(state, {
    inGame: false,
    modeClass: false,
    dialogs: 0,
    huds: 0,
    canvases: 1,
    modeName: 'Game modeLocal play · training rivals',
    activeId: 'primary-play',
    hubStatus: 'Returned to Skypark. Choose a local game or explore the hub.',
    hubStatusRole: 'status',
    hubStatusLive: 'polite',
  });
}

async function assertNoBrowserErrors(errors) {
  assert.deepEqual(errors, []);
}

test('development navigation keeps legacy local modes and session-only chat reachable', { timeout: 20_000 }, async () => {
  const { page, errors } = await openPage('/?dev=1');
  try {
    await clickButton(page, 'ENTER SKYPARK');
    assert.equal(
      await page.evaluate(() => typeof window.__67VERSE_PERF__),
      'object',
    );
    await clickButton(page, '▶ PLAY GAMES');
    await waitForDialog(page, 'Play in Skypark');

    const playPanel = await page.$eval('[role="dialog"]', (dialog) => dialog.textContent);
    assert.match(playPanel, /online rooms are off in this build/i);
    assert.match(playPanel, /On this device · Training race/);
    assert.equal((playPanel.match(/On this device · Training rivals/g) || []).length, 2);
    for (const label of ['Play Skyway Sprint', 'Play Tag', 'Play Balloon Battle']) {
      assert.equal(await page.$$eval('button', (buttons, text) => (
        buttons.filter((button) => button.textContent.trim() === text).length
      ), label), 1);
    }

    await clickButton(page, '✕');
    await clickButton(page, '💬 LOCAL CHAT');
    await page.waitForSelector('[aria-label="On-device chat"]');
    const chatCopy = await page.$eval('[aria-label="On-device chat"]', (element) => element.textContent);
    assert.match(chatCopy, /Messages stay in this browser session/);
    assert.match(chatCopy, /Online chat is off in this build/);
    await clickButton(page, '✕');
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('Character Acceptance Lab stays dev-only and reports a real local GLB rejection', { timeout: 35_000 }, async () => {
  const publicRun = await openPage('/?qa=1&panel=character-lab');
  try {
    await new Promise((resolve) => setTimeout(resolve, 900));
    assert.equal(
      await publicRun.page.$('[aria-label="Character Acceptance Lab"]'),
      null,
    );
    assert.equal(await publicRun.page.$('.cal-root'), null);
    await assertNoBrowserErrors(publicRun.errors);
  } finally {
    await publicRun.page.close();
  }

  const { page, errors } = await openPage('/?dev=1');
  try {
    await clickButton(page, 'ENTER SKYPARK');
    await page.click('button[aria-label="Character Acceptance Lab"]');
    await waitForDialog(page, 'Character Acceptance Lab');
    assert.match(
      await page.$eval('.cal-private', (element) => element.textContent),
      /not uploaded, saved, equipped, or approved for release/i,
    );
    assert.equal(await page.$eval('#cal-file', (input) => input.accept), '.glb,model/gltf-binary');
    assert.match(
      await page.$eval('.cal-drop', (element) => element.textContent),
      /Select a local \.glb.*drop one here/s,
    );

    const input = await page.$('#cal-file');
    await input.uploadFile(new URL('../public/ghost.glb', import.meta.url).pathname);
    await waitForText(page, '.cal-file-fact', 'ghost.glb');
    assert.match(
      await page.$eval('#cal-manifest', (textarea) => textarea.value),
      /"id": "ghost"/,
    );
    await clickButton(page, 'Run acceptance inspection');
    await waitForText(page, '.cal-verdict', 'REJECTED', 15_000);
    const labFacts = await page.evaluate(() => {
      const reportButton = [...document.querySelectorAll('button')]
        .find((button) => button.textContent.trim() === 'Copy compact report');
      return {
        errors: document.querySelector('.cal-list.errors')?.textContent || '',
        status: document.querySelector('.cal-status')?.textContent || '',
        previewHidden: document.querySelector('.cal-preview-wrap')?.hidden,
        reportDisabled: reportButton?.disabled,
        report: JSON.parse(reportButton?.dataset.report || 'null'),
      };
    });
    assert.match(labFacts.errors, /at least one SkinnedMesh/);
    assert.match(labFacts.errors, /at least one Bone/);
    assert.match(labFacts.status, /not accepted/i);
    assert.equal(labFacts.previewHidden, true);
    assert.equal(labFacts.reportDisabled, false);
    assert.equal(labFacts.report.localOnly, true);
    assert.equal(labFacts.report.releaseApproved, false);
    assert.equal(labFacts.report.automatedInspection.status, 'rejected');
    assert.match(labFacts.report.decision, /NOT APPROVED/);

    await page.evaluate(() => {
      window.__characterLabUrlTrace = [];
      const createObjectURL = URL.createObjectURL.bind(URL);
      const revokeObjectURL = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        window.__characterLabUrlTrace.push('create');
        return createObjectURL(blob);
      };
      URL.revokeObjectURL = (url) => {
        window.__characterLabUrlTrace.push('revoke');
        revokeObjectURL(url);
      };
    });
    await clickButton(page, 'Download report JSON');
    await page.waitForFunction(() => (
      window.__characterLabUrlTrace?.includes('revoke')
    ));
    assert.deepEqual(
      await page.evaluate(() => window.__characterLabUrlTrace),
      ['create', 'revoke'],
    );
    await clickButton(page, '✕');
    assert.equal(await page.$('.cal-root'), null);
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('Physical-device playtest harness is dev-only, memory-only, and exports explicit human evidence', { timeout: 35_000 }, async () => {
  const publicRun = await openPage('/?qa=1&panel=device-playtest');
  try {
    await new Promise((resolve) => setTimeout(resolve, 900));
    assert.equal(
      await publicRun.page.$('[aria-label="Physical-device playtest"]'),
      null,
    );
    assert.equal(await publicRun.page.$('.dph-root'), null);
    assert.equal(
      await publicRun.page.evaluate(() => typeof window.__67VERSE_DEVICE_PLAYTEST__),
      'undefined',
    );
    await assertNoBrowserErrors(publicRun.errors);
  } finally {
    await publicRun.page.close();
  }

  const { page, errors } = await openPage('/?dev=1');
  try {
    await clickButton(page, 'ENTER SKYPARK');
    await page.waitForFunction(() => window.__67VERSE_PERF__?.snapshot);
    // Let the app's independent idle progression hydration finish before
    // tracing only the harness interactions below.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await page.evaluate(() => {
      window.__devicePlaytestStorageTrace = [];
      for (const method of ['setItem', 'removeItem', 'clear']) {
        const original = Storage.prototype[method];
        Storage.prototype[method] = function tracedStorageMutation(...args) {
          window.__devicePlaytestStorageTrace.push({
            area: this === localStorage ? 'local' : 'session',
            method,
            key: args[0] ?? null,
          });
          return original.apply(this, args);
        };
      }
    });
    await page.click('button[aria-label="Physical-device playtest"]');
    await waitForDialog(page, 'Physical-device playtest');
    assert.match(
      await page.$eval('.dph-private', (element) => element.textContent),
      /stay in memory.*nothing is uploaded or saved/i,
    );
    assert.match(
      await page.$eval('.dph-live', (element) => element.textContent),
      /route\s+hub:hub.*room\s+not-applicable.*frame.*display.*input.*quality.*memory/s,
    );

    await page.type('[aria-label="Playtest observation"]', 'Human observed a hub pass on a representative phone.');
    await clickButton(page, 'Append current snapshot');
    await page.waitForFunction(() => (
      document.querySelector('.dph-panel')?.dataset.observationCount === '1'
    ));
    await page.select('[aria-label="Skypark hub traversal status"]', 'pass');
    await page.type('[aria-label="Skypark hub traversal note"]', 'Walk, jump, camera, and return path checked.');
    await page.$eval(
      '[aria-label="Skypark hub traversal note"]',
      (input) => input.dispatchEvent(new Event('change', { bubbles: true })),
    );

    const report = await page.evaluate(() => window.__67VERSE_DEVICE_PLAYTEST__.report());
    assert.equal(report.observations.length, 1);
    assert.equal(report.observations[0].evidence.route.id, 'hub');
    assert.equal(report.observations[0].evidence.multiplayer.state, 'not-applicable');
    assert.equal(report.observations[0].evidence.display.viewportCssPixels.width, 1280);
    assert.equal(report.observations[0].evidence.quality.tier.length > 0, true);
    assert.equal(report.checklist.find(({ id }) => id === 'hub').status, 'pass');
    assert.deepEqual(
      report.checklist.map(({ id }) => id),
      [
        'fresh-entry', 'hub', 'skyway', 'tag', 'balloon', 'show67',
        'creator-playback', 'room-fallback', 'screen-reader',
        'reduced-motion', 'battery-thermal-network',
      ],
    );
    assert.equal(report.physicalDeviceTestCompleted, false);
    assert.equal(report.automatedReleaseApproval, false);

    await page.evaluate(() => {
      window.__devicePlaytestUrlTrace = [];
      const createObjectURL = URL.createObjectURL.bind(URL);
      const revokeObjectURL = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        window.__devicePlaytestUrlTrace.push(['create', blob.type]);
        return createObjectURL(blob);
      };
      URL.revokeObjectURL = (url) => {
        window.__devicePlaytestUrlTrace.push(['revoke', url.startsWith('blob:')]);
        revokeObjectURL(url);
      };
    });
    await clickButton(page, 'Download session JSON');
    await page.waitForFunction(() => (
      window.__devicePlaytestUrlTrace?.some(([event]) => event === 'revoke')
    ));
    assert.deepEqual(
      await page.evaluate(() => window.__devicePlaytestUrlTrace.map(([event]) => event)),
      ['create', 'revoke'],
    );
    assert.deepEqual(
      await page.evaluate(() => window.__devicePlaytestStorageTrace.filter(({ key }) => (
        !['67v.quests', '67v.season'].includes(key)
      ))),
      [],
      'harness actions must not persist; only independent idle progression hydration may write',
    );
    await clickButton(page, '✕');
    assert.equal(await page.$('.dph-root'), null);
    assert.equal(
      await page.evaluate(() => typeof window.__67VERSE_DEVICE_PLAYTEST__),
      'undefined',
    );
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('entry and shared dialogs expose modal semantics and isolate the game shell', { timeout: 20_000 }, async () => {
  const { page, errors } = await openPage('/?qa=1');
  try {
    await page.waitForFunction(() => document.activeElement?.id === 'enter-game');
    assert.deepEqual(await page.evaluate(() => {
      const entry = document.querySelector('#entry-gate');
      const hud = document.querySelector('#hud');
      const menu = document.querySelector('.uv-hudbar');
      return {
        entry: {
          role: entry.getAttribute('role'),
          modal: entry.getAttribute('aria-modal'),
          labelledBy: entry.getAttribute('aria-labelledby'),
          describedBy: entry.getAttribute('aria-describedby'),
        },
        bodyModal: document.body.classList.contains('modal-open'),
        hud: { inert: hud.inert, hidden: hud.getAttribute('aria-hidden') },
        menu: { inert: menu.inert, hidden: menu.getAttribute('aria-hidden') },
      };
    }), {
      entry: {
        role: 'dialog',
        modal: 'true',
        labelledBy: 'entry-title',
        describedBy: 'entry-summary',
      },
      bodyModal: true,
      hud: { inert: true, hidden: 'true' },
      menu: { inert: true, hidden: 'true' },
    });
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'enter-game');

    await clickButton(page, 'ENTER SKYPARK');
    await page.waitForFunction(() => !document.body.classList.contains('modal-open'));
    assert.deepEqual(await page.evaluate(() => {
      const hud = document.querySelector('#hud');
      const menu = document.querySelector('.uv-hudbar');
      return {
        activeId: document.activeElement?.id,
        hud: { inert: hud.inert, hidden: hud.getAttribute('aria-hidden') },
        menu: { inert: menu.inert, hidden: menu.getAttribute('aria-hidden') },
      };
    }), {
      activeId: 'primary-play',
      hud: { inert: false, hidden: null },
      menu: { inert: false, hidden: null },
    });

    await clickButton(page, 'SETTINGS');
    await waitForDialog(page, 'Settings');
    assert.deepEqual(await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const hud = document.querySelector('#hud');
      const dialog = document.querySelector('[role="dialog"]');
      return {
        canvas: { inert: canvas.inert, hidden: canvas.getAttribute('aria-hidden') },
        hud: { inert: hud.inert, hidden: hud.getAttribute('aria-hidden') },
        dialog: { inert: dialog.inert, hidden: dialog.getAttribute('aria-hidden') },
      };
    }), {
      canvas: { inert: true, hidden: 'true' },
      hud: { inert: true, hidden: 'true' },
      dialog: { inert: false, hidden: null },
    });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    assert.equal(await page.$eval('canvas', (canvas) => canvas.inert), false);
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('friend code initialization stays session-stable and visibly retryable after rejected persistence', { timeout: 25_000 }, async () => {
  const { page, errors } = await openPage('/?qa=1&dev=1');
  try {
    await clickButton(page, 'ENTER SKYPARK');
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      window.__qaFriendCodeWriteBlocked = true;
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === '67v.friendCode' && window.__qaFriendCodeWriteBlocked) {
          throw new DOMException('QA friend-code storage failure', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
    });
    await page.click('button[aria-label="Friends"]');
    await waitForDialog(page, 'Friends & Party');
    await waitForText(
      page,
      '.uv-toast',
      'Friend code could not be saved on this device. It is session-only until you retry.',
      5_000,
    );
    await waitForText(page, '.uv-soc-card', 'Session-only code');
    const sessionCode = await page.$eval('.uv-soc-code', (element) => element.textContent.trim());
    assert.match(sessionCode, /^67-[A-Z0-9]{4}$/);
    assert.equal(await page.evaluate(() => localStorage.getItem('67v.friendCode')), null);
    assert.equal(await page.$$eval('button', (buttons) => (
      buttons.filter((button) => button.textContent.trim() === 'Copy').length
    )), 0);

    await clickButton(page, 'Retry save');
    await waitForText(page, '.uv-toast', 'Friend code could not be saved on this device. Try again.', 5_000);
    assert.equal(
      await page.$eval('.uv-soc-code', (element) => element.textContent.trim()),
      sessionCode,
    );

    await page.evaluate(() => { window.__qaFriendCodeWriteBlocked = false; });
    await clickButton(page, 'Retry save');
    await waitForText(page, '.uv-toast', 'Friend code saved on this device.', 5_000);
    await waitForText(page, '.uv-soc-card', 'Saved on this device');
    assert.equal(
      await page.evaluate(() => JSON.parse(localStorage.getItem('67v.friendCode'))),
      sessionCode,
    );
    assert.equal(await page.$$eval('button', (buttons) => (
      buttons.filter((button) => button.textContent.trim() === 'Copy').length
    )), 1);
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('guest profile fallback stays identical across Social, Chat, Creator, and local play', { timeout: 35_000 }, async () => {
  const { page, errors } = await openPage('/?qa=1&dev=1&hubDestination=creator', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  }, () => {
    const original = Storage.prototype.setItem;
    window.__qaProfileWriteBlocked = true;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === '67v.profile' && window.__qaProfileWriteBlocked) {
        throw new DOMException('QA profile storage failure', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  });
  try {
    await clickButton(page, 'ENTER SKYPARK');
    await clickButton(page, '💬 LOCAL CHAT');
    await page.waitForSelector('[aria-label="On-device chat"]');
    const sessionChat = await page.$eval('.uvchat-local', (element) => element.textContent);
    const nameMatch = sessionChat.match(/Playing as (Guest\d{4})/);
    assert.ok(nameMatch);
    const guestName = nameMatch[1];
    assert.match(sessionChat, /session-only guest profile/);
    await clickButton(page, '✕');

    await page.click('button[aria-label="Friends"]');
    await waitForDialog(page, 'Friends & Party');
    assert.equal(
      await page.$eval(
        '.uv-soc-name',
        (element, expectedName) => element.textContent.includes(expectedName),
        guestName,
      ),
      true,
    );
    await waitForText(page, '.uv-soc-profile', 'Guest profile is session-only');
    assert.equal(await page.evaluate(() => localStorage.getItem('67v.profile')), null);

    await page.evaluate(() => { window.__qaProfileWriteBlocked = false; });
    await clickButton(page, 'Retry profile save');
    await waitForText(page, '.uv-toast', 'Guest profile saved on this device.', 5_000);
    await waitForText(page, '.uv-soc-profile', 'Guest profile saved on this device');
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem('67v.profile'))),
      { name: guestName, guest: true, pn: null },
    );
    await clickButton(page, '✕');

    await clickButton(page, '💬 LOCAL CHAT');
    await page.waitForSelector('[aria-label="On-device chat"]');
    const savedChat = await page.$eval('.uvchat-local', (element) => element.textContent);
    assert.match(savedChat, new RegExp(`Playing as ${guestName}`));
    assert.match(savedChat, /guest profile saved on this device/);
    await clickButton(page, '✕');

    await page.goto(`${baseUrl}/?game=creator&qa=1&dev=1`, { waitUntil: 'domcontentloaded' });
    await waitForBodyClass(page, 'creator-mode');
    await waitForText(page, '.uge-status', `by ${guestName}`);
    assert.doesNotMatch(
      await page.$eval('.uge-status', (element) => element.textContent),
      /session-only/,
    );
    await clickButton(page, '🏠 Exit');
    await page.waitForFunction(() => !document.body.classList.contains('in-game'));

    await clickButton(page, '▶ PLAY GAMES');
    await waitForDialog(page, 'Play in Skypark');
    await clickButton(page, 'Play Tag');
    await waitForBodyClass(page, 'tag-mode');
    const modeIdentity = await page.$eval('#mode-name small', (element) => element.textContent);
    assert.match(modeIdentity, new RegExp(guestName));
    assert.match(modeIdentity, /saved guest/);
    await clickButton(page, '← Return to Skypark');
    await waitForDialog(page, 'Return to Skypark?');
    await clickButton(page, 'Yes');
    await page.waitForFunction(() => !document.body.classList.contains('in-game'));
    await assertHubCleanup(page, 'tag-mode', '.tag-hud');
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('local friend and party actions stay retryable when browser storage rejects writes', { timeout: 30_000 }, async () => {
  const { page, errors } = await openPage('/?panel=social&qa=1');
  try {
    await waitForDialog(page, 'Friends & Party');
    const socialCopy = await page.$eval('[role="dialog"]', (dialog) => dialog.textContent);
    assert.match(socialCopy, /On-device social/);
    assert.match(socialCopy, /Presence labels are training status/);
    assert.match(socialCopy, /online social and multiplayer are off in this build/i);
    const selfCode = await page.$eval('.uv-soc-code', (element) => element.textContent.trim());
    const friendCode = selfCode === '67-ZZ22' ? '67-XY23' : '67-ZZ22';
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      window.__qaSocialFailureKey = '67v.friends';
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === window.__qaSocialFailureKey) {
          throw new DOMException('QA social storage failure', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
    });
    await page.$eval('.uv-soc-input', (input, value) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, friendCode);
    await clickButton(page, 'Add friend');
    await waitForText(page, '.uv-toast', 'Friend could not be saved on this device. Try again.', 5_000);
    assert.equal(
      await page.$eval('.uv-soc-input', (input) => input.value),
      friendCode,
    );
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem('67v.friends') || '[]')),
      [],
    );
    assert.match(await page.$eval('[role="dialog"]', (dialog) => dialog.textContent), /Friends \(0\/50\)/);

    await page.evaluate(() => { window.__qaSocialFailureKey = null; });
    await clickButton(page, 'Add friend');
    await page.waitForFunction(() => (
      JSON.parse(localStorage.getItem('67v.friends') || '[]').length === 1
    ));
    assert.equal(await page.$eval('.uv-soc-input', (input) => input.value), '');
    assert.match(await page.$eval('[role="dialog"]', (dialog) => dialog.textContent), /Friends \(1\/50\)/);

    await page.evaluate(() => { window.__qaSocialFailureKey = '67v.party'; });
    await clickButton(page, 'Start a party');
    await waitForText(page, '.uv-toast', 'Party could not be saved on this device. Try again.', 5_000);
    assert.equal(await page.evaluate(() => localStorage.getItem('67v.party')), null);
    assert.equal(await page.$$eval('button', (buttons) => (
      buttons.filter((button) => button.textContent.trim() === 'Start a party').length
    )), 1);

    await page.evaluate(() => { window.__qaSocialFailureKey = null; });
    await clickButton(page, 'Start a party');
    await page.waitForFunction(() => (
      JSON.parse(localStorage.getItem('67v.party') || 'null')?.members.length === 1
    ));
    assert.match(await page.$eval('[role="dialog"]', (dialog) => dialog.textContent), /1\/6 members/);

    await page.evaluate(() => { window.__qaSocialFailureKey = '67v.party'; });
    await clickButton(page, 'Invite');
    await waitForText(page, '.uv-toast', 'Party invitation could not be saved on this device. Try again.', 5_000);
    assert.equal(
      await page.evaluate(() => JSON.parse(localStorage.getItem('67v.party')).members.length),
      1,
    );
    assert.match(await page.$eval('[role="dialog"]', (dialog) => dialog.textContent), /1\/6 members/);

    await page.evaluate(() => { window.__qaSocialFailureKey = null; });
    await clickButton(page, 'Invite');
    await page.waitForFunction(() => (
      JSON.parse(localStorage.getItem('67v.party')).members.length === 2
    ));
    assert.match(await page.$eval('[role="dialog"]', (dialog) => dialog.textContent), /2\/6 members/);

    await page.evaluate(() => { window.__qaSocialFailureKey = '67v.friends'; });
    await page.$$eval('.uv-soc-row', (rows) => {
      const friendRow = rows.find((row) => (
        [...row.querySelectorAll('button')]
          .some((button) => button.textContent.trim() === 'Invite')
      ));
      [...friendRow.querySelectorAll('button')]
        .find((button) => button.textContent.trim() === 'Remove')
        ?.click();
    });
    await waitForDialog(page, 'Are you sure?');
    await clickButton(page, 'Yes');
    await waitForText(page, '.uv-toast', 'Friend removal could not be saved on this device. Try again.', 5_000);
    assert.deepEqual(await page.evaluate(() => ({
      friends: JSON.parse(localStorage.getItem('67v.friends')).length,
      members: JSON.parse(localStorage.getItem('67v.party')).members.length,
    })), { friends: 1, members: 2 });
    assert.match(await page.$eval('[role="dialog"]', (dialog) => dialog.textContent), /Friends \(1\/50\)/);
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('Skypark welcome reports an unsaved first visit and stops repeating after a verified retry', { timeout: 25_000 }, async () => {
  const { page, errors } = await openPage('/?qa=1', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
  }, () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      const blocked = sessionStorage.getItem('__qaAllowArrivalWrite') !== '1';
      if (key === '67v.seenSkyparkArrival' && blocked) {
        throw new DOMException('QA arrival storage failure', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  });
  try {
    await clickButton(page, 'ENTER SKYPARK');
    await waitForText(page, '#hint', 'Progress is not saved · follow the gold lozenges');
    assert.equal(
      await page.evaluate(() => localStorage.getItem('67v.seenSkyparkArrival')),
      null,
    );

    await page.evaluate(() => sessionStorage.setItem('__qaAllowArrivalWrite', '1'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await clickButton(page, 'ENTER SKYPARK');
    await waitForText(page, '#hint', 'Follow the gold lozenges to Confluence Plaza');
    assert.equal(
      await page.evaluate(() => JSON.parse(localStorage.getItem('67v.seenSkyparkArrival'))),
      true,
    );

    await page.reload({ waitUntil: 'domcontentloaded' });
    await clickButton(page, 'ENTER SKYPARK');
    await waitForText(page, '#hint', 'Follow the gold lozenges to SKYWAY');
    assert.equal(await page.$$('.uv-toast').then((items) => items.length), 0);
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('local chat block, unblock, and report UI stays truthful after rejected writes', { timeout: 30_000 }, async () => {
  const { page, errors } = await openPage('/?panel=chat&qa=1');
  try {
    await page.waitForSelector('[aria-label="On-device chat"]');
    await page.waitForFunction(() => window.__67VERSE_QA__?.chatMessage);
    const localCopy = await page.$eval(
      '[aria-label="On-device chat"]',
      (element) => element.textContent,
    );
    assert.match(localCopy, /Messages stay in this browser session/);
    assert.match(localCopy, /Online chat is off in this build/);
    assert.equal(
      await page.evaluate(() => window.__67VERSE_QA__.chatMessage('Local Friend', 'Hello from local QA')),
      true,
    );
    await waitForText(page, '.uvchat-log', 'Hello from local QA', 5_000);
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      window.__qaChatFailureKey = '67v.chatBlocked';
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === window.__qaChatFailureKey) {
          throw new DOMException('QA chat storage failure', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
    });

    await clickButton(page, 'block');
    await waitForDialog(page, 'Are you sure?');
    await clickButton(page, 'Yes');
    await waitForText(
      page,
      '.uv-toast',
      'Could not block Local Friend on this device. Try again.',
      5_000,
    );
    assert.equal(await page.evaluate(() => localStorage.getItem('67v.chatBlocked')), null);
    assert.match(await page.$eval('.uvchat-log', (element) => element.textContent), /Hello from local QA/);
    assert.equal(await page.$$eval('.uvchat-act', (buttons) => (
      buttons.filter((button) => button.textContent.trim() === 'block').length
    )), 1);

    await page.evaluate(() => { window.__qaChatFailureKey = null; });
    await clickButton(page, 'block');
    await waitForDialog(page, 'Are you sure?');
    await clickButton(page, 'Yes');
    await page.waitForFunction(() => (
      JSON.parse(localStorage.getItem('67v.chatBlocked') || '[]').includes('Local Friend')
    ));
    assert.doesNotMatch(await page.$eval('.uvchat-log', (element) => element.textContent), /Hello from local QA/);
    assert.match(
      await page.$eval('.uvchat-blocked summary', (element) => element.textContent),
      /Blocked players \(1\)/,
    );

    await page.click('.uvchat-blocked summary');
    await page.evaluate(() => { window.__qaChatFailureKey = '67v.chatBlocked'; });
    await clickButton(page, '✕ unblock');
    await waitForText(
      page,
      '.uv-toast',
      'Could not unblock Local Friend on this device. Try again.',
      5_000,
    );
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem('67v.chatBlocked'))),
      ['Local Friend'],
    );
    assert.doesNotMatch(await page.$eval('.uvchat-log', (element) => element.textContent), /Hello from local QA/);

    await page.evaluate(() => { window.__qaChatFailureKey = null; });
    await clickButton(page, '✕ unblock');
    await page.waitForFunction(() => (
      JSON.parse(localStorage.getItem('67v.chatBlocked') || '[]').length === 0
    ));
    assert.match(await page.$eval('.uvchat-log', (element) => element.textContent), /Hello from local QA/);

    await page.evaluate(() => { window.__qaChatFailureKey = '67v.modQueue'; });
    await clickButton(page, 'report');
    await waitForDialog(page, 'Are you sure?');
    await clickButton(page, 'Yes');
    await waitForText(
      page,
      '.uv-toast',
      'Could not save this report on this device. Check browser storage and try again.',
      5_000,
    );
    assert.equal(await page.evaluate(() => localStorage.getItem('67v.modQueue')), null);
    assert.match(await page.$eval('.uvchat-log', (element) => element.textContent), /Hello from local QA/);

    await page.evaluate(() => { window.__qaChatFailureKey = null; });
    await clickButton(page, 'report');
    await waitForDialog(page, 'Are you sure?');
    await clickButton(page, 'Yes');
    await waitForText(
      page,
      '.uv-toast',
      'Report saved on this device · reporter name kept as a local snapshot. 🛡️',
      5_000,
    );
    assert.deepEqual(await page.evaluate(() => {
      const queue = JSON.parse(localStorage.getItem('67v.modQueue'));
      return {
        version: queue.version,
        types: queue.records.map((record) => record.type),
        statuses: queue.records.map((record) => record.status),
      };
    }), {
      version: 1,
      types: ['chat'],
      statuses: ['pending'],
    });
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('modal focus wraps inside the top panel and restores across a stacked confirmation', { timeout: 20_000 }, async () => {
  const { page, errors } = await openPage('/');
  try {
    await clickButton(page, 'ENTER SKYPARK');
    await clickButton(page, 'SETTINGS');
    await waitForDialog(page, 'Settings');
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('uv-x')), true);

    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    assert.equal(
      await page.evaluate(() => document.activeElement?.textContent.trim()),
      'Reset to defaults',
    );
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('uv-x')), true);

    await page.$$eval('button', (buttons) => {
      const reset = buttons.find((button) => button.textContent.trim() === 'Reset to defaults');
      reset.focus();
      reset.click();
    });
    await waitForDialog(page, 'Are you sure?');
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('uv-x')), true);
    const stackedLayers = await page.$$eval('.uv-panel-veil', (veils) => veils.map((veil) => ({
      title: veil.querySelector('[role="dialog"]').textContent,
      inert: veil.hasAttribute('inert'),
      ariaHidden: veil.getAttribute('aria-hidden'),
      pointerEvents: getComputedStyle(veil).pointerEvents,
    })));
    assert.equal(stackedLayers.length, 2);
    assert.match(stackedLayers[0].title, /Settings/);
    assert.deepEqual(
      {
        inert: stackedLayers[0].inert,
        ariaHidden: stackedLayers[0].ariaHidden,
        pointerEvents: stackedLayers[0].pointerEvents,
      },
      { inert: true, ariaHidden: 'true', pointerEvents: 'none' },
    );
    assert.match(stackedLayers[1].title, /Are you sure/);
    assert.deepEqual(
      {
        inert: stackedLayers[1].inert,
        ariaHidden: stackedLayers[1].ariaHidden,
        pointerEvents: stackedLayers[1].pointerEvents,
      },
      { inert: false, ariaHidden: null, pointerEvents: 'auto' },
    );

    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), 'Yes');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('uv-x')), true);

    await clickButton(page, 'Cancel');
    assert.equal(
      await page.evaluate(() => document.activeElement?.textContent.trim()),
      'Reset to defaults',
    );
    assert.deepEqual(await page.$eval('.uv-panel-veil', (veil) => ({
      inert: veil.hasAttribute('inert'),
      ariaHidden: veil.getAttribute('aria-hidden'),
      pointerEvents: getComputedStyle(veil).pointerEvents,
    })), { inert: false, ariaHidden: null, pointerEvents: 'auto' });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('lazy Settings and Emotes preserve immediate chooser access and restore trigger focus', { timeout: 20_000 }, async () => {
  const { page, errors } = await openPage('/?qa=1&dev=1');
  const requestedAfterEntry = [];
  page.on('request', (request) => requestedAfterEntry.push(request.url()));
  try {
    await clickButton(page, 'ENTER SKYPARK');
    await clickButton(page, '▶ PLAY GAMES');
    await waitForDialog(page, 'Play in Skypark');
    assert.equal(
      requestedAfterEntry.some((url) => /\/src\/games\/(?:tag|balloon|obstacle)\.js/.test(url)),
      false,
    );
    await page.keyboard.press('Escape');

    const settingsButton = await page.$('button[aria-label="Settings"]');
    assert.ok(settingsButton);
    assert.deepEqual(await settingsButton.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      return {
        labelContained: button.scrollWidth <= button.clientWidth,
        insideViewport: rect.left >= 0 && rect.right <= innerWidth,
      };
    }), {
      labelContained: true,
      insideViewport: true,
    });
    await settingsButton.click();
    await waitForDialog(page, 'Settings');
    assert.equal(
      await page.evaluate(() => document.activeElement?.classList.contains('uv-x')),
      true,
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
      'Settings',
    );

    await page.keyboard.press('KeyQ');
    await page.waitForSelector('.uv-emote-wheel');
    assert.deepEqual(await page.evaluate(() => ({
      modal: document.querySelector('.uv-emote-wheel')?.getAttribute('aria-modal'),
      canvasInert: document.querySelector('canvas')?.inert,
      canvasHidden: document.querySelector('canvas')?.getAttribute('aria-hidden'),
    })), {
      modal: 'true',
      canvasInert: true,
      canvasHidden: 'true',
    });
    assert.match(
      await page.evaluate(() => document.activeElement?.getAttribute('title') || ''),
      /Hop/,
    );
    await page.keyboard.press('Tab');
    assert.match(
      await page.evaluate(() => document.activeElement?.getAttribute('title') || ''),
      /Spin/,
    );
    await page.keyboard.press('KeyQ');
    await page.waitForSelector('.uv-emote-wheel', { hidden: true });
    assert.equal(await page.$eval('canvas', (canvas) => canvas.inert), false);

    const emotesButton = await page.$('button[aria-label="Emotes"]');
    assert.ok(emotesButton);
    await emotesButton.click();
    await page.waitForSelector('.uv-emote-wheel');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.uv-emote-wheel', { hidden: true });
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
      'Emotes',
    );
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('Discover uses keyboard tabs and uniquely named world-card actions', { timeout: 20_000 }, async () => {
  const { page, errors } = await openPage('/?panel=discovery&qa=1');
  try {
    await clickButton(page, 'ENTER SKYPARK');
    await waitForDialog(page, 'Discover Worlds');
    const initial = await page.evaluate(() => ({
      tabs: [...document.querySelectorAll('[role="tab"]')].map((tab) => ({
        text: tab.textContent.trim(),
        selected: tab.getAttribute('aria-selected'),
        tabIndex: tab.tabIndex,
      })),
      cards: [...document.querySelectorAll('.uvd-card')].map((card) => ({
        tag: card.tagName,
        labelledBy: card.getAttribute('aria-labelledby'),
        titleTag: card.querySelector('.uvd-name')?.tagName,
        title: card.querySelector('.uvd-name')?.textContent,
        actions: [...card.querySelectorAll('button')].map((button) => (
          button.getAttribute('aria-label')
        )),
      })),
    }));
    assert.deepEqual(initial.tabs, [
      { text: 'Discover', selected: 'true', tabIndex: 0 },
      { text: 'Local review', selected: 'false', tabIndex: -1 },
    ]);
    assert.ok(initial.cards.length > 0);
    assert.ok(initial.cards.every((card) => (
      card.tag === 'ARTICLE'
      && card.titleTag === 'H3'
      && card.labelledBy
      && card.actions.every((label) => label?.includes(card.title))
    )));

    await page.focus('#uvd-tab-discover');
    await page.keyboard.press('ArrowRight');
    assert.deepEqual(await page.evaluate(() => ({
      active: document.activeElement?.id,
      discover: document.querySelector('#uvd-tab-discover')?.getAttribute('aria-selected'),
      review: document.querySelector('#uvd-tab-review')?.getAttribute('aria-selected'),
      labelledBy: document.querySelector('#uvd-tabpanel')?.getAttribute('aria-labelledby'),
    })), {
      active: 'uvd-tab-review',
      discover: 'false',
      review: 'true',
      labelledBy: 'uvd-tab-review',
    });
    await page.keyboard.press('Home');
    assert.deepEqual(await page.evaluate(() => ({
      active: document.activeElement?.id,
      discover: document.querySelector('#uvd-tab-discover')?.getAttribute('aria-selected'),
      review: document.querySelector('#uvd-tab-review')?.getAttribute('aria-selected'),
    })), {
      active: 'uvd-tab-discover',
      discover: 'true',
      review: 'false',
    });
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('appearance and settings controls keep the last verified selection after rejected writes', { timeout: 30_000 }, async () => {
  const { page, errors } = await openPage('/?qa=1&dev=1');
  try {
    await page.evaluate(() => localStorage.setItem('67v.equipped', JSON.stringify('ghost')));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await clickButton(page, 'ENTER SKYPARK');
    await page.waitForFunction(() => window.__67VERSE_QA__?.animation()?.characterId === 'qa-runner');
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      window.__qaAppearanceFailureKey = null;
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === window.__qaAppearanceFailureKey) {
          throw new DOMException('QA appearance storage failure', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
    });

    await page.click('button[aria-label="Settings"]');
    await waitForDialog(page, 'Settings');
    await page.evaluate(() => { window.__qaAppearanceFailureKey = '67v.settings'; });
    const initialTone = await page.$eval('.uv-set-swatch.on', (button) => button.getAttribute('aria-label'));
    await clickButton(page, 'Low');
    await waitForText(
      page,
      '.uv-toast',
      'Settings could not be saved on this device. Your previous selection is still active.',
      5_000,
    );
    assert.deepEqual(await page.$$eval('.uv-set-seg button', (buttons) => Object.fromEntries(
      buttons.map((button) => [button.textContent, button.getAttribute('aria-pressed')]),
    )), {
      Auto: 'true',
      High: 'false',
      Low: 'false',
    });
    assert.equal(await page.evaluate(() => localStorage.getItem('67v.settings')), null);
    await page.$$eval('.uv-set-swatch', (buttons, selectedLabel) => {
      buttons.find((button) => button.getAttribute('aria-label') !== selectedLabel)?.click();
    }, initialTone);
    await waitForText(
      page,
      '.uv-toast',
      'Settings could not be saved on this device. Your previous selection is still active.',
      5_000,
    );
    assert.equal(
      await page.$eval('.uv-set-swatch.on', (button) => button.getAttribute('aria-label')),
      initialTone,
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));

    await page.evaluate(() => { window.__qaAppearanceFailureKey = '67v.equipped'; });
    await page.click('button[aria-label="Characters"]');
    await waitForDialog(page, 'Character Collection');
    await page.$$eval('.col-card', (cards) => {
      const kid = cards.find((card) => card.textContent.includes('Kid 1'));
      [...kid.querySelectorAll('button')]
        .find((button) => button.textContent.trim() === 'Equip')
        ?.click();
    });
    await waitForText(
      page,
      '.uv-toast',
      'Character could not be saved on this device. Your previous character is still equipped.',
      5_000,
    );
    assert.equal(
      await page.evaluate(() => JSON.parse(localStorage.getItem('67v.equipped'))),
      'ghost',
    );
    assert.deepEqual(await page.$$eval('.col-card', (cards) => {
      const state = {};
      for (const card of cards) {
        if (card.textContent.includes('Ghost')) state.Ghost = card.querySelector('.col-chip')?.textContent;
        if (card.textContent.includes('QA Runner')) state.QARunner = card.querySelector('.col-chip')?.textContent;
        if (card.textContent.includes('Kid 1')) state.Kid = card.querySelector('.col-chip')?.textContent;
      }
      return state;
    }), { Ghost: 'Equipped', QARunner: 'Owned', Kid: 'Owned' });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));

    await page.evaluate(() => { window.__qaAppearanceFailureKey = '67v.equippedCosmetics'; });
    await page.click('button[aria-label="Closet"]');
    await waitForDialog(page, 'Closet');
    await page.$$eval('[role="dialog"] button', (buttons) => {
      buttons.find((button) => button.textContent.trim() === 'Put on')?.click();
    });
    await waitForText(
      page,
      '.uv-toast',
      'Closet change could not be saved on this device. Your previous look is still active.',
      5_000,
    );
    assert.equal(await page.evaluate(() => localStorage.getItem('67v.equippedCosmetics')), null);
    assert.ok(await page.$$eval('[role="dialog"] button', (buttons) => (
      buttons.some((button) => button.textContent.trim() === 'Put on')
    )));
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('graphics Auto resolves safely and explicit High/Low choices persist deterministically', { timeout: 20_000 }, async () => {
  const { page, errors } = await openPage('/?panel=settings&qa=1&perf=1', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  try {
    await waitForDialog(page, 'Settings');
    await page.waitForFunction(() => window.__67VERSE_PERF__?.quality()?.tier === 'low');
    const automatic = await page.evaluate(() => ({
      quality: window.__67VERSE_PERF__.quality(),
      bodyTier: document.body.dataset.qualityTier,
      bodyPreference: document.body.dataset.qualityPreference,
      canvasWidth: document.querySelector('canvas').width,
      cssWidth: document.querySelector('canvas').clientWidth,
      autoPressed: [...document.querySelectorAll('.uv-set-seg button')]
        .find((button) => button.textContent === 'Auto')?.getAttribute('aria-pressed'),
      sceneDraws: window.__67VERSE_PERF__.scene().estimatedDraws,
    }));
    assert.equal(automatic.quality.preference, 'auto');
    assert.equal(automatic.quality.tier, 'low');
    assert.equal(automatic.quality.pixelRatio, 1);
    assert.equal(automatic.quality.shadows, false);
    assert.equal(automatic.bodyTier, 'low');
    assert.equal(automatic.bodyPreference, 'auto');
    assert.equal(automatic.canvasWidth, automatic.cssWidth);
    assert.equal(automatic.autoPressed, 'true');

    await clickButton(page, 'High');
    await page.waitForFunction(() => window.__67VERSE_PERF__.quality()?.tier === 'high');
    const high = await page.evaluate(() => ({
      quality: window.__67VERSE_PERF__.quality(),
      saved: JSON.parse(localStorage.getItem('67v.settings')),
      canvasWidth: document.querySelector('canvas').width,
      cssWidth: document.querySelector('canvas').clientWidth,
      sceneDraws: window.__67VERSE_PERF__.scene().estimatedDraws,
    }));
    assert.equal(high.quality.preference, 'high');
    assert.equal(high.quality.pixelRatio, 1.5);
    assert.equal(high.quality.shadows, true);
    assert.equal(high.saved.quality, 'high');
    assert.equal(high.canvasWidth, Math.round(high.cssWidth * 1.5));
    assert.ok(high.sceneDraws > automatic.sceneDraws);

    await clickButton(page, 'Low');
    await page.waitForFunction(() => window.__67VERSE_PERF__.quality()?.preference === 'low');
    assert.equal(await page.evaluate(() => JSON.parse(
      localStorage.getItem('67v.settings'),
    ).quality), 'low');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForDialog(page, 'Settings');
    await page.waitForFunction(() => window.__67VERSE_PERF__?.quality()?.preference === 'low');
    const persisted = await page.evaluate(() => ({
      quality: window.__67VERSE_PERF__.quality(),
      lowPressed: [...document.querySelectorAll('.uv-set-seg button')]
        .find((button) => button.textContent === 'Low')?.getAttribute('aria-pressed'),
    }));
    assert.equal(persisted.quality.tier, 'low');
    assert.equal(persisted.quality.pixelRatio, 1);
    assert.equal(persisted.lowPressed, 'true');
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('desktop and mobile drag-look rotate the hub camera and movement remains camera-relative', { timeout: 20_000 }, async () => {
  const { page, errors } = await openPage('/?qa=1');
  try {
    await page.waitForFunction(() => window.__67VERSE_QA__?.camera);
    await clickButton(page, 'ENTER SKYPARK');
    await page.waitForFunction(() => !document.body.classList.contains('entry-open'));
    const before = await page.evaluate(() => ({
      camera: window.__67VERSE_QA__.camera(),
      player: window.__67VERSE_QA__.player(),
    }));
    await page.$eval('canvas', (canvas) => {
      const send = (type, x, y, buttons) => canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 67,
        pointerType: 'mouse',
        button: type === 'pointerdown' ? 0 : -1,
        buttons,
        clientX: x,
        clientY: y,
      }));
      send('pointerdown', 700, 400, 1);
      send('pointermove', 850, 360, 1);
      send('pointerup', 850, 360, 0);
    });
    await page.waitForFunction((yaw) => (
      Math.abs(window.__67VERSE_QA__.camera().yaw - yaw) > 0.3
    ), {}, before.camera.yaw);
    const afterMouseLook = await page.evaluate(() => window.__67VERSE_QA__.camera());
    assert.notEqual(afterMouseLook.pitch, before.camera.pitch);

    await page.$eval('canvas', (canvas) => {
      const send = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 68,
        pointerType: 'touch',
        clientX: x,
        clientY: y,
      }));
      send('pointerdown', innerWidth * 0.82, 420);
      send('pointermove', innerWidth * 0.72, 460);
      send('pointerup', innerWidth * 0.72, 460);
    });
    await page.waitForFunction((yaw) => (
      Math.abs(window.__67VERSE_QA__.camera().yaw - yaw) > 0.3
    ), {}, afterMouseLook.yaw);
    const afterLook = await page.evaluate(() => window.__67VERSE_QA__.camera());

    await page.keyboard.down('KeyW');
    await new Promise((resolve) => setTimeout(resolve, 450));
    await page.keyboard.up('KeyW');
    const afterMove = await page.evaluate(() => window.__67VERSE_QA__.player());
    const dx = afterMove.x - before.player.x;
    const dz = afterMove.z - before.player.z;
    const forwardX = Math.sin(afterLook.yaw);
    const forwardZ = Math.cos(afterLook.yaw);
    assert.ok(dx * forwardX + dz * forwardZ > 0.25);
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('compact hub destination focus gives an explicit prompt and launches Skyway', { timeout: 20_000 }, async () => {
  const { page, errors } = await openPage('/?qa=1&perf=1&hubDestination=skyway', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  try {
    await clickButton(page, 'ENTER SKYPARK');
    await waitForText(page, '#hint.destination', 'Enter Skyway · Tap ENTER to enter');

    const hubDistrict = await page.evaluate(() => (
      window.__67VERSE_PERF__.scene().groups.find((group) => group.group === 'hub-proof-district')
    ));
    assert.ok(hubDistrict);
    assert.ok(hubDistrict.estimatedDraws <= 75);
    assert.ok(hubDistrict.renderables <= 75);
    assert.equal(
      await page.evaluate(() => window.__67VERSE_PERF__.scene().groups
        .some((group) => group.group === 'hub-districts')),
      false,
    );

    const enterControl = await page.$('#btn-grab');
    assert.ok(enterControl);
    await enterControl.click({ delay: 180 });
    await waitForBodyClass(page, 'skyway-mode');
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('Creator Terrace destination launches the existing local Creator route', { timeout: 20_000 }, async () => {
  const { page, errors } = await openPage('/?qa=1&hubDestination=creator-studio', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  try {
    await clickButton(page, 'ENTER SKYPARK');
    await waitForText(
      page,
      '#hint.destination',
      'Open Creator Studio · Tap ENTER to enter',
    );
    await page.click('#btn-grab', { delay: 180 });
    await waitForBodyClass(page, 'creator-mode');
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('Skypark exposes the reviewed landmark and route composition without blocking first play', { timeout: 20_000 }, async () => {
  const { page, errors } = await openPage('/?qa=1&perf=1');
  try {
    await clickButton(page, 'ENTER SKYPARK');
    await page.waitForFunction(() => window.__67VERSE_QA__?.composition);
    const composition = await page.evaluate(() => window.__67VERSE_QA__.composition());
    assert.deepEqual(composition, {
      version: 'arrival-rebuild-v1',
      landmarkIds: ['skyfold-canopy'],
      routeIds: [
        'arrival-court',
        'confluence-plaza',
        'play-lozenges',
        'creator-terrace',
        'echo-commons',
      ],
      primaryRouteId: 'play-lozenges',
      validationIssues: [],
    });
    await waitForText(page, '#hint', 'Follow the gold lozenges to Confluence Plaza');
    const scene = await page.evaluate(() => window.__67VERSE_PERF__.scene());
    const hubDistrict = scene.groups.find(({ group }) => group === 'hub-proof-district');
    assert.ok(hubDistrict);
    assert.ok(hubDistrict.estimatedDraws <= 75);
    assert.ok(scene.estimatedDraws <= 120);
    assert.equal(scene.groups.some(({ group }) => group === 'hub-districts'), false);
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('hub activities keep completion and reward honest when a new local best cannot be saved', { timeout: 25_000 }, async () => {
  const { page, errors } = await openPage('/?qa=1&hubActivity=skate-line', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  try {
    await clickButton(page, 'ENTER SKYPARK');
    await waitForText(page, '#hint.destination', 'Run Beacon Line · Tap ENTER to enter');
    await page.click('#btn-grab', { delay: 180 });
    await page.waitForFunction(() => window.__67VERSE_QA__.activity().active);
    await waitForText(page, '#hub-activity-status', 'Reach East Turn · 1/5');
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === '67v.hubActivityBests') {
          throw new DOMException('QA activity best failure', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
    });

    async function completeActiveRoute() {
      for (let index = 0; index < 5; index += 1) {
        const next = await page.evaluate(() => window.__67VERSE_QA__.activity().nextCheckpoint);
        assert.ok(next);
        await page.evaluate(({ x, z }) => window.__67VERSE_QA__.teleport(x, z), next);
        await page.waitForFunction(
          (completed) => window.__67VERSE_QA__.activity().checkpointIndex > completed,
          {},
          index,
        );
      }
      await page.waitForFunction(() => window.__67VERSE_QA__.activity().status === 'completed');
    }

    await completeActiveRoute();
    await waitForText(page, '#hub-activity-status', 'best time not saved');
    assert.equal(await savedCoins(page), 30);
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem('67v.hubActivityRewards'))),
      { 'skate-line': true },
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem('67v.hubActivityBests')),
      null,
    );

    await page.evaluate(() => window.__67VERSE_QA__.startActivity('skate-line'));
    await page.waitForFunction(() => window.__67VERSE_QA__.activity().active);
    await page.click('#hub-activity-exit');
    await page.waitForFunction(() => (
      window.__67VERSE_QA__.activity().status === 'cancelled'
      && document.querySelector('#hub-activity').hidden
    ));
    assert.equal(await savedCoins(page), 30);
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('Quick Start storage failure keeps onboarding retryable and never claims its Coin reward', { timeout: 25_000 }, async () => {
  const { page, errors } = await openPage('/?qa=1');
  try {
    await clickButton(page, 'ENTER SKYPARK');
    await page.waitForFunction(() => window.__67VERSE_QA__?.startOnboarding);
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === '67v.coins') {
          throw new DOMException('QA Quick Start reward failure', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
      window.__67VERSE_QA__.teleport(0, 27.5);
      window.__67VERSE_QA__.startOnboarding();
    });
    await page.waitForFunction(() => window.__67VERSE_QA__.onboarding()?.active);

    for (let step = 1; step <= 7; step += 1) {
      await page.evaluate((z) => window.__67VERSE_QA__.teleport(0, z), 27.5 - step * 0.8);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 55));
    }
    await page.waitForFunction(() => window.__67VERSE_QA__.onboarding()?.stage === 1);
    await page.keyboard.down('Space');
    await page.waitForFunction(() => window.__67VERSE_QA__.onboarding()?.stage === 2);
    await page.keyboard.up('Space');
    await page.evaluate(() => window.__67VERSE_QA__.teleport(0, 13.5));

    await waitForText(
      page,
      '.uv-toast',
      'Quick Start reward could not be saved on this device. Progress was not completed.',
      5_000,
    );
    assert.equal(await savedCoins(page), 0);
    assert.equal(
      await page.evaluate(() => JSON.parse(localStorage.getItem('67v.quickStartDone') || 'false')),
      false,
    );
    assert.deepEqual(await page.evaluate(() => window.__67VERSE_QA__.onboarding()), {
      active: false,
      stage: 2,
      prompt: '',
    });
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('developer session diagnostics remain local, bounded, and hidden behind perf mode', { timeout: 25_000 }, async () => {
  const { page, errors } = await openPage('/?qa=1&perf=1&hubActivity=skate-line', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  try {
    await page.waitForFunction(() => window.__67VERSE_PERF__?.sessionSummary);
    await clickButton(page, 'ENTER SKYPARK');
    await waitForText(page, '#hint.destination', 'Run Beacon Line · Tap ENTER to enter');
    await page.click('#btn-grab', { delay: 180 });
    await page.waitForFunction(() => (
      window.__67VERSE_PERF__.sessionSummary().counts.hub_activity_start === 1
    ));
    await page.click('#hub-activity-exit');
    await page.waitForFunction(() => (
      window.__67VERSE_PERF__.sessionSummary().counts.hub_activity_exit === 1
    ));

    await page.evaluate(() => window.__67VERSE_QA__.teleport(0, -25));
    await waitForText(page, '#hint.destination', 'Enter Skyway · Tap ENTER to enter');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1500));
    await page.keyboard.down('KeyE');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 180));
    await page.keyboard.up('KeyE');
    await waitForBodyClass(page, 'skyway-mode');
    await page.waitForFunction(() => (
      window.__67VERSE_PERF__.sessionSummary().counts.game_start === 1
    ));

    const diagnostic = await page.evaluate(() => ({
      summary: window.__67VERSE_PERF__.sessionSummary(),
      exported: window.__67VERSE_PERF__.exportSession(),
      json: window.__67VERSE_PERF__.exportSessionJson(),
      storageKeys: Object.keys(localStorage),
      externalResources: performance.getEntriesByType('resource')
        .map(({ name }) => name)
        .filter((name) => !name.startsWith(location.origin)),
    }));
    assert.equal(diagnostic.exported.privacy.storage, 'memory-only');
    assert.equal(diagnostic.exported.privacy.transmission, 'none');
    assert.ok(diagnostic.summary.counts.quality_tier >= 1);
    assert.equal(diagnostic.summary.counts.destination_enter, 2);
    assert.equal(diagnostic.summary.counts.hub_activity_start, 1);
    assert.equal(diagnostic.summary.counts.hub_activity_exit, 1);
    assert.equal(diagnostic.summary.counts.game_start, 1);
    assert.equal(diagnostic.exported.events.length, diagnostic.summary.retainedEventCount);
    assert.equal(diagnostic.storageKeys.some((key) => /telemetry|analytics/i.test(key)), false);
    assert.deepEqual(diagnostic.externalResources, []);
    for (const prohibited of ['profile', 'playerName', 'email', 'userId', 'stack']) {
      assert.equal(diagnostic.json.includes(prohibited), false);
    }
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('Tag and Balloon mobile starts keep one guidance surface clear of countdown HUDs', { timeout: 30_000 }, async () => {
  const mobileViewport = {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  };
  const overlaps = (a, b) => (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );

  const tag = await openPage('/?game=tag&qa=1', mobileViewport);
  try {
    await waitForBodyClass(tag.page, 'tag-mode');
    await tag.page.waitForFunction(() => (
      document.body.dataset.tagPhase === 'countdown'
      && /^[1-3]$/.test(document.querySelector('.tag-center')?.textContent)
    ));
    const start = await tag.page.evaluate(() => {
      const bounds = (selector) => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        };
      };
      const controls = document.querySelector('.tag-controls');
      return {
        hud: bounds('.tag-hud'),
        objective: bounds('.ps-objective.tag-start-objective'),
        countdown: bounds('.tag-center'),
        jump: bounds('#btn-jump'),
        countdownCopy: document.querySelector('.tag-center').textContent,
        controlsDisplay: getComputedStyle(controls).display,
        controlsAriaHidden: controls.getAttribute('aria-hidden'),
      };
    });
    assert.equal(overlaps(start.objective, start.hud), false);
    assert.equal(overlaps(start.objective, start.countdown), false);
    assert.equal(overlaps(start.objective, start.jump), false);
    assert.match(start.countdownCopy, /^[1-3]$/);
    assert.equal(start.controlsDisplay, 'none');
    assert.equal(start.controlsAriaHidden, 'true');
    await tag.page.waitForFunction(() => document.body.dataset.tagPhase === 'playing');
    await tag.page.waitForFunction(() => !document.querySelector('.ps-objective.tag-start-objective'));
    const tagHandoff = await tag.page.$eval('.tag-controls', (controls) => ({
      display: getComputedStyle(controls).display,
      ariaHidden: controls.getAttribute('aria-hidden'),
      copy: controls.textContent,
    }));
    assert.equal(tagHandoff.display, 'block');
    assert.equal(tagHandoff.ariaHidden, 'false');
    assert.match(tagHandoff.copy, /every safe second scores/);
    await assertNoBrowserErrors(tag.errors);
  } finally {
    await tag.page.close();
  }

  const balloon = await openPage('/?game=balloon&qa=1', mobileViewport);
  try {
    await waitForBodyClass(balloon.page, 'balloon-mode');
    await balloon.page.waitForFunction(() => (
      /^[1-3]$/.test(document.querySelector('.bb-banner')?.textContent)
    ));
    const start = await balloon.page.evaluate(() => {
      const bounds = (selector) => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        };
      };
      const tutorial = document.querySelector('.bb-tutorial');
      return {
        hud: bounds('.bb-hud'),
        objective: bounds('.ps-objective.bb-start-objective'),
        countdown: bounds('.bb-banner'),
        ability: bounds('.bb-ability'),
        dash: bounds('#btn-grab'),
        tutorial: bounds('.bb-tutorial'),
        tutorialOpacity: getComputedStyle(tutorial).opacity,
        tutorialAriaHidden: tutorial.getAttribute('aria-hidden'),
        viewportHeight: innerHeight,
      };
    });
    assert.ok(start.objective.top > start.viewportHeight * 0.55);
    assert.equal(overlaps(start.objective, start.hud), false);
    assert.equal(overlaps(start.objective, start.countdown), false);
    assert.equal(overlaps(start.countdown, start.hud), false);
    assert.equal(overlaps(start.objective, start.ability), false);
    assert.equal(overlaps(start.objective, start.dash), false);
    assert.equal(start.objective.left, start.tutorial.left);
    assert.equal(start.objective.right, start.tutorial.right);
    assert.equal(start.objective.bottom + 8, start.tutorial.bottom);
    assert.equal(start.tutorialOpacity, '0');
    assert.equal(start.tutorialAriaHidden, 'true');

    await balloon.page.waitForFunction(() => (
      document.querySelector('.bb-banner')?.textContent === 'GO!'
    ));
    await balloon.page.waitForFunction(() => (
      !document.querySelector('.ps-objective.bb-start-objective')
      && Number.parseFloat(getComputedStyle(document.querySelector('.bb-tutorial')).opacity) > 0.9
    ));
    const balloonHandoff = await balloon.page.$eval('.bb-tutorial', (tutorial) => ({
      ariaHidden: tutorial.getAttribute('aria-hidden'),
      copy: tutorial.textContent,
    }));
    assert.equal(balloonHandoff.ariaHidden, 'false');
    assert.match(balloonHandoff.copy, /MOVE · DASH into a rival/);
    await assertNoBrowserErrors(balloon.errors);
  } finally {
    await balloon.page.close();
  }
});

test('Tag replays and returns without stale UI or view state', { timeout: 40_000 }, async () => {
  const { page, errors } = await openPage('/?game=tag&qa=1&perf=1', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  try {
    await resetLocalProgress(page);
    await waitForBodyClass(page, 'tag-mode');
    await waitForText(page, '.ps-objective', 'Score while you are a runner');
    await page.waitForFunction(() => document.body.dataset.tagPhase === 'playing');
    await waitForText(page, '.tag-controls', 'every safe second scores');
    const opening = await page.evaluate(() => ({
      role: document.querySelector('.tag-role')?.textContent,
      roleState: document.querySelector('.tag-role')?.dataset.role,
      controls: document.querySelector('.tag-controls')?.textContent,
    }));
    assert.deepEqual(opening, {
      role: 'RUNNER',
      roleState: 'runner',
      controls: 'RUN · every safe second scores · jump to cut corners',
    });
    await waitForDialog(page, 'Tag — Round Over', 16_000);
    const firstResultPresentation = await page.$eval('[role="dialog"]', (dialog) => ({
      outcome: dialog.querySelector('.ps-result-outcome')?.textContent,
      labels: [...dialog.querySelectorAll('.ps-result-stat span')]
        .map((element) => element.textContent.trim()),
      summary: dialog.querySelector('.ps-result-summary')?.textContent,
      tip: dialog.querySelector('.ps-result-details')?.textContent,
    }));
    assert.match(firstResultPresentation.outcome, /^#\d · \d+ points$/);
    assert.ok(firstResultPresentation.labels.includes('Placement'));
    assert.ok(firstResultPresentation.labels.includes('Longest as IT'));
    assert.match(firstResultPresentation.summary, /as a runner .* as IT .* transfer/);
    assert.ok(firstResultPresentation.tip.length > 20);
    const firstTelemetry = await page.evaluate(() => window.__67VERSE_PERF__.sessionSummary());
    assert.ok(firstTelemetry.counts.game_phase >= 3);
    assert.equal(firstTelemetry.counts.game_start, 1);
    const firstReward = await resultCoins(page);
    assert.ok(firstReward > 0);
    assert.equal(await savedCoins(page), firstReward);
    await page.waitForFunction(() => (
      document.activeElement?.textContent.trim() === 'Play Again'
    ));
    const access = await page.$eval('[role="dialog"]', (dialog) => {
      const action = [...dialog.querySelectorAll('button')]
        .find((button) => button.textContent.trim() === 'Play Again');
      const rect = action.getBoundingClientRect();
      return {
        activeAction: document.activeElement === action,
        closeLabel: dialog.querySelector('.uv-x').getAttribute('aria-label'),
        actionInsideViewport: rect.left >= 0 && rect.right <= innerWidth
          && rect.top >= 0 && rect.bottom <= innerHeight,
      };
    });
    assert.deepEqual(access, {
      activeAction: true,
      closeLabel: 'Return to Skypark',
      actionInsideViewport: true,
    });
    await clickButtonTwice(page, 'Play Again');
    await page.waitForFunction(() => (
      document.body.classList.contains('tag-mode')
      && !document.querySelector('[role="dialog"]')
      && document.querySelector('.ps-objective')?.textContent.includes('Score while you are a runner')
    ));
    await page.waitForFunction(() => {
      const counts = window.__67VERSE_PERF__.sessionSummary().counts;
      return counts.game_result === 1 && counts.game_replay === 1 && counts.game_start === 2;
    });
    const tagResultEvent = await page.evaluate(() => (
      window.__67VERSE_PERF__.sessionEvents()
        .find(({ name }) => name === 'game_result')
    ));
    assert.equal(tagResultEvent.data.gameId, 'tag');
    assert.ok(Number.isFinite(tagResultEvent.data.placement));
    assert.ok(Number.isFinite(tagResultEvent.data.safeTimeMs));
    assert.ok(Number.isFinite(tagResultEvent.data.roleChanges));
    assert.equal(typeof tagResultEvent.data.escalationReached, 'boolean');
    assert.equal(await savedCoins(page), firstReward);
    await waitForDialog(page, 'Tag — Round Over', 16_000);
    const secondReward = await resultCoins(page);
    assert.ok(secondReward > 0);
    assert.equal(await savedCoins(page), firstReward + secondReward);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.body.classList.contains('in-game'));
    await assertHubCleanup(page, 'tag-mode', '.tag-hud');
    assert.equal(await savedCoins(page), firstReward + secondReward);
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('failed local coin reward is honest and does not advance Quest or Season progress', { timeout: 25_000 }, async () => {
  const { page, errors } = await openPage('/?game=tag&qa=1');
  try {
    await resetLocalProgress(page);
    await waitForBodyClass(page, 'tag-mode');
    await page.waitForFunction(() => (
      localStorage.getItem('67v.quests')
      && localStorage.getItem('67v.season')
    ), { timeout: 10_000 });
    await page.evaluate(() => {
      const quests = JSON.parse(localStorage.getItem('67v.quests'));
      quests.daily.order = ['play3', 'score500', 'champ1'];
      quests.daily.prog = {};
      quests.daily.claimed = {};
      quests.weekly.order = ['play15', 'score2500', 'champ3'];
      quests.weekly.prog = {};
      quests.weekly.claimed = {};
      localStorage.setItem('67v.quests', JSON.stringify(quests));

      const season = JSON.parse(localStorage.getItem('67v.season'));
      season.xp = 0;
      localStorage.setItem('67v.season', JSON.stringify(season));

      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === '67v.coins') {
          throw new DOMException('QA coin storage failure', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
    });

    await waitForDialog(page, 'Tag — Round Over', 12_000);
    const rewardStat = await page.$eval('[role="dialog"]', (dialog) => {
      const stat = [...dialog.querySelectorAll('.ps-result-stat')].find((candidate) => (
        candidate.querySelector('span')?.textContent.trim() === 'Coins earned'
      ));
      return stat?.querySelector('strong')?.textContent.trim();
    });
    assert.equal(rewardStat, 'Not saved');
    assert.equal(await savedCoins(page), 0);
    await waitForText(
      page,
      '.uv-toast',
      'Coins could not be saved on this device',
      5_000,
    );

    await clickButton(page, 'Return to Skypark');
    await page.waitForFunction(() => !document.body.classList.contains('in-game'));
    await assertHubCleanup(page, 'tag-mode', '.tag-hud');
    const progression = await page.evaluate(() => {
      const quests = JSON.parse(localStorage.getItem('67v.quests'));
      const season = JSON.parse(localStorage.getItem('67v.season'));
      return {
        daily: quests.daily.prog,
        weekly: quests.weekly.prog,
        seasonXp: season.xp,
      };
    });
    assert.deepEqual(progression, {
      daily: {},
      weekly: {},
      seasonXp: 0,
    });
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('failed Quest and Season coin claims remain actionable and show honest local-save feedback', { timeout: 25_000 }, async () => {
  const { page, errors } = await openPage('/');
  try {
    await page.waitForFunction(() => (
      localStorage.getItem('67v.quests')
      && localStorage.getItem('67v.season')
    ), { timeout: 10_000 });
    await page.evaluate(() => {
      const quests = JSON.parse(localStorage.getItem('67v.quests'));
      quests.daily.order = ['play3', 'score500', 'champ1'];
      quests.daily.prog = { play3: 3 };
      quests.daily.claimed = {};
      localStorage.setItem('67v.quests', JSON.stringify(quests));

      const season = JSON.parse(localStorage.getItem('67v.season'));
      season.xp = 0;
      season.claimedFree = [];
      season.claimedPrem = [];
      season.granted = [];
      localStorage.setItem('67v.season', JSON.stringify(season));
    });
    await page.goto(`${baseUrl}/?panel=quests&qa=1`, { waitUntil: 'domcontentloaded' });
    await waitForDialog(page, 'Quests');
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === '67v.coins') {
          throw new DOMException('QA claim coin failure', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
    });

    await clickButton(page, 'Claim 60');
    await waitForText(
      page,
      '.uv-toast',
      'Quest reward could not be saved on this device. Nothing was claimed.',
      5_000,
    );
    assert.equal(await savedCoins(page), 0);
    const questFailure = await page.evaluate(() => {
      const quests = JSON.parse(localStorage.getItem('67v.quests'));
      const season = JSON.parse(localStorage.getItem('67v.season'));
      return {
        claimed: quests.daily.claimed.play3 === true,
        seasonXp: season.xp,
      };
    });
    assert.deepEqual(questFailure, {
      claimed: false,
      seasonXp: 0,
    });
    assert.equal(await page.$$eval('button', (buttons) => (
      buttons.filter((button) => (
        button.textContent.trim() === 'Claim 60'
        && button.getClientRects().length > 0
        && !button.disabled
      )).length
    )), 1);

    await clickButton(page, '⭐ Open Season Pass');
    await waitForDialog(page, 'Season Pass');
    await clickButton(page, 'Claim');
    await waitForText(
      page,
      '.uv-toast',
      'Season reward could not be saved on this device. Nothing was claimed.',
      5_000,
    );
    assert.equal(await savedCoins(page), 0);
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem('67v.season')).claimedFree),
      [],
    );
    assert.equal(await page.$$eval('button', (buttons) => (
      buttons.filter((button) => (
        button.textContent.trim() === 'Claim'
        && button.getClientRects().length > 0
        && !button.disabled
      )).length
    )), 1);
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('Coin shop storage failures spend nothing, grant nothing, and never start a false reveal', { timeout: 25_000 }, async () => {
  const { page, errors } = await openPage('/');
  try {
    await page.evaluate(() => {
      localStorage.setItem('67v.coins', JSON.stringify(500));
      localStorage.removeItem('67v.ownedCosmetics');
      localStorage.removeItem('67v.ownedChars');
    });
    await page.goto(`${baseUrl}/?panel=shop&qa=1`, { waitUntil: 'domcontentloaded' });
    await waitForDialog(page, 'Shop');
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      window.__shopBlockedKey = '67v.coins';
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === window.__shopBlockedKey) {
          throw new DOMException('QA shop storage failure', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
    });

    await clickButton(page, 'Open · 250 🪙');
    await waitForDialog(page, 'Are you sure?');
    await clickButton(page, 'Yes');
    await waitForText(
      page,
      '.uv-toast',
      'This box could not be saved on this device. No Coins were spent and no item was granted.',
      5_000,
    );
    assert.equal(await savedCoins(page), 500);
    assert.equal(await page.$$('.uv-shop-reveal').then((items) => items.length), 0);
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem('67v.ownedCosmetics') || '[]')),
      [],
    );

    await page.evaluate(() => { window.__shopBlockedKey = '67v.ownedCosmetics'; });
    await clickButton(page, 'Open · 250 🪙');
    await waitForDialog(page, 'Are you sure?');
    await clickButton(page, 'Yes');
    await waitForText(
      page,
      '.uv-toast',
      'This box could not be saved on this device. No Coins were spent and no item was granted.',
      5_000,
    );
    assert.equal(await savedCoins(page), 500);
    assert.equal(await page.$$('.uv-shop-reveal').then((items) => items.length), 0);
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem('67v.ownedCosmetics') || '[]')),
      [],
    );

    await page.evaluate(() => {
      window.__shopBlockedKey = null;
      localStorage.setItem('67v.ownedCosmetics', JSON.stringify([
        'cap-sunny',
        'shades-cool',
        'trail-bubbles',
        'backpack-bean',
      ]));
    });
    await clickButton(page, 'Open · 250 🪙');
    await waitForDialog(page, 'Are you sure?');
    await clickButton(page, 'Yes');
    await waitForText(page, '.uv-shop-reveal', 'Duplicate → +100 🪙 back!', 5_000);
    assert.equal(await savedCoins(page), 350);
    assert.match(
      await page.$eval('.uv-shop-reveal', (element) => element.textContent),
      /already yours.*Duplicate → \+100 🪙 back!/s,
    );
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('UGC Like retries after a rejected counter write while Play remains an independent entry fact', { timeout: 30_000 }, async () => {
  const { page, errors } = await openPage('/?panel=discovery&qa=1', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  try {
    await waitForDialog(page, 'Worlds');
    await page.$eval('#enter-game', (button) => button.click());
    await page.waitForFunction(() => !document.body.classList.contains('entry-open'));
    await page.waitForFunction(() => (
      localStorage.getItem('67v.quests')
      && localStorage.getItem('67v.season')
    ), { timeout: 10_000 });
    const initialStats = await page.$eval('.uvd-card .uvd-stats', (element) => element.textContent);
    await page.evaluate(() => {
      const quests = JSON.parse(localStorage.getItem('67v.quests'));
      quests.daily.order = ['ugcplay1', 'play3', 'score500'];
      quests.daily.prog = {};
      quests.daily.claimed = {};
      quests.weekly.order = ['ugclike5', 'ugcplay5', 'play15'];
      quests.weekly.prog = {};
      quests.weekly.claimed = {};
      localStorage.setItem('67v.quests', JSON.stringify(quests));

      const season = JSON.parse(localStorage.getItem('67v.season'));
      season.xp = 0;
      localStorage.setItem('67v.season', JSON.stringify(season));

      const original = Storage.prototype.setItem;
      window.__qaCounterFailureKey = '67v.ugcLikes';
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === window.__qaCounterFailureKey) {
          throw new DOMException('QA UGC counter failure', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
    });

    await page.$eval('.uvd-card', (card) => {
      [...card.querySelectorAll('button')]
        .find((button) => button.textContent.trim() === '♥ Like')
        ?.click();
    });
    await waitForText(page, '.uv-toast', 'Like could not be saved on this device. Try again.', 5_000);
    const failedLike = await page.$eval('.uvd-card', (card) => {
      const button = [...card.querySelectorAll('button')]
        .find((candidate) => candidate.textContent.trim() === '♥ Like');
      return {
        buttonFound: Boolean(button),
        buttonDisabled: button?.disabled,
        stats: card.querySelector('.uvd-stats')?.textContent,
      };
    });
    assert.deepEqual(failedLike, {
      buttonFound: true,
      buttonDisabled: false,
      stats: initialStats,
    });
    assert.deepEqual(await page.evaluate(() => {
      const likes = JSON.parse(localStorage.getItem('67v.ugcLikes'));
      const quests = JSON.parse(localStorage.getItem('67v.quests'));
      const season = JSON.parse(localStorage.getItem('67v.season'));
      return {
        likes: likes.counts,
        weeklyLikeProgress: quests.weekly.prog.ugclike5 || 0,
        seasonXp: season.xp,
      };
    }), {
      likes: {},
      weeklyLikeProgress: 0,
      seasonXp: 0,
    });

    await page.evaluate(() => { window.__qaCounterFailureKey = null; });
    await page.$eval('.uvd-card', (card) => {
      [...card.querySelectorAll('button')]
        .find((button) => button.textContent.trim() === '♥ Like')
        ?.click();
    });
    await page.waitForFunction(() => (
      [...document.querySelectorAll('.uvd-card button')]
        .some((button) => button.textContent.trim() === '♥ Liked' && button.disabled)
    ));
    assert.deepEqual(await page.evaluate(() => {
      const likes = JSON.parse(localStorage.getItem('67v.ugcLikes'));
      const quests = JSON.parse(localStorage.getItem('67v.quests'));
      const season = JSON.parse(localStorage.getItem('67v.season'));
      return {
        likeCount: likes.counts['feat-sunny-steps'],
        weeklyLikeProgress: quests.weekly.prog.ugclike5 || 0,
        seasonXp: season.xp,
      };
    }), {
      likeCount: 1,
      weeklyLikeProgress: 1,
      seasonXp: 5,
    });

    await page.evaluate(() => { window.__qaCounterFailureKey = '67v.ugcPlays'; });
    await page.$eval('.uvd-card', (card) => {
      [...card.querySelectorAll('button')]
        .find((button) => button.textContent.trim() === '▶ Play')
        ?.click();
    });
    await page.waitForSelector('.uvd-playhud');
    const mobilePlayback = await page.evaluate(() => {
      const bounds = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        };
      };
      const hud = document.querySelector('.uvd-playhud');
      const modeNav = document.querySelector('#mode-nav');
      const globalReturn = document.querySelector('#return-skypark');
      const touchButtons = document.querySelector('#touch-buttons');
      return {
        copy: hud.textContent.trim(),
        hud: bounds(hud),
        modeNav: bounds(modeNav),
        globalReturn: bounds(globalReturn),
        touchButtons: bounds(touchButtons),
        localExitCount: [...hud.querySelectorAll('button')]
          .filter((button) => /exit/i.test(button.textContent)).length,
      };
    });
    assert.match(mobilePlayback.copy, /Reach the glowing goal · \d+s/);
    assert.ok(mobilePlayback.hud.top >= mobilePlayback.modeNav.bottom);
    assert.ok(mobilePlayback.hud.bottom < mobilePlayback.touchButtons.top);
    assert.ok(mobilePlayback.hud.left >= 0 && mobilePlayback.hud.right <= 390);
    assert.ok(
      mobilePlayback.globalReturn.width >= 44
      && mobilePlayback.globalReturn.height >= 44,
    );
    assert.equal(mobilePlayback.localExitCount, 0);
    await waitForText(
      page,
      '.uv-toast',
      'World opened, but its local play count could not be saved on this device.',
      5_000,
    );
    assert.deepEqual(await page.evaluate(() => {
      const plays = JSON.parse(localStorage.getItem('67v.ugcPlays'));
      const quests = JSON.parse(localStorage.getItem('67v.quests'));
      const season = JSON.parse(localStorage.getItem('67v.season'));
      return {
        plays: plays.counts,
        dailyPlayProgress: quests.daily.prog.ugcplay1 || 0,
        weeklyPlayProgress: quests.weekly.prog.ugcplay5 || 0,
        seasonXp: season.xp,
      };
    }), {
      plays: {},
      dailyPlayProgress: 1,
      weeklyPlayProgress: 1,
      seasonXp: 20,
    });

    await clickButton(page, '← Return to Skypark');
    await waitForDialog(page, 'Return to Skypark?');
    assert.deepEqual(await page.$eval('[role="dialog"]', (dialog) => (
      [...dialog.querySelectorAll('button')].map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          copy: button.textContent.trim(),
          largeEnough: rect.width >= 44 && rect.height >= 44,
        };
      })
    )), [
      { copy: '✕', largeEnough: true },
      { copy: 'Cancel', largeEnough: true },
      { copy: 'Yes', largeEnough: true },
    ]);
    await clickButton(page, 'Yes');
    await page.waitForFunction(() => !document.body.classList.contains('in-game'));
    await page.waitForSelector('.uvd-playhud', { hidden: true });
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('UGC goal completion distinguishes a real finish from a failed device-local Coin reward', { timeout: 25_000 }, async () => {
  const { page, errors } = await openPage('/?panel=discovery&qa=1&ugcAutoplay=1');
  try {
    await waitForDialog(page, 'Worlds');
    await page.waitForFunction(() => (
      localStorage.getItem('67v.quests')
      && localStorage.getItem('67v.season')
    ), { timeout: 10_000 });
    await page.evaluate(() => {
      const quests = JSON.parse(localStorage.getItem('67v.quests'));
      quests.daily.order = ['coins100', 'play3', 'score500'];
      quests.daily.prog = {};
      quests.daily.claimed = {};
      quests.weekly.order = ['coins500', 'play15', 'score2500'];
      quests.weekly.prog = {};
      quests.weekly.claimed = {};
      localStorage.setItem('67v.quests', JSON.stringify(quests));

      const season = JSON.parse(localStorage.getItem('67v.season'));
      season.xp = 0;
      localStorage.setItem('67v.season', JSON.stringify(season));

      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === '67v.coins') {
          throw new DOMException('QA UGC reward failure', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
    });
    const played = await page.$$eval('button', (buttons) => {
      const button = buttons.find((candidate) => (
        candidate.textContent.trim() === '▶ Play'
        && candidate.getClientRects().length > 0
      ));
      button?.click();
      return Boolean(button);
    });
    assert.equal(played, true);

    await waitForText(page, '.uvd-win', 'Goal reached!', 5_000);
    const resultCopy = await page.$eval('.uvd-win', (element) => element.textContent);
    assert.match(resultCopy, /Coin reward not saved on this device/);
    assert.doesNotMatch(resultCopy, /\+15 Coins/);
    await waitForText(
      page,
      '.uv-toast',
      'World completed, but its Coin reward could not be saved on this device.',
      5_000,
    );
    assert.equal(await savedCoins(page), 0);
    const progression = await page.evaluate(() => {
      const quests = JSON.parse(localStorage.getItem('67v.quests'));
      const season = JSON.parse(localStorage.getItem('67v.season'));
      const plays = JSON.parse(localStorage.getItem('67v.ugcPlays'));
      return {
        dailyCoins: quests.daily.prog.coins100 || 0,
        weeklyCoins: quests.weekly.prog.coins500 || 0,
        seasonXp: season.xp,
        playCount: plays.counts['feat-sunny-steps'],
      };
    });
    assert.deepEqual(progression, {
      dailyCoins: 0,
      weeklyCoins: 0,
      seasonXp: 15,
      playCount: 1,
    });
    await clickButton(page, 'Back to Discover');
    await waitForDialog(page, 'Discover Worlds');
    assert.equal(await page.evaluate(() => document.body.classList.contains('in-game')), false);
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('near-max local UGC resets its phone performance scope and survives fall, retry, and long-name results', { timeout: 35_000 }, async () => {
  const { page, errors } = await openPage('/?panel=discovery&qa=1&perf=1', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  try {
    await page.evaluate((collection) => {
      localStorage.setItem('67v.ugcWorlds', JSON.stringify(collection));
    }, nearMaxLocalWorldCollection());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForDialog(page, 'Discover Worlds');
    await page.$eval('#enter-game', (button) => button.click());
    await page.waitForFunction(() => !document.body.classList.contains('entry-open'));
    const cardFacts = await page.$eval(
      `.uvd-card[data-world-id="${NEAR_MAX_UGC_WORLD_ID}"]`,
      (card) => ({
        copy: card.textContent,
        play: [...card.querySelectorAll('button')]
          .find((button) => button.textContent.trim() === '▶ Play')?.textContent.trim(),
      }),
    );
    assert.match(cardFacts.copy, new RegExp(NEAR_MAX_UGC_WORLD_NAME));
    assert.match(cardFacts.copy, /96 pieces/);
    assert.match(cardFacts.copy, /Published on this device/);
    assert.equal(cardFacts.play, '▶ Play');
    await page.$eval(
      `.uvd-card[data-world-id="${NEAR_MAX_UGC_WORLD_ID}"]`,
      (card) => [...card.querySelectorAll('button')]
        .find((button) => button.textContent.trim() === '▶ Play')
        .click(),
    );
    await page.waitForSelector('.uvd-playhud', { timeout: 15_000 });
    const playbackReady = await page.evaluate(() => ({
      scope: window.__67VERSE_PERF__?.snapshot()?.scope || null,
      qa: window.__67VERSE_UGC_QA__?.snapshot() || null,
      mode: document.querySelector('#mode-name')?.textContent || '',
    }));
    assert.equal(playbackReady.scope, 'ugc', JSON.stringify({ playbackReady, errors }));
    assert.equal(playbackReady.qa?.pieces, 96, JSON.stringify({ playbackReady, errors }));
    await page.waitForFunction(() => (
      window.__67VERSE_PERF__.snapshot()?.sampleCount >= 120
    ), { timeout: 15_000 });

    const measured = await page.evaluate(() => ({
      runtime: window.__67VERSE_PERF__.snapshot('near-max-phone'),
      scene: window.__67VERSE_PERF__.scene(),
      qa: window.__67VERSE_UGC_QA__.snapshot(),
    }));
    assert.equal(measured.runtime.scope, 'ugc');
    assert.equal(measured.runtime.status, 'within-guardrails');
    assert.deepEqual(measured.runtime.breaches, []);
    assert.equal(measured.runtime.meta.viewport, '390x844');
    assert.ok(measured.runtime.metrics.drawCalls.peak <= 30);
    assert.ok(measured.runtime.metrics.triangles.peak >= 12_000);
    assert.ok(measured.runtime.metrics.triangles.peak <= 13_500);
    assert.ok(measured.scene.estimatedDraws <= 30);
    const staticAttribution = measured.scene.groups
      .find(({ group }) => group === 'ugc-static');
    assert.deepEqual(staticAttribution, {
      group: 'ugc-static',
      renderables: 2,
      instances: 54,
      estimatedDraws: 2,
      triangles: staticAttribution.triangles,
      shadowCasters: 2,
      uniqueGeometries: 2,
      uniqueMaterials: 2,
    });
    const animatedAttribution = measured.scene.groups
      .find(({ group }) => group === 'ugc-animated');
    assert.deepEqual(animatedAttribution, {
      group: 'ugc-animated',
      renderables: 4,
      instances: 80,
      estimatedDraws: 4,
      triangles: animatedAttribution.triangles,
      shadowCasters: 0,
      uniqueGeometries: 4,
      uniqueMaterials: 4,
    });
    assert.equal(measured.qa.name, NEAR_MAX_UGC_WORLD_NAME);
    assert.equal(measured.qa.pieces, 96);
    assert.deepEqual(measured.qa.batching, {
      blocks: 27,
      ramps: 27,
      collisionProxies: 54,
      renderedBatches: 2,
    });
    assert.deepEqual(measured.qa.animatedBatching, {
      spinnerBases: 24,
      spinnerArms: 24,
      bounceBases: 16,
      bounceRings: 16,
      scoreStars: 0,
      collisionProxies: 40,
      renderedBatches: 4,
    });
    assert.deepEqual(measured.qa.animatedPieces, {
      spinners: 24,
      bouncePads: 16,
    });
    assert.equal(measured.qa.character.requestedLod, 'game');
    assert.equal(measured.qa.character.activeLod, 'game');
    assert.equal(measured.qa.character.loaded, true);
    assert.equal(measured.qa.character.meshes, 5);
    assert.equal(measured.qa.character.triangles, 2_416);
    assert.equal(measured.qa.character.animatorContract, true);

    const compiledFixture = compileLevelForPlay(createNearMaxPublishedLocalWorld());
    const block = compiledFixture.runtimePieces
      .find(({ assetId }) => assetId === 'block.basic');
    const ramp = compiledFixture.runtimePieces
      .find(({ assetId }) => assetId === 'ramp.basic');
    const spinner = compiledFixture.runtimePieces
      .find(({ assetId }) => assetId === 'hazard.spinner');
    const bounce = compiledFixture.runtimePieces
      .find(({ assetId }) => assetId === 'play.bounce');
    const collisionSamples = await page.evaluate(({
      blockPiece,
      rampPiece,
      spinnerPiece,
      bouncePiece,
    }) => ({
      block: window.__67VERSE_UGC_QA__.sampleGround(blockPiece.x, blockPiece.z),
      ramp: window.__67VERSE_UGC_QA__.sampleGround(rampPiece.x, rampPiece.z),
      spinner: window.__67VERSE_UGC_QA__.sampleGround(spinnerPiece.x, spinnerPiece.z),
      bounce: window.__67VERSE_UGC_QA__.sampleGround(bouncePiece.x, bouncePiece.z),
    }), {
      blockPiece: block,
      rampPiece: ramp,
      spinnerPiece: spinner,
      bouncePiece: bounce,
    });
    assert.ok(Math.abs(collisionSamples.block.y - 0.6) < 1e-6);
    assert.deepEqual(collisionSamples.block.box2, {
      minX: block.x - 0.5,
      maxX: block.x + 0.5,
      minZ: block.z - 0.5,
      maxZ: block.z + 0.5,
    });
    assert.ok(collisionSamples.ramp.y > 0 && collisionSamples.ramp.y < 0.6);
    assert.deepEqual(collisionSamples.ramp.box2, {
      minX: ramp.x - 0.5,
      maxX: ramp.x + 0.5,
      minZ: ramp.z - 0.5,
      maxZ: ramp.z + 0.5,
    });
    assert.ok(Math.abs(collisionSamples.spinner.y - 0.25) < 1e-6);
    assert.deepEqual(collisionSamples.spinner.box2, {
      minX: spinner.x - 0.5,
      maxX: spinner.x + 0.5,
      minZ: spinner.z - 0.5,
      maxZ: spinner.z + 0.5,
    });
    assert.ok(Math.abs(collisionSamples.bounce.y - 0.14) < 1e-6);
    assert.deepEqual(collisionSamples.bounce.box2, {
      minX: bounce.x - 0.5,
      maxX: bounce.x + 0.5,
      minZ: bounce.z - 0.5,
      maxZ: bounce.z + 0.5,
    });

    const spinnerPieces = compiledFixture.runtimePieces
      .filter(({ assetId }) => assetId === 'hazard.spinner');
    const bouncePieces = compiledFixture.runtimePieces
      .filter(({ assetId }) => assetId === 'play.bounce');
    const matricesBefore = await page.evaluate(
      () => window.__67VERSE_UGC_QA__.animatedMatrices(),
    );
    assert.equal(matricesBefore.spinnerArms.length, 2);
    assert.equal(matricesBefore.bounceRings.length, 2);
    for (const [matrix, piece] of [
      [matricesBefore.spinnerArms[0], spinnerPieces[0]],
      [matricesBefore.spinnerArms[1], spinnerPieces.at(-1)],
      [matricesBefore.bounceRings[0], bouncePieces[0]],
      [matricesBefore.bounceRings[1], bouncePieces.at(-1)],
    ]) {
      assert.ok(Math.abs(matrix[12] - piece.x) < 1e-6);
      assert.ok(Math.abs(matrix[14] - piece.z) < 1e-6);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    const matricesAfter = await page.evaluate(
      () => window.__67VERSE_UGC_QA__.animatedMatrices(),
    );
    assert.notDeepEqual(matricesAfter.spinnerArms[0], matricesBefore.spinnerArms[0]);
    assert.notDeepEqual(matricesAfter.bounceRings[0], matricesBefore.bounceRings[0]);

    assert.equal(
      await page.evaluate(() => window.__67VERSE_UGC_QA__.forceFallRetry()),
      true,
    );
    await waitForText(page, '.uvd-playhud', 'Back at the start · retry 1', 5_000);
    const retry = await page.evaluate(() => window.__67VERSE_UGC_QA__.snapshot());
    assert.equal(retry.retries, 1);
    assert.deepEqual(retry.position, {
      x: retry.spawn.x,
      y: 0,
      z: retry.spawn.z,
    });

    assert.equal(await page.evaluate(() => window.__67VERSE_UGC_QA__.finish()), true);
    await waitForText(page, '.uvd-winbox', 'Goal reached!', 5_000);
    const result = await page.$eval('.uvd-winbox', (box) => {
      const bounds = box.getBoundingClientRect();
      const copy = box.querySelector('.uvd-result-copy').getBoundingClientRect();
      return {
        text: box.textContent,
        box: {
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          left: bounds.left,
        },
        copy: {
          scrollWidth: copy.scrollWidth,
          clientWidth: copy.clientWidth,
          scrollHeight: copy.scrollHeight,
          clientHeight: copy.clientHeight,
        },
        actions: [...box.querySelectorAll('.uvd-win-actions button')]
          .map((button) => button.textContent.trim()),
      };
    });
    assert.match(result.text, new RegExp(NEAR_MAX_UGC_WORLD_NAME));
    assert.ok(result.box.top >= 0 && result.box.left >= 0);
    assert.ok(result.box.bottom <= 844 && result.box.right <= 390);
    assert.equal(result.copy.scrollWidth, result.copy.clientWidth);
    assert.equal(result.copy.scrollHeight, result.copy.clientHeight);
    assert.deepEqual(result.actions, [
      'Back to Discover',
      'My Worlds',
      'Return to Skypark',
    ]);
    assert.equal(await page.evaluate(() => window.__67VERSE_PERF__.snapshot().scope), 'ugc');

    await clickButton(page, 'Back to Discover');
    await waitForDialog(page, 'Discover Worlds');
    await page.waitForFunction(() => window.__67VERSE_PERF__?.snapshot()?.scope === 'hub');
    assert.equal(await page.evaluate(() => document.body.classList.contains('in-game')), false);
    const scopeHistory = await page.evaluate(() => window.__67VERSE_PERF__.runtimeHistory());
    assert.equal(scopeHistory.at(-1).scope, 'ugc');
    assert.equal(scopeHistory.at(-1).label, 'scope-change');
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('Crowd LOD preserves the UGC lifecycle with a five-draw articulated fallback', { timeout: 35_000 }, async () => {
  const { page, errors } = await openPage(
    '/?panel=discovery&qa=1&perf=1&ugcAutoplay=1&ugcCharacterLod=crowd',
    {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    },
  );
  try {
    await page.evaluate((collection) => {
      localStorage.setItem('67v.ugcWorlds', JSON.stringify(collection));
    }, nearMaxLocalWorldCollection());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForDialog(page, 'Discover Worlds');
    await page.$eval('#enter-game', (button) => button.click());
    await page.waitForFunction(() => !document.body.classList.contains('entry-open'));
    await page.$eval(
      `.uvd-card[data-world-id="${NEAR_MAX_UGC_WORLD_ID}"]`,
      (card) => [...card.querySelectorAll('button')]
        .find((button) => button.textContent.trim() === '▶ Play')
        .click(),
    );
    await waitForText(page, '.uvd-winbox', 'Goal reached!', 15_000);
    await page.waitForFunction(() => (
      window.__67VERSE_UGC_QA__?.snapshot().character?.loaded
      && window.__67VERSE_PERF__?.snapshot()?.sampleCount >= 120
    ), { timeout: 20_000 });
    const measured = await page.evaluate(() => ({
      runtime: window.__67VERSE_PERF__.snapshot('near-max-crowd-lod-phone'),
      scene: window.__67VERSE_PERF__.scene(),
      qa: window.__67VERSE_UGC_QA__.snapshot(),
    }));
    const character = measured.qa.character;
    assert.equal(character.requestedLod, 'crowd');
    assert.equal(character.activeLod, 'crowd');
    assert.equal(character.loaded, true);
    assert.equal(character.meshes, 5);
    assert.equal(character.triangles, 2_416);
    assert.equal(character.uniqueGeometries, 5);
    assert.equal(character.uniqueMaterials, 1);
    // Scene traversal order is not a rendering contract; validate the five
    // articulated geometry budgets without coupling this QA check to it.
    assert.deepEqual(
      [...character.geometryProfile].sort((a, b) => a - b),
      [368, 368, 432, 432, 816],
    );
    assert.equal(
      character.geometryProfile.reduce((sum, triangles) => sum + triangles, 0),
      character.triangles,
    );
    assert.deepEqual(character.anchors, [
      'back',
      'face',
      'handLeft',
      'handRight',
      'head',
      'root',
    ]);
    assert.deepEqual(character.bounds, {
      height: 1.9,
      radius: 0.46,
      groundOffset: 0,
    });
    assert.equal(character.animatorContract, true);
    assert.equal(measured.runtime.status, 'within-guardrails');
    assert.equal(measured.runtime.meta.viewport, '390x844');
    assert.equal(measured.runtime.metrics.characters.crowd, 1);
    assert.equal(measured.runtime.metrics.characters.game, 0);
    // The noninteractive UGC stage contributes its horizon and island framing
    // on top of the existing near-max playback and five-draw Crowd LOD.
    assert.equal(measured.runtime.metrics.drawCalls.peak, 16);
    assert.equal(measured.runtime.metrics.triangles.peak, 13_008);
    const characterAttribution = measured.scene.groups
      .find(({ group }) => group === 'characters');
    assert.equal(characterAttribution.estimatedDraws, 5);
    assert.equal(characterAttribution.triangles, 2_416);
    assert.match(
      await page.$eval('.uvd-winbox', (box) => box.textContent),
      new RegExp(NEAR_MAX_UGC_WORLD_NAME),
    );
    await clickButton(page, 'Back to Discover');
    await waitForDialog(page, 'Discover Worlds');
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('local round time pauses behind the return confirmation', { timeout: 20_000 }, async () => {
  const { page, errors } = await openPage('/?game=tag');
  try {
    await waitForBodyClass(page, 'tag-mode');
    await page.waitForFunction(() => (
      document.body.dataset.tagPhase === 'playing'
      && /^\d+:\d{2}$/.test(document.querySelector('.tag-timer')?.textContent || '')
    ), { timeout: 12_000 });
    await clickButton(page, '← Return to Skypark');
    await waitForDialog(page, 'Return to Skypark?');
    const pausedAt = await page.$eval('.tag-timer', (timer) => timer.textContent);
    await new Promise((resolve) => setTimeout(resolve, 1_250));
    assert.equal(await page.$eval('.tag-timer', (timer) => timer.textContent), pausedAt);
    await clickButton(page, 'Cancel');
    await page.waitForFunction((value) => (
      document.querySelector('.tag-timer')?.textContent !== value
    ), { timeout: 3_000 }, pausedAt);
    await clickButton(page, '← Return to Skypark');
    await waitForDialog(page, 'Return to Skypark?');
    await clickButton(page, 'Yes');
    await page.waitForFunction(() => !document.body.classList.contains('in-game'));
    await assertHubCleanup(page, 'tag-mode', '.tag-hud');
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('mobile touch input releases on interruption and stays isolated behind return modal', { timeout: 20_000 }, async () => {
  const { page, errors } = await openPage('/?game=tag&qa=1', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  try {
    await waitForBodyClass(page, 'tag-mode');
    await page.waitForFunction(() => !document.body.classList.contains('entry-open'));

    const heldBeforeBlur = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 67,
        pointerType: 'touch',
        clientX: 72,
        clientY: 560,
      }));
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        pointerId: 67,
        pointerType: 'touch',
        clientX: 104,
        clientY: 528,
      }));
      document.querySelector('#btn-jump').dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 68,
        pointerType: 'touch',
      }));
      return {
        stickVisible: getComputedStyle(document.querySelector('#stick-base')).display !== 'none',
        jumpHeld: document.querySelector('#btn-jump').classList.contains('held'),
      };
    });
    assert.deepEqual(heldBeforeBlur, { stickVisible: true, jumpHeld: true });

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.deepEqual(await page.evaluate(() => ({
      stickVisible: getComputedStyle(document.querySelector('#stick-base')).display !== 'none',
      jumpHeld: document.querySelector('#btn-jump').classList.contains('held'),
    })), { stickVisible: false, jumpHeld: false });

    await clickButton(page, '← Return to Skypark');
    await waitForDialog(page, 'Return to Skypark?');
    const modalState = await page.evaluate(() => {
      const touch = document.querySelector('#touch-ui');
      const nav = document.querySelector('#mode-nav').getBoundingClientRect();
      const jump = document.querySelector('#btn-jump').getBoundingClientRect();
      return {
        modalOpen: document.body.classList.contains('modal-open'),
        touchVisibility: getComputedStyle(touch).visibility,
        touchInert: touch.inert,
        touchAriaHidden: touch.getAttribute('aria-hidden'),
        navInsideViewport: nav.top >= 0 && nav.left >= 0
          && nav.right <= innerWidth && nav.bottom <= innerHeight,
        jumpInsideViewport: jump.top >= 0 && jump.left >= 0
          && jump.right <= innerWidth && jump.bottom <= innerHeight,
        jumpTarget: jump.width >= 44 && jump.height >= 44,
      };
    });
    assert.deepEqual(modalState, {
      modalOpen: true,
      touchVisibility: 'hidden',
      touchInert: true,
      touchAriaHidden: 'true',
      navInsideViewport: true,
      jumpInsideViewport: true,
      jumpTarget: true,
    });

    await clickButton(page, 'Cancel');
    await page.waitForFunction(() => !document.body.classList.contains('modal-open'));
    assert.deepEqual(await page.evaluate(() => ({
      touchVisibility: getComputedStyle(document.querySelector('#touch-ui')).visibility,
      touchInert: document.querySelector('#touch-ui').inert,
      touchAriaHidden: document.querySelector('#touch-ui').getAttribute('aria-hidden'),
      activeId: document.activeElement?.id,
    })), {
      touchVisibility: 'visible',
      touchInert: false,
      touchAriaHidden: null,
      activeId: 'return-skypark',
    });
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('Balloon Battle reaches results and returns without stale UI or view state', { timeout: 25_000 }, async () => {
  const { page, errors } = await openPage('/?game=balloon&qa=1', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  try {
    await resetLocalProgress(page);
    await waitForBodyClass(page, 'balloon-mode');
    await waitForText(page, '.bb-hud', 'DASH TO POP');
    const objectiveCopy = await page.$eval('.ps-objective', (card) => card.textContent);
    assert.match(objectiveCopy, /Dash into rivals\. Pop all 3 balloons\. Be last standing\./);
    await waitForDialog(page, 'Balloon Battle — Results', 15_000);
    const reward = await resultCoins(page);
    assert.ok(reward > 0);
    assert.equal(await savedCoins(page), reward);
    const resultsCopy = await page.$eval('[role="dialog"]', (dialog) => dialog.textContent);
    assert.match(resultsCopy, /Balloons remaining/);
    await page.waitForFunction(() => (
      document.activeElement?.textContent.trim() === 'Play Again'
    ));
    const access = await page.$eval('[role="dialog"]', (dialog) => {
      const action = [...dialog.querySelectorAll('button')]
        .find((button) => button.textContent.trim() === 'Play Again');
      const rect = action.getBoundingClientRect();
      return {
        activeAction: document.activeElement === action,
        closeLabel: dialog.querySelector('.uv-x').getAttribute('aria-label'),
        actionInsideViewport: rect.left >= 0 && rect.right <= innerWidth
          && rect.top >= 0 && rect.bottom <= innerHeight,
      };
    });
    assert.deepEqual(access, {
      activeAction: true,
      closeLabel: 'Return to Skypark',
      actionInsideViewport: true,
    });
    await page.$eval('.uv-panel-veil', (veil) => veil.dispatchEvent(new PointerEvent(
      'pointerdown',
      { bubbles: true, pointerId: 1, pointerType: 'touch' },
    )));
    await page.waitForFunction(() => !document.body.classList.contains('in-game'));
    await assertHubCleanup(page, 'balloon-mode', '.bb-hud');
    assert.equal(await savedCoins(page), reward);
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('Skyway mobile start hands one instruction slot from countdown to racing', { timeout: 20_000 }, async () => {
  const { page, errors } = await openPage('/?game=obstacle&qa=1', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  try {
    await waitForBodyClass(page, 'skyway-mode');
    await page.waitForSelector('.ps-objective.sw-start-objective');
    await page.waitForFunction(() => (
      document.querySelector('.sw-flash')?.textContent === '3'
    ));
    await page.evaluate(() => {
      const flash = document.querySelector('.sw-flash');
      window.__skywayCountdownTrace = [{
        text: flash.textContent,
        at: performance.now(),
      }];
      const observer = new MutationObserver(() => {
        const text = flash.textContent;
        const trace = window.__skywayCountdownTrace;
        if (trace.at(-1)?.text !== text) {
          trace.push({ text, at: performance.now() });
        }
        if (text === 'GO! 🏁') observer.disconnect();
      });
      observer.observe(flash, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    });
    const countdownLayout = await page.evaluate(() => {
      const bounds = (selector) => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        };
      };
      return {
        objective: bounds('.ps-objective.sw-start-objective'),
        countdown: bounds('.sw-flash'),
        jump: bounds('#btn-jump'),
        guideHidden: document.querySelector('.sw-guide').getAttribute('aria-hidden'),
        viewport: { width: innerWidth, height: innerHeight },
      };
    });
    const overlaps = (a, b) => (
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
    );
    assert.ok(countdownLayout.objective.top > countdownLayout.viewport.height * 0.6);
    assert.equal(overlaps(countdownLayout.objective, countdownLayout.countdown), false);
    assert.equal(overlaps(countdownLayout.objective, countdownLayout.jump), false);
    assert.equal(countdownLayout.guideHidden, 'true');

    await page.waitForFunction(() => (
      document.querySelector('.sw-flash')?.textContent === 'GO! 🏁'
    ), { timeout: 10_000 });
    const countdownTrace = await page.evaluate(() => window.__skywayCountdownTrace);
    assert.deepEqual(
      countdownTrace.map((entry) => entry.text),
      ['3', '2', '1', 'GO! 🏁'],
    );
    const measuredCountdownMs = countdownTrace.at(-1).at - countdownTrace[0].at;
    assert.ok(measuredCountdownMs >= 2_600 && measuredCountdownMs <= 3_400);
    await page.waitForFunction(() => !document.querySelector('.ps-objective.sw-start-objective'));
    const racingGuide = await page.$eval('.sw-guide', (guide) => ({
      hidden: guide.classList.contains('is-hidden'),
      ariaHidden: guide.getAttribute('aria-hidden'),
      copy: guide.textContent,
    }));
    assert.deepEqual(racingGuide, {
      hidden: false,
      ariaHidden: 'false',
      copy: 'Steer left · JUMP petal gaps · gold lozenges stay on',
    });
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('Skyway mobile relay framing keeps both routes inside the playable safe viewport', { timeout: 20_000 }, async () => {
  const { page, errors } = await openPage(
    '/?game=obstacle&qa=1&perf=1&visualQa=1&visualQaSpot=bridge',
    {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    },
  );
  try {
    await waitForBodyClass(page, 'skyway-mode');
    await page.waitForFunction(() => {
      const projection = window.__67VERSE_SKYWAY_QA__?.routeProjection();
      return projection?.points?.length === 3
        && projection.points.every((point) => (
          point.inFront
          && point.insideSafe
          && !point.occludedByPlayer
        ));
    }, { timeout: 10_000 });
    await page.waitForFunction(() => (
      window.__67VERSE_PERF__?.snapshot()?.sampleCount >= 120
    ), { timeout: 20_000 });
    const evidence = await page.evaluate(() => {
      const projection = window.__67VERSE_SKYWAY_QA__.routeProjection();
      const jump = document.querySelector('#btn-jump').getBoundingClientRect();
      const performance = window.__67VERSE_PERF__.capture('skyway-mobile-density');
      return {
        projection,
        jump: { width: jump.width, height: jump.height },
        performance,
      };
    });
    assert.deepEqual(
      evidence.projection.points.map(({ id }) => id),
      ['relay-petal-a', 'gold-line-a', 'relay-petal-c'],
    );
    assert.ok(evidence.projection.safeRect.left >= 16);
    assert.ok(
      evidence.projection.safeRect.right
        <= evidence.projection.viewport.width - 16,
    );
    assert.ok(evidence.projection.points.every(({ screen }, index) => (
      screen.x >= evidence.projection.safeRect.left
      && screen.x <= evidence.projection.safeRect.right
      && screen.y >= evidence.projection.safeRect.top
      && screen.y <= evidence.projection.safeRect.bottom
      && (index > 1 || screen.y < evidence.projection.safeRect.bottom - 150)
    )));
    assert.ok(evidence.jump.width >= 44);
    assert.ok(evidence.jump.height >= 44);
    const environment = evidence.performance.attribution.groups
      .find(({ group }) => group === 'skyway-environment');
    assert.ok(environment);
    assert.ok(environment.instances >= 160);
    assert.ok(environment.estimatedDraws <= 10);
    assert.equal(evidence.performance.runtime.status, 'within-guardrails');
    assert.ok(evidence.performance.runtime.metrics.drawCalls.peak <= 80);
    assert.ok(evidence.performance.runtime.metrics.triangles.peak <= 380_000);
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('Skyway Crown Loom finish composition stays inside mobile render budgets', { timeout: 20_000 }, async () => {
  const { page, errors } = await openPage(
    '/?game=obstacle&qa=1&perf=1&visualQa=1&visualQaSpot=finish',
    {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    },
  );
  try {
    await waitForBodyClass(page, 'skyway-mode');
    await waitForText(page, '.sw-checkpoint', 'Checkpoint 3/3');
    await page.waitForFunction(() => (
      window.__67VERSE_PERF__?.snapshot()?.sampleCount >= 120
    ), { timeout: 20_000 });
    const evidence = await page.evaluate(() => (
      window.__67VERSE_PERF__.capture('skyway-crown-loom-mobile')
    ));
    const landmark = evidence.attribution.groups
      .find(({ group }) => group === 'skyway-landmark');
    assert.deepEqual(
      {
        renderables: landmark?.renderables,
        instances: landmark?.instances,
        estimatedDraws: landmark?.estimatedDraws,
      },
      {
        renderables: 4,
        instances: 6,
        estimatedDraws: 4,
      },
    );
    assert.equal(evidence.runtime.status, 'within-guardrails');
    assert.ok(evidence.runtime.metrics.drawCalls.peak <= 80);
    assert.ok(evidence.runtime.metrics.triangles.peak <= 380_000);
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('fresh mobile visitor reaches Skyway results through the honest public path', { timeout: 140_000 }, async () => {
  const { page, errors } = await openPage('/?autoplay=1', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  try {
    assert.equal(
      await page.evaluate(() => localStorage.getItem('67v.seenSkyparkArrival')),
      null,
    );
    assert.match(
      await page.$eval('#entry-summary', (element) => element.textContent),
      /INSTANT LOCAL PLAY · SKYWAY SPRINT/,
    );
    const entryStartedAt = await page.evaluate(() => performance.now());
    await clickButton(page, 'ENTER SKYPARK');
    await page.waitForFunction(() => (
      !document.body.classList.contains('entry-open')
      && document.querySelector('#entry-gate')?.hidden
    ));
    const timeToControlMs = await page.evaluate((startedAt) => (
      performance.now() - startedAt
    ), entryStartedAt);
    assert.ok(timeToControlMs < 2_500, `mobile hub control took ${timeToControlMs}ms`);
    assert.deepEqual(await page.evaluate(() => {
      const hint = document.querySelector('#hint');
      const jump = document.querySelector('#btn-jump');
      const hintRect = hint.getBoundingClientRect();
      const jumpRect = jump.getBoundingClientRect();
      return {
        activeId: document.activeElement?.id,
        playLabel: document.querySelector('#primary-play')?.textContent.trim(),
        hint: hint.textContent.trim(),
        duplicateToasts: document.querySelectorAll('.uv-toast').length,
        hintOverlapsJump: !(
          hintRect.right <= jumpRect.left
          || hintRect.left >= jumpRect.right
          || hintRect.bottom <= jumpRect.top
          || hintRect.top >= jumpRect.bottom
        ),
      };
    }), {
      activeId: 'primary-play',
      playLabel: '▶ PLAY GAMES',
      hint: 'Follow the gold lozenges to Confluence Plaza',
      duplicateToasts: 0,
      hintOverlapsJump: false,
    });
    assert.equal(
      await page.evaluate(() => JSON.parse(
        localStorage.getItem('67v.seenSkyparkArrival') || 'false',
      )),
      true,
    );

    const playStartedAt = await page.evaluate(() => performance.now());
    await clickButton(page, '▶ PLAY GAMES');
    await clickButton(page, 'Play Skyway Sprint');
    await waitForBodyClass(page, 'skyway-mode');
    await page.waitForSelector('.ps-objective.sw-start-objective');
    const mobileStart = await page.evaluate(() => {
      const objective = document.querySelector('.ps-objective.sw-start-objective');
      const jump = document.querySelector('#btn-jump');
      const objectiveRect = objective.getBoundingClientRect();
      const jumpRect = jump.getBoundingClientRect();
      return {
        controls: objective.textContent,
        duplicateToasts: document.querySelectorAll('.uv-toast').length,
        objectiveOverlapsJump: !(
          objectiveRect.right <= jumpRect.left
          || objectiveRect.left >= jumpRect.right
          || objectiveRect.bottom <= jumpRect.top
          || objectiveRect.top >= jumpRect.bottom
        ),
      };
    });
    assert.equal(mobileStart.duplicateToasts, 0);
    assert.equal(mobileStart.objectiveOverlapsJump, false);
    assert.match(mobileStart.controls, /Drag left to steer.*tap JUMP/s);
    await page.waitForFunction(() => (
      Number(document.querySelector('.sw-progress')?.getAttribute('aria-valuenow')) > 0
    ), { timeout: 10_000 });
    const timeToFirstActionMs = await page.evaluate((startedAt) => (
      performance.now() - startedAt
    ), playStartedAt);
    assert.ok(
      timeToFirstActionMs < 7_000,
      `mobile first course motion took ${timeToFirstActionMs}ms`,
    );
    await waitForText(page, '.sw-next', 'NEXT · SHUTTER RELAY');
    const mobileHud = await page.evaluate(() => {
      const position = document.querySelector('.sw-position').getBoundingClientRect();
      const time = document.querySelector('.sw-time').getBoundingClientRect();
      return {
        positionRight: position.right,
        timeLeft: time.left,
        guide: document.querySelector('.sw-guide').textContent,
        nextFontSize: getComputedStyle(document.querySelector('.sw-next')).fontSize,
        touch: document.body.classList.contains('touch'),
      };
    });
    assert.ok(mobileHud.positionRight < mobileHud.timeLeft);
    assert.match(mobileHud.guide, /Steer left · JUMP petal gaps · gold lozenges stay on/);
    assert.equal(mobileHud.nextFontSize, '9px');
    assert.equal(mobileHud.touch, true);
    await waitForText(page, '.sw-next', 'NEXT · PETAL RELAY', 30_000);
    await waitForText(page, '.sw-next', 'NEXT · CROWN RUN', 90_000);
    await waitForDialog(page, 'Skyway Results', 90_000);
    const reward = await resultCoins(page);
    assert.ok(reward > 0);
    assert.equal(await savedCoins(page), reward);
    const resultsCopy = await page.$eval('[role="dialog"]', (dialog) => dialog.textContent);
    assert.match(resultsCopy, /crossed the Crown Gate/);
    assert.match(resultsCopy, /Local bot race/);
    assert.match(resultsCopy, /Race again/);
    assert.match(resultsCopy, /Return to Skypark/);
    // X previously removed the panel but stranded the player in a frozen
    // finished course. It now follows the same result-aware return path.
    await clickButton(page, '✕');
    await page.waitForFunction(() => !document.body.classList.contains('in-game'));
    await assertHubCleanup(page, 'skyway-mode', '.sw-hud');
    assert.equal(await savedCoins(page), reward);
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('fresh desktop visitor can finish, replay, and return through the public Skyway path', { timeout: 160_000 }, async () => {
  const { page, errors } = await openPage('/?autoplay=1');
  try {
    assert.equal(
      await page.evaluate(() => localStorage.getItem('67v.seenSkyparkArrival')),
      null,
    );
    assert.match(
      await page.$eval('#entry-summary', (element) => element.textContent),
      /INSTANT LOCAL PLAY · SKYWAY SPRINT/,
    );
    const entryStartedAt = await page.evaluate(() => performance.now());
    await clickButton(page, 'ENTER SKYPARK');
    await page.waitForFunction(() => (
      !document.body.classList.contains('entry-open')
      && document.querySelector('#entry-gate')?.hidden
    ));
    const timeToControlMs = await page.evaluate((startedAt) => (
      performance.now() - startedAt
    ), entryStartedAt);
    assert.ok(timeToControlMs < 2_500, `desktop hub control took ${timeToControlMs}ms`);
    assert.deepEqual(await page.evaluate(() => ({
      activeId: document.activeElement?.id,
      playLabel: document.querySelector('#primary-play')?.textContent.trim(),
      hint: document.querySelector('#hint')?.textContent.trim(),
      duplicateToasts: document.querySelectorAll('.uv-toast').length,
    })), {
      activeId: 'primary-play',
      playLabel: '▶ PLAY GAMES',
      hint: 'Follow the gold lozenges to Confluence Plaza',
      duplicateToasts: 0,
    });
    const playStartedAt = await page.evaluate(() => performance.now());
    await clickButton(page, '▶ PLAY GAMES');
    await clickButton(page, 'Play Skyway Sprint');
    await waitForBodyClass(page, 'skyway-mode');
    await page.waitForSelector('.ps-objective.sw-start-objective');
    assert.equal(await page.$$eval('.uv-toast', (toasts) => toasts.length), 0);
    assert.match(
      await page.$eval('.ps-objective.sw-start-objective', (element) => element.textContent),
      /Move with WASD or arrows.*press Space to jump/s,
    );
    await page.waitForFunction(() => (
      Number(document.querySelector('.sw-progress')?.getAttribute('aria-valuenow')) > 0
    ), { timeout: 10_000 });
    const timeToFirstActionMs = await page.evaluate((startedAt) => (
      performance.now() - startedAt
    ), playStartedAt);
    assert.ok(
      timeToFirstActionMs < 7_000,
      `desktop first course motion took ${timeToFirstActionMs}ms`,
    );
    await waitForDialog(page, 'Skyway Results', 90_000);
    const firstReward = await resultCoins(page);
    assert.ok(firstReward > 0);
    assert.equal(await savedCoins(page), firstReward);
    await clickButtonTwice(page, 'Race again');
    await page.waitForFunction(() => {
      const rank = document.querySelector('.sw-rank')?.textContent.trim();
      const progress = document.querySelector('.sw-progress')?.getAttribute('aria-valuenow');
      return !document.querySelector('[role="dialog"]')
        && ['READY', '3', '2', '1'].includes(rank)
        && progress === '0';
    }, { timeout: 5_000 });
    assert.equal(await savedCoins(page), firstReward);
    await waitForDialog(page, 'Skyway Results', 90_000);
    const secondReward = await resultCoins(page);
    assert.ok(secondReward > 0);
    assert.equal(await savedCoins(page), firstReward + secondReward);
    await clickButtonTwice(page, 'Return to Skypark');
    await page.waitForFunction(() => !document.body.classList.contains('in-game'));
    await assertHubCleanup(page, 'skyway-mode', '.sw-hud');
    assert.equal(await savedCoins(page), firstReward + secondReward);
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('67 Show global return exits a nested local round instead of fabricating a result', { timeout: 20_000 }, async () => {
  const { page, errors } = await openPage('/?game=show67&qa=1&autoplay=1');
  try {
    await waitForText(page, '.sv-card', 'Solo party gauntlet');
    await page.waitForFunction(() => (
      document.activeElement?.textContent.trim() === 'Start local gauntlet'
    ));
    assert.deepEqual(await page.$eval('.sv-card', (card) => ({
      role: card.getAttribute('role'),
      modal: card.getAttribute('aria-modal'),
      label: card.getAttribute('aria-label'),
    })), {
      role: 'dialog',
      modal: 'true',
      label: '67 Show local gauntlet',
    });
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(() => document.activeElement?.textContent.trim()),
      'Start local gauntlet',
    );
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    assert.equal(
      await page.evaluate(() => document.activeElement?.textContent.trim()),
      'Start local gauntlet',
    );
    await clickButton(page, 'Start local gauntlet');
    await waitForText(page, '.sv-card', 'Round 1 of 3');
    await clickButton(page, 'Play local round');
    await waitForBodyClass(page, 'tag-mode');
    await clickButton(page, '← Return to Skypark');
    await waitForDialog(page, 'Return to Skypark?');
    await clickButton(page, 'Yes');
    await page.waitForFunction(() => !document.body.classList.contains('in-game'));
    await assertHubCleanup(page, 'tag-mode', '.sv-hud');
    assert.equal(await page.$$('.tag-hud').then((items) => items.length), 0);
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('67 Show preserves its completed local gauntlet and reward when local stats cannot be saved', { timeout: 180_000 }, async () => {
  const { page, errors } = await openPage('/?game=show67&qa=1&autoplay=1');
  try {
    await resetLocalProgress(page);
    await waitForText(page, '.sv-card', 'Solo party gauntlet');
    const intro = await page.$eval('.sv-card', (card) => card.textContent);
    assert.match(intro, /Tag, Balloon Battle, then Skyway Sprint/);
    assert.match(intro, /seven on-device training entries/);
    assert.match(intro, /No live players/);
    assert.match(intro, /no online bracket/);
    assert.match(intro, /no remote tournament/);

    await clickButton(page, 'Start local gauntlet');
    await waitForText(page, '.sv-card', 'Round 1 of 3');
    assert.match(await page.$eval('.sv-card', (card) => card.textContent), /Tag.*Local bot round/s);
    await clickButton(page, 'Play local round');
    await waitForDialog(page, 'Tag — Round Over', 20_000);
    const tagReward = await resultCoins(page);
    assert.equal(await savedCoins(page), tagReward);
    await clickButton(page, 'Continue 67 Show');
    assert.equal(await savedCoins(page), tagReward);
    await waitForText(page, '.sv-card', 'Practice Bracket');
    await clickButton(page, 'Next round');

    await waitForText(page, '.sv-card', 'Round 2 of 3');
    assert.match(await page.$eval('.sv-card', (card) => card.textContent), /Balloon Battle.*Local bot round/s);
    await clickButton(page, 'Play local round');
    await waitForDialog(page, 'Balloon Battle — Results', 25_000);
    const balloonReward = await resultCoins(page);
    assert.equal(await savedCoins(page), tagReward + balloonReward);
    await clickButton(page, 'Continue 67 Show');
    assert.equal(await savedCoins(page), tagReward + balloonReward);
    await waitForText(page, '.sv-card', 'Practice Bracket');
    await clickButton(page, 'Next round');

    await waitForText(page, '.sv-card', 'Round 3 of 3');
    assert.match(await page.$eval('.sv-card', (card) => card.textContent), /Skyway Sprint.*Local bot race/s);
    await clickButton(page, 'Play local round');
    await waitForDialog(page, 'Skyway Results', 90_000);
    const skywayReward = await resultCoins(page);
    const roundRewards = tagReward + balloonReward + skywayReward;
    assert.equal(await savedCoins(page), roundRewards);
    await clickButton(page, 'Continue 67 Show');
    assert.equal(await savedCoins(page), roundRewards);
    await waitForText(page, '.sv-card', 'Local Practice Podium');
    await clickButton(page, 'To the ceremony!');
    await waitForText(page, '.sv-card', 'Local practice result', 5_000);

    const result = await page.$eval('.sv-card', (card) => card.textContent);
    assert.match(result, /LOCAL GAUNTLET WINNER/);
    assert.match(result, /training bracket/);
    assert.match(result, /local Coins/);
    assert.match(result, /no cash value or online reward/);
    assert.match(result, /Play Again/);
    const showRewardMatch = result.match(/\+(\d+) local Coins/);
    assert.ok(showRewardMatch);
    const showReward = Number(showRewardMatch[1]);
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === '67v.show67Stats') {
          throw new DOMException('QA 67 Show stats failure', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
    });
    await clickButtonTwice(page, 'Return to Skypark');
    await waitForText(
      page,
      '.uv-toast',
      '67 Show completed, but its local stats could not be saved on this device.',
      5_000,
    );
    await page.waitForFunction(() => !document.body.classList.contains('in-game'));
    await assertHubCleanup(page, 'skyway-mode', '.sv-hud');
    assert.equal(await page.$$('.sw-hud').then((items) => items.length), 0);
    assert.equal(await savedCoins(page), roundRewards + showReward);
    assert.equal(
      await page.evaluate(() => localStorage.getItem('67v.show67Stats')),
      null,
    );
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('Creator templates expose bounded Race, Survival, and Score objectives with local metadata', { timeout: 60_000 }, async () => {
  const { page, errors } = await openPage(
    '/?game=creator&qa=1&dev=1&autoplay=1&creatorTemplates=1',
    {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    },
  );
  try {
    await waitForBodyClass(page, 'creator-mode');
    await page.$eval('#enter-game', (button) => button.click());
    await page.waitForFunction(() => !document.body.classList.contains('entry-open'));
    await waitForDialog(page, 'Choose a safe starting template');
    const templateState = await page.evaluate(() => ({
      copy: document.querySelector('.uge-template-panel').textContent,
      cards: [...document.querySelectorAll('.uge-template')].map((card) => ({
        copy: card.textContent,
        button: (() => {
          const rect = card.querySelector('button').getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        })(),
      })),
    }));
    assert.equal(templateState.cards.length, 3);
    assert.match(templateState.copy, /Reach the Goal as quickly as you can/);
    assert.match(templateState.copy, /Stay in play for 20 seconds/);
    assert.match(templateState.copy, /Collect all 5 Score Stars/);
    assert.match(templateState.copy, /stays on this device/);
    assert.ok(templateState.cards.every(({ button }) => (
      button.width >= 44 && button.height >= 44
    )));

    await clickButton(page, 'Use Survival');
    await waitForText(page, '.uge-status', 'Survival');
    await clickButton(page, '▶ Play Test');
    await waitForText(page, '.uge-bottom', 'stay in play');
    await waitForDialog(page, 'Survival complete!', 8_000);
    await clickButton(page, '🛠 Back to editor');
    await waitForText(page, '.uge-status', 'Test passed');

    await clickButton(page, '🆕 New');
    await waitForDialog(page, 'Start a fresh world?');
    await clickButton(page, 'Yes');
    await waitForDialog(page, 'Choose a safe starting template');
    await clickButton(page, 'Use Score');
    await waitForText(page, '.uge-status', 'Score');
    await clickButton(page, '💾 Save');
    await waitForDialog(page, 'Name your world');
    await page.$eval('input.uge-input', (input) => { input.value = 'Local Star Circuit'; });
    await clickButton(page, 'Save 💾');
    await clickButton(page, '📂 Worlds');
    const savedCopy = await page.$eval('.uge-worldrow', (row) => row.textContent);
    assert.match(savedCopy, /Score/);
    assert.match(savedCopy, /#score/);
    assert.match(savedCopy, /#quick/);
    assert.match(savedCopy, /#precision/);
    assert.match(savedCopy, /local draft/);
    await clickButton(page, '✕');
    await clickButton(page, '▶ Play Test');
    await waitForText(page, '.uge-bottom', 'collect every ⭐');
    await waitForDialog(page, 'All stars collected!', 25_000);
    await clickButton(page, '🛠 Back to editor');
    await waitForText(page, '.uge-status', 'Test passed');
    await clickButton(page, '📤 Publish on this device');
    await waitForText(page, '.uge-status', 'Published here');
    await clickButton(page, '🏠 Exit');
    await page.waitForFunction(() => !document.body.classList.contains('in-game'));
    await clickButton(page, 'WORLDS');
    await waitForDialog(page, 'Discover Worlds');
    const localCardCopy = await page.$$eval('.uvd-card', (cards) => (
      cards.find((card) => card.textContent.includes('Local Star Circuit'))?.textContent
    ));
    assert.match(localCardCopy, /Score/);
    assert.match(localCardCopy, /#score/);
    await page.$$eval('.uvd-card', (cards) => {
      const card = cards.find((item) => item.textContent.includes('Local Star Circuit'));
      [...card.querySelectorAll('button')]
        .find((button) => button.textContent.trim() === '▶ Play')
        .click();
    });
    await waitForText(page, '.uvd-playhud', 'Collect every Score Star');
    assert.equal(await page.evaluate(() => window.__67VERSE_UGC_QA__.snapshot().mode), 'score');
    await page.evaluate(() => window.__67VERSE_UGC_QA__.finish());
    await waitForText(page, '.uvd-winbox', 'All stars collected!', 5_000);
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('Creator mobile editor exposes every tool and an honest test-to-publish flow', { timeout: 35_000 }, async () => {
  const worldName = 'Mobile Published Course';
  const { page, errors } = await openPage('/?game=creator&qa=1&dev=1&autoplay=1&ugcAutoplay=1', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  try {
    await waitForBodyClass(page, 'creator-mode');
    await page.$eval('#enter-game', (button) => button.click());
    await page.waitForFunction(() => !document.body.classList.contains('entry-open'));
    const editLayout = await page.evaluate(() => {
      const bounds = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        };
      };
      const top = document.querySelector('.uge-top');
      const bottom = document.querySelector('.uge-bottom');
      const strip = document.querySelector('.uge-toolstrip');
      const visibleButtons = [...document.querySelectorAll('.uge-root button')]
        .filter((button) => button.getClientRects().length > 0);
      return {
        top: bounds(top),
        bottom: bounds(bottom),
        strip: {
          ...bounds(strip),
          scrollWidth: strip.scrollWidth,
          clientWidth: strip.clientWidth,
        },
        tools: [...strip.querySelectorAll('.uge-tool')].map((button) => ({
          copy: button.textContent.trim(),
          ...bounds(button),
        })),
        undersizedActions: visibleButtons
          .map((button) => ({ copy: button.textContent.trim(), ...bounds(button) }))
          .filter(({ width, height }) => width < 44 || height < 44),
        status: document.querySelector('.uge-status').textContent,
        publish: [...top.querySelectorAll('button')]
          .find((button) => button.textContent.includes('publish'))?.textContent.trim(),
        hint: document.querySelector('.uge-hint').textContent,
        cameraLabels: [...bottom.querySelectorAll('button[aria-label^="Rotate camera"]')]
          .map((button) => button.getAttribute('aria-label')),
      };
    });
    assert.ok(editLayout.bottom.top - editLayout.top.bottom >= 380);
    assert.equal(editLayout.strip.scrollWidth, editLayout.strip.clientWidth);
    assert.deepEqual(editLayout.tools.map(({ copy }) => copy), [
      '🧱 Block',
      '◢ Ramp',
      '🌀 Spinner',
      '↟ Bounce Pad',
      '⭐ Score Star',
      '🚩 Spawn',
      '🏁 Goal',
    ]);
    assert.ok(editLayout.tools.every(({ left, right, width, height }) => (
      left >= editLayout.strip.left
      && right <= editLayout.strip.right
      && width >= 44
      && height >= 44
    )));
    assert.deepEqual(editLayout.undersizedActions, []);
    assert.match(editLayout.status, /Local draft/);
    assert.match(editLayout.status, /local name snapshot/);
    assert.equal(editLayout.publish, '🔒 Play test to publish');
    assert.match(editLayout.hint, /Rotate turns ramps/);
    assert.match(editLayout.hint, /publishing stays on this device/);
    assert.doesNotMatch(editLayout.hint, /\bR\b|WASD|Space/);
    assert.deepEqual(editLayout.cameraLabels, [
      'Rotate camera left',
      'Rotate camera right',
    ]);

    // The locked publish affordance previously opened the naming dialog even
    // though its label promised a play test. It now enters that test directly.
    await clickButton(page, '🔒 Play test to publish');
    await waitForBodyClass(page, 'creator-playing');
    assert.equal(await page.$('[role="dialog"]'), null);
    const playLayout = await page.evaluate(() => {
      const playBar = [...document.querySelectorAll('.uge-bottom')]
        .find((bar) => getComputedStyle(bar).display === 'flex');
      const jump = document.querySelector('#btn-jump').getBoundingClientRect();
      const bar = playBar.getBoundingClientRect();
      return {
        barBottom: bar.bottom,
        jumpTop: jump.top,
        hint: playBar.querySelector('.uge-hint').textContent,
        buttonSizes: [...playBar.querySelectorAll('button')].map((button) => {
          const rect = button.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }),
      };
    });
    assert.ok(playLayout.barBottom <= playLayout.jumpTop);
    assert.ok(playLayout.buttonSizes.every(({ width, height }) => width >= 44 && height >= 44));
    assert.equal(playLayout.hint, 'Stick to move · JUMP to hop · reach the 🏁');

    await waitForDialog(page, 'You did it!', 12_000);
    await clickButton(page, '🛠 Back to editor');
    await waitForText(page, '.uge-status', 'Test passed');
    await waitForText(page, '.uge-top', '📤 Publish on this device');
    await clickButton(page, '📤 Publish on this device');
    await waitForDialog(page, 'Name your world');
    const namingCopy = await page.$eval('[role="dialog"]', (dialog) => dialog.textContent);
    assert.match(namingCopy, /Name your world/);
    assert.doesNotMatch(namingCopy, /online|upload/i);
    await page.$eval('input.uge-input', (input, value) => { input.value = value; }, worldName);
    await clickButton(page, 'Save 💾');
    await waitForText(page, '.uge-status', 'Published here');

    await clickButton(page, '📂 Worlds');
    await waitForDialog(page, 'My Worlds');
    const worldRow = await page.$eval('.uge-worldrow', (row) => {
      const rect = (element) => {
        const bounds = element.getBoundingClientRect();
        return {
          left: bounds.left,
          right: bounds.right,
          width: bounds.width,
          height: bounds.height,
        };
      };
      const copy = row.querySelector('.uge-worldcopy');
      const actions = [...row.querySelectorAll('button')];
      return {
        copy: row.textContent,
        copyBounds: rect(copy),
        actionSizes: actions.map(rect),
        deleteLabel: actions.find((button) => button.textContent.trim() === '🗑')
          ?.getAttribute('aria-label'),
        closeSize: rect(row.closest('[role="dialog"]').querySelector('.uv-x')),
      };
    });
    assert.match(worldRow.copy, /published on this device/);
    assert.match(worldRow.copy, /local name snapshot/);
    assert.ok(worldRow.copyBounds.width >= 190);
    assert.ok(worldRow.actionSizes.every(({ width, height }) => width >= 44 && height >= 44));
    assert.equal(worldRow.deleteLabel, `Delete ${worldName} from this device`);
    assert.ok(worldRow.closeSize.width >= 44 && worldRow.closeSize.height >= 44);
    await clickButton(page, '✕');

    await clickButton(page, '🏠 Exit');
    await page.waitForFunction(() => !document.body.classList.contains('in-game'));
    await clickButton(page, 'WORLDS');
    await waitForDialog(page, 'Discover Worlds');
    await page.$$eval('.uvd-card', (cards, name) => {
      cards.find((card) => card.textContent.includes(name))
        ?.scrollIntoView({ block: 'center' });
    }, worldName);
    const discoverLayout = await page.evaluate((name) => {
      const bounds = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        };
      };
      const panel = document.querySelector('.uvd-panel');
      const body = panel.querySelector('.uv-body');
      const tabs = panel.querySelector('.uvd-tabs');
      const card = [...panel.querySelectorAll('.uvd-card')]
        .find((item) => item.textContent.includes(name));
      return {
        body: bounds(body),
        tabs: bounds(tabs),
        tabStates: [...tabs.querySelectorAll('[role="tab"]')].map((tab) => ({
          copy: tab.textContent,
          selected: tab.getAttribute('aria-selected'),
          ...bounds(tab),
        })),
        cardCopy: card.textContent,
        cardActions: [...card.querySelectorAll('button')].map(bounds),
        closeSize: bounds(panel.querySelector('.uv-x')),
      };
    }, worldName);
    assert.ok(discoverLayout.tabs.top >= discoverLayout.body.top);
    assert.ok(discoverLayout.tabs.bottom <= discoverLayout.body.bottom);
    assert.deepEqual(
      discoverLayout.tabStates.map(({ copy, selected }) => ({ copy, selected })),
      [
        { copy: 'Discover', selected: 'true' },
        { copy: 'Local review', selected: 'false' },
      ],
    );
    assert.ok(discoverLayout.tabStates.every(({ height }) => height >= 44));
    assert.match(discoverLayout.cardCopy, /Published on this device/);
    assert.match(discoverLayout.cardCopy, /local name snapshot/);
    assert.ok(discoverLayout.cardActions.every(({ width, height }) => width >= 44 && height >= 44));
    assert.ok(discoverLayout.closeSize.width >= 44 && discoverLayout.closeSize.height >= 44);

    await page.$$eval('.uvd-card', (cards, name) => {
      const card = cards.find((item) => item.textContent.includes(name));
      [...card.querySelectorAll('button')]
        .find((button) => button.textContent.trim() === '🚩 Flag locally')
        .click();
    }, worldName);
    await waitForDialog(page, 'Flag level on this device');
    const reportFlow = await page.$eval('.uvd-report-panel', (dialog) => ({
      copy: dialog.textContent,
      actionHeights: [...dialog.querySelectorAll('.uvd-reasons button')]
        .map((button) => button.getBoundingClientRect().height),
      closeSize: (() => {
        const rect = dialog.querySelector('.uv-x').getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      })(),
    }));
    assert.match(reportFlow.copy, /Nothing is sent online/);
    assert.ok(reportFlow.actionHeights.every((height) => height >= 44));
    assert.ok(reportFlow.closeSize.width >= 44 && reportFlow.closeSize.height >= 44);
    await clickButton(page, 'Something else');

    await clickButton(page, 'Local review');
    const reviewLayout = await page.$eval('.uvd-panel', (panel, name) => {
      const card = panel.querySelector('.uvd-mod');
      return {
        copy: card.textContent,
        tabStates: [...panel.querySelectorAll('[role="tab"]')].map((tab) => ({
          copy: tab.textContent,
          selected: tab.getAttribute('aria-selected'),
        })),
        actionSizes: [...card.querySelectorAll('button')].map((button) => {
          const rect = button.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }),
        worldPresent: card.textContent.includes(name),
      };
    }, worldName);
    assert.equal(reviewLayout.worldPresent, true);
    assert.match(reviewLayout.copy, /local name snapshot/);
    assert.deepEqual(reviewLayout.tabStates, [
      { copy: 'Discover', selected: 'false' },
      { copy: 'Local review', selected: 'true' },
    ]);
    assert.ok(reviewLayout.actionSizes.every(({ width, height }) => width >= 44 && height >= 44));
    await clickButton(page, 'Discover');

    await page.$$eval('.uvd-card', (cards, name) => {
      const card = cards.find((item) => item.textContent.includes(name));
      [...card.querySelectorAll('button')]
        .find((button) => button.textContent.trim() === '▶ Play')
        .click();
    }, worldName);
    await page.waitForSelector('.uvd-win');
    const resultLayout = await page.$eval('.uvd-winbox', (box) => {
      const bounds = box.getBoundingClientRect();
      return {
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        left: bounds.left,
        copy: box.textContent,
        actions: [...box.querySelectorAll('.uvd-win-actions button')].map((button) => {
          const rect = button.getBoundingClientRect();
          return {
            copy: button.textContent.trim(),
            width: rect.width,
            height: rect.height,
          };
        }),
        touchControlsHidden: getComputedStyle(document.querySelector('#touch-ui')).visibility
          === 'hidden',
      };
    });
    assert.ok(resultLayout.top >= 0 && resultLayout.left >= 0);
    assert.ok(resultLayout.bottom <= 844 && resultLayout.right <= 390);
    assert.match(resultLayout.copy, /Goal reached!/);
    assert.deepEqual(resultLayout.actions.map(({ copy }) => copy), [
      'Back to Discover',
      'My Worlds',
      'Return to Skypark',
    ]);
    assert.ok(resultLayout.actions.every(({ width, height }) => width >= 44 && height >= 44));
    assert.equal(resultLayout.touchControlsHidden, true);
    await clickButton(page, 'My Worlds');
    await waitForDialog(page, 'Creator — My Worlds');
    assert.equal(await page.evaluate(() => document.body.classList.contains('in-game')), false);
    assert.match(await page.$eval('#mode-name', (element) => element.textContent), /Game mode/);
    assert.match(await page.$eval('[role="dialog"]', (panel) => panel.textContent), new RegExp(worldName));
    await clickButton(page, '✕');
    await clickButton(page, 'WORLDS');
    await waitForDialog(page, 'Discover Worlds');
    assert.match(await page.$eval('.uvd-panel', (panel) => panel.textContent), new RegExp(worldName));
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('Creator play-test publishes locally, appears in Discover, replays, and cleans up', { timeout: 35_000 }, async () => {
  const worldName = 'QA Browser Course';
  const { page, errors } = await openPage('/?game=creator&qa=1&dev=1&autoplay=1');
  try {
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForBodyClass(page, 'creator-mode');
    await clickButton(page, '▶ Play Test');
    await waitForDialog(page, 'You did it!', 12_000);
    await clickButton(page, '🛠 Back to editor');
    await clickButton(page, '📤 Publish on this device');
    await waitForDialog(page, 'Name your world');
    await page.$eval('input.uge-input', (input, value) => { input.value = value; }, worldName);
    await clickButton(page, 'Save 💾');
    await page.waitForFunction((name) => (
      document.body.textContent.includes(name)
      && document.body.textContent.includes('Published here')
      && document.body.textContent.includes('no online upload')
    ), {}, worldName);
    await page.evaluate(() => {
      const key = '67v.ugcWorlds';
      const collection = JSON.parse(localStorage.getItem(key));
      const healthy = collection.worlds[0];
      collection.worlds.unshift(
        null,
        { id: 'broken-world', name: 'Broken World', pieces: [] },
      );
      localStorage.setItem(key, JSON.stringify(collection));
      localStorage.setItem('67v.ugcPlays', JSON.stringify({
        [healthy.id]: 2,
        'missing-world': 99,
      }));
      localStorage.setItem('67v.ugcLikes', JSON.stringify({
        [healthy.id]: 1,
        'missing-world': 99,
      }));
      localStorage.setItem('67v.modQueue', JSON.stringify([
        null,
        {
          id: 'healthy-report',
          worldId: healthy.id,
          worldName: healthy.name,
          reason: 'Something else',
          reporter: 'QA Guest',
          at: new Date().toISOString(),
          status: 'open',
        },
        {
          id: 'orphan-report',
          worldId: 'missing-world',
          worldName: 'Missing World',
          reason: 'Looks copied',
          reporter: 'QA Guest',
          at: 'not-a-date',
          status: 'open',
        },
        {
          id: 'chat-report',
          type: 'chat',
          from: 'Local Friend',
          text: 'hello',
          reporter: 'QA Guest',
          reason: 'user-report',
          at: new Date().toISOString(),
          status: 'pending',
        },
      ]));
    });

    await clickButton(page, '🏠 Exit');
    await page.waitForFunction(() => !document.body.classList.contains('in-game'));
    await assertHubCleanup(page, 'creator-mode', '.uge-root');

    await clickButton(page, 'WORLDS');
    await waitForDialog(page, 'Discover Worlds');
    const discoverCopy = await page.$eval('[role="dialog"]', (dialog) => dialog.textContent);
    assert.match(
      discoverCopy,
      /Published Creator levels stay in this browser\. Online sharing is off in this build\./,
    );
    assert.match(discoverCopy, new RegExp(worldName));
    assert.match(discoverCopy, /Published on this device/);
    assert.match(discoverCopy, /local name snapshot/);
    assert.doesNotMatch(discoverCopy, /Broken World/);
    assert.deepEqual(await page.evaluate(() => {
      const collection = JSON.parse(localStorage.getItem('67v.ugcWorlds'));
      return {
        version: collection.version,
        names: collection.worlds.map((world) => world.name),
      };
    }), {
      version: 1,
      names: [worldName],
    });
    const recoveredRefs = await page.evaluate(() => {
      const worldId = JSON.parse(localStorage.getItem('67v.ugcWorlds')).worlds[0].id;
      return {
        worldId,
        plays: JSON.parse(localStorage.getItem('67v.ugcPlays')),
        likes: JSON.parse(localStorage.getItem('67v.ugcLikes')),
      };
    });
    assert.deepEqual(recoveredRefs.plays, {
      version: 1,
      counts: { [recoveredRefs.worldId]: 2 },
    });
    assert.deepEqual(recoveredRefs.likes, {
      version: 1,
      counts: { [recoveredRefs.worldId]: 1 },
    });

    await clickButton(page, 'Local review');
    const reviewCopy = await page.$eval('[role="dialog"]', (dialog) => dialog.textContent);
    assert.match(reviewCopy, /1 locally flagged level/);
    assert.match(reviewCopy, new RegExp(worldName));
    assert.match(reviewCopy, /reported by QA Guest \(local name snapshot\)/);
    assert.doesNotMatch(reviewCopy, /Missing World/);
    assert.deepEqual(await page.evaluate(() => {
      const queue = JSON.parse(localStorage.getItem('67v.modQueue'));
      return {
        version: queue.version,
        statuses: Object.fromEntries(queue.records.map((record) => [record.id, record.status])),
      };
    }), {
      version: 1,
      statuses: {
        'healthy-report': 'open',
        'orphan-report': 'unavailable',
        'chat-report': 'pending',
      },
    });
    await clickButton(page, 'Discover');

    const localCardCount = await page.$$eval('.uvd-card', (cards, name) => (
      cards.filter((card) => card.textContent.includes(name)).length
    ), worldName);
    assert.equal(localCardCount, 1);
    await page.$$eval('.uvd-card', (cards, name) => {
      const card = cards.find((item) => item.textContent.includes(name));
      const play = [...card.querySelectorAll('button')]
        .find((button) => button.textContent.trim() === '▶ Play');
      play.click();
    }, worldName);

    await page.waitForSelector('.uvd-playhud');
    assert.match(await page.$eval('.uvd-playhud', (hud) => hud.textContent), /Reach the glowing goal/);
    assert.match(await page.$eval('#mode-name', (element) => element.textContent), new RegExp(worldName));
    await clickButton(page, '← Return to Skypark');
    await waitForDialog(page, 'Return to Skypark?');
    await clickButton(page, 'Yes');
    await page.waitForFunction(() => !document.body.classList.contains('in-game'));
    // Discover playback observes the cleared shared view on the next game-loop
    // tick, then releases its own HUD and scene resources.
    await page.waitForSelector('.uvd-playhud', { hidden: true });
    await assertHubCleanup(page, 'creator-mode', '.uvd-playhud');
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});

test('Creator and local flag flows do not claim success when browser storage rejects a write', { timeout: 35_000 }, async () => {
  const worldName = 'Storage Failure Course';
  const { page, errors } = await openPage('/?game=creator&qa=1&dev=1&autoplay=1');
  try {
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForBodyClass(page, 'creator-mode');
    await clickButton(page, '▶ Play Test');
    await waitForDialog(page, 'You did it!', 12_000);
    await clickButton(page, '🛠 Back to editor');
    await clickButton(page, '📤 Publish on this device');
    await waitForDialog(page, 'Name your world');
    await page.$eval('input.uge-input', (input, value) => { input.value = value; }, worldName);
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      window.__qaStorageFailureKey = '67v.ugcWorlds';
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === window.__qaStorageFailureKey) {
          throw new DOMException('QA storage failure', 'QuotaExceededError');
        }
        return original.call(this, key, value);
      };
    });
    await clickButton(page, 'Save 💾');
    await waitForText(
      page,
      '.uv-toast',
      'Could not save this level on this device',
      5_000,
    );
    assert.deepEqual(await page.evaluate(() => (
      JSON.parse(localStorage.getItem('67v.ugcWorlds'))
    )), { version: 1, worlds: [] });
    assert.match(
      await page.$eval('[role="dialog"]', (dialog) => dialog.textContent),
      /Name your world/,
    );
    assert.doesNotMatch(
      await page.$eval('body', (body) => body.textContent),
      /Published here/,
    );

    await page.evaluate(() => { window.__qaStorageFailureKey = null; });
    await clickButton(page, 'Save 💾');
    await page.waitForFunction((name) => (
      document.body.textContent.includes(name)
      && document.body.textContent.includes('Published here')
    ), {}, worldName);
    await clickButton(page, '🏠 Exit');
    await page.waitForFunction(() => !document.body.classList.contains('in-game'));
    await assertHubCleanup(page, 'creator-mode', '.uge-root');

    await clickButton(page, 'WORLDS');
    await waitForDialog(page, 'Discover Worlds');
    await page.$$eval('.uvd-card', (cards, name) => {
      const card = cards.find((item) => item.textContent.includes(name));
      const flag = [...card.querySelectorAll('button')]
        .find((button) => button.textContent.trim() === '🚩 Flag locally');
      flag.click();
    }, worldName);
    await waitForDialog(page, 'Flag level on this device');
    await page.evaluate(() => { window.__qaStorageFailureKey = '67v.modQueue'; });
    await clickButton(page, 'Something else');
    await waitForText(
      page,
      '.uv-toast',
      'Could not save this flag on this device',
      5_000,
    );
    assert.equal(await page.evaluate(() => localStorage.getItem('67v.modQueue')), null);
    const topDialog = await page.$$eval('[role="dialog"]', (dialogs) => dialogs.at(-1).textContent);
    assert.match(topDialog, /Flag level on this device/);
    assert.doesNotMatch(
      await page.$eval('body', (body) => body.textContent),
      /Flag saved on this device/,
    );
    await page.evaluate(() => { window.__qaStorageFailureKey = null; });
    await clickButton(page, 'Something else');
    await waitForText(
      page,
      '.uv-toast',
      'Flag saved on this device · reporter name kept as a local snapshot.',
      5_000,
    );
    assert.equal(
      await page.evaluate(() => JSON.parse(localStorage.getItem('67v.modQueue')).records.length),
      1,
    );
    await assertNoBrowserErrors(errors);
  } finally {
    await page.close();
  }
});
