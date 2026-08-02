import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const artifactPath = join(projectRoot, 'artifacts', 'first-playable-readiness.json');
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
  throw new Error('First-playable readiness check needs Chrome or Chromium.');
}

function channelToLinear(value) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map((channel) => (
    channelToLinear(Number.parseInt(channel, 16))
  ));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  return (lighter + 0.05) / (darker + 0.05);
}

async function openSkyway(browser, url, viewport, reducedMotion = false) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.setViewport(viewport);
  if (reducedMotion) {
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);
  }
  await page.goto(`${url}/?game=obstacle&qa=1&perf=1`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => (
    document.body.classList.contains('skyway-mode')
    && document.querySelector('.sw-hud')
    && !document.body.classList.contains('entry-open')
  ));
  return { page, errors };
}

async function run() {
  const server = await createServer({
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address !== 'object') {
    throw new Error('First-playable readiness server did not bind.');
  }
  const url = `http://127.0.0.1:${address.port}`;
  const browser = await puppeteer.launch({
    executablePath: await chromeExecutable(),
    headless: true,
    args: ['--hide-scrollbars', '--mute-audio'],
  });

  try {
    const desktop = await openSkyway(
      browser,
      url,
      { width: 1440, height: 900, deviceScaleFactor: 1 },
      true,
    );
    const desktopEvidence = await desktop.page.evaluate(() => {
      const progress = document.querySelector('.sw-progress');
      const confetti = document.querySelector('.sw-confetti');
      const guide = document.querySelector('.sw-guide');
      const returnButton = document.querySelector('#return-skypark');
      const liveRegion = document.querySelector('.sw-flash');
      const hud = document.querySelector('.sw-hud');
      return {
        progress: {
          role: progress.getAttribute('role'),
          label: progress.getAttribute('aria-label'),
          min: progress.getAttribute('aria-valuemin'),
          max: progress.getAttribute('aria-valuemax'),
          now: progress.getAttribute('aria-valuenow'),
        },
        assertiveLiveRegion: liveRegion.getAttribute('aria-live'),
        hudRole: hud.getAttribute('role'),
        hudLabel: hud.getAttribute('aria-label'),
        reducedMotion: {
          matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
          confettiDisplay: getComputedStyle(confetti).display,
          guideTransitionDuration: getComputedStyle(guide).transitionDuration,
        },
        returnButton: {
          label: returnButton.textContent.trim(),
          disabled: returnButton.disabled,
        },
      };
    });
    assert.deepEqual(desktopEvidence.progress, {
      role: 'progressbar',
      label: 'Course progress',
      min: '0',
      max: '100',
      now: '0',
    });
    assert.equal(desktopEvidence.assertiveLiveRegion, 'assertive');
    assert.equal(desktopEvidence.hudRole, 'group');
    assert.equal(desktopEvidence.hudLabel, 'Skyway Sprint race status');
    assert.equal(desktopEvidence.reducedMotion.matches, true);
    assert.equal(desktopEvidence.reducedMotion.confettiDisplay, 'none');
    assert.equal(desktopEvidence.returnButton.disabled, false);

    const tabOrder = [];
    for (let index = 0; index < 20; index += 1) {
      await desktop.page.keyboard.press('Tab');
      const active = await desktop.page.evaluate(() => ({
        id: document.activeElement?.id || '',
        label: document.activeElement?.getAttribute?.('aria-label')
          || document.activeElement?.textContent?.trim()
          || '',
      }));
      tabOrder.push(active);
      if (active.id === 'return-skypark') break;
    }
    assert.equal(tabOrder.at(-1)?.id, 'return-skypark');
    const focusEvidence = await desktop.page.$eval('#return-skypark', (button) => {
      const style = getComputedStyle(button);
      return {
        active: document.activeElement === button,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });
    assert.equal(focusEvidence.active, true);
    assert.notEqual(focusEvidence.outlineStyle, 'none');
    assert.ok(Number.parseFloat(focusEvidence.outlineWidth) >= 2);

    await desktop.page.keyboard.press('Enter');
    await desktop.page.waitForSelector('[role="dialog"]');
    const dialogEvidence = await desktop.page.$eval('[role="dialog"]', (dialog) => {
      const labelledBy = dialog.getAttribute('aria-labelledby');
      return {
        label: dialog.getAttribute('aria-label')
          || document.getElementById(labelledBy)?.textContent?.trim()
          || dialog.querySelector('h1,h2,h3')?.textContent?.trim()
          || '',
        labelledBy,
        describedBy: dialog.getAttribute('aria-describedby'),
        text: dialog.textContent,
        activeText: document.activeElement?.textContent?.trim(),
        activeLabel: document.activeElement?.getAttribute?.('aria-label') || '',
        focusInside: dialog.contains(document.activeElement),
      };
    });
    assert.equal(dialogEvidence.label, 'Are you sure?');
    assert.ok(dialogEvidence.labelledBy);
    assert.match(dialogEvidence.text, /Return to Skypark/);
    assert.ok(dialogEvidence.describedBy);
    assert.equal(dialogEvidence.focusInside, true);
    assert.ok(dialogEvidence.activeText || dialogEvidence.activeLabel);
    await desktop.page.keyboard.press('Escape');
    await desktop.page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    assert.equal(
      await desktop.page.evaluate(() => document.activeElement?.id),
      'return-skypark',
    );
    assert.deepEqual(desktop.errors, []);
    await desktop.page.close();

    const mobile = await openSkyway(browser, url, {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    const mobileEvidence = await mobile.page.evaluate(() => {
      const rect = (element) => {
        const bounds = element.getBoundingClientRect();
        return {
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          left: bounds.left,
          width: bounds.width,
          height: bounds.height,
          insideViewport: bounds.top >= 0
            && bounds.left >= 0
            && bounds.right <= innerWidth
            && bounds.bottom <= innerHeight,
        };
      };
      const jump = document.querySelector('#btn-jump');
      const nav = document.querySelector('#mode-nav');
      const status = document.querySelector('.sw-position');
      const timer = document.querySelector('.sw-time');
      const touch = document.querySelector('#touch-ui');
      return {
        viewport: { width: innerWidth, height: innerHeight },
        jump: rect(jump),
        nav: rect(nav),
        status: rect(status),
        timer: rect(timer),
        touch: {
          inert: touch.inert,
          ariaHidden: touch.getAttribute('aria-hidden'),
          visibility: getComputedStyle(touch).visibility,
        },
        jumpLabel: jump.getAttribute('aria-label'),
      };
    });
    for (const region of ['jump', 'nav', 'status', 'timer']) {
      assert.equal(mobileEvidence[region].insideViewport, true, `${region} overflowed`);
    }
    assert.ok(mobileEvidence.jump.width >= 44 && mobileEvidence.jump.height >= 44);
    assert.equal(mobileEvidence.jumpLabel, 'Jump');
    assert.deepEqual(mobileEvidence.touch, {
      inert: false,
      ariaHidden: null,
      visibility: 'visible',
    });
    assert.deepEqual(mobile.errors, []);
    await mobile.page.close();

    const contrast = {
      bodyTextOnCeramic: contrastRatio('2a2724', 'fbf8f2'),
      creamTextOnInk: contrastRatio('f3ead8', '2d3b42'),
      checkpointTextOnCeramic: contrastRatio('2d3b42', 'fbf8f2'),
    };
    for (const ratio of Object.values(contrast)) assert.ok(ratio >= 4.5);

    const report = {
      kind: '67verse-first-playable-readiness',
      generatedAt: new Date().toISOString(),
      environment: {
        browser: await browser.version(),
        caveat: 'Headless Chrome viewport emulation; not a physical iOS or Android device.',
      },
      status: 'pass',
      desktop: {
        ...desktopEvidence,
        tabOrder,
        focus: focusEvidence,
        dialog: dialogEvidence,
      },
      mobile: mobileEvidence,
      contrast,
    };
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(
      `first-playable readiness PASS -> ${artifactPath}; `
      + `touch ${Math.round(mobileEvidence.jump.width)}px; `
      + `contrast ${Math.min(...Object.values(contrast)).toFixed(2)}:1`,
    );
  } finally {
    await browser.close();
    await server.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
