import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import {
  nearMaxLocalWorldCollection,
  NEAR_MAX_UGC_WORLD_ID,
  templateLocalWorldCollection,
  templateLocalWorldId,
} from '../tests/fixtures/ugc-worlds.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const artifactDir = join(projectRoot, 'artifacts', 'visual-qa');

export const CAPTURE_POINTS = Object.freeze([
  Object.freeze({
    id: 'entry-desktop',
    scope: 'entry',
    path: '/?qa=1&perf=1',
    viewport: Object.freeze({ width: 1440, height: 900, deviceScaleFactor: 1 }),
  }),
  Object.freeze({
    id: 'entry-mobile',
    scope: 'entry',
    path: '/?qa=1&perf=1',
    viewport: Object.freeze({
      width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    }),
  }),
  Object.freeze({
    id: 'hub-desktop',
    scope: 'hub',
    path: '/?qa=1&perf=1',
    viewport: Object.freeze({ width: 1440, height: 900, deviceScaleFactor: 1 }),
  }),
  Object.freeze({
    id: 'hub-mobile',
    scope: 'hub',
    path: '/?qa=1&perf=1',
    viewport: Object.freeze({
      width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    }),
  }),
  Object.freeze({
    id: 'hub-landscape-mobile',
    scope: 'hub',
    path: '/?qa=1&perf=1',
    viewport: Object.freeze({
      width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    }),
  }),
  Object.freeze({
    id: 'hub-flow-steps-desktop',
    scope: 'hub',
    path: '/?qa=1&perf=1',
    pose: Object.freeze({ x: -4.5, z: 16.5, yaw: Math.PI }),
    viewport: Object.freeze({ width: 1440, height: 900, deviceScaleFactor: 1 }),
  }),
  Object.freeze({
    id: 'hub-skyfold-canopy-desktop',
    scope: 'hub',
    path: '/?qa=1&perf=1',
    pose: Object.freeze({ x: 0, z: 20, yaw: -2.76 }),
    viewport: Object.freeze({ width: 1440, height: 900, deviceScaleFactor: 1 }),
  }),
  Object.freeze({
    id: 'hub-beacon-line-desktop',
    scope: 'hub-activity',
    path: '/?qa=1&perf=1&hubActivity=skate-line&hubActivityActive=1',
    viewport: Object.freeze({ width: 1440, height: 900, deviceScaleFactor: 1 }),
  }),
  Object.freeze({
    id: 'hub-echo-steps-mobile',
    scope: 'hub-activity',
    path: '/?qa=1&perf=1&hubActivity=garden-steps&hubActivityActive=1',
    viewport: Object.freeze({
      width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    }),
  }),
  Object.freeze({
    id: 'tag-runner-desktop',
    scope: 'tag',
    path: '/?game=tag&qa=1&perf=1&visualQa=1&visualQaTag=runner',
    viewport: Object.freeze({ width: 1440, height: 900, deviceScaleFactor: 1 }),
  }),
  Object.freeze({
    id: 'tag-runner-mobile',
    scope: 'tag',
    path: '/?game=tag&qa=1&perf=1&visualQa=1&visualQaTag=runner',
    viewport: Object.freeze({
      width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    }),
  }),
  Object.freeze({
    id: 'tag-final-mobile',
    scope: 'tag',
    path: '/?game=tag&qa=1&perf=1&visualQa=1&visualQaTag=final',
    viewport: Object.freeze({
      width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    }),
  }),
  Object.freeze({
    id: 'tag-return-modal-mobile',
    scope: 'tag',
    path: '/?game=tag&qa=1&perf=1&visualQa=1&visualQaTag=final',
    modal: 'return',
    viewport: Object.freeze({
      width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    }),
  }),
  Object.freeze({
    id: 'skyway-desktop',
    scope: 'skyway',
    path: '/?game=obstacle&qa=1&perf=1&visualQa=1',
    viewport: Object.freeze({ width: 1440, height: 900, deviceScaleFactor: 1 }),
  }),
  Object.freeze({
    id: 'skyway-mobile',
    scope: 'skyway',
    path: '/?game=obstacle&qa=1&perf=1&visualQa=1',
    viewport: Object.freeze({
      width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    }),
  }),
  Object.freeze({
    id: 'skyway-bridge-desktop',
    scope: 'skyway',
    path: '/?game=obstacle&qa=1&perf=1&visualQa=1&visualQaSpot=bridge',
    viewport: Object.freeze({ width: 1440, height: 900, deviceScaleFactor: 1 }),
  }),
  Object.freeze({
    id: 'skyway-bridge-mobile',
    scope: 'skyway',
    path: '/?game=obstacle&qa=1&perf=1&visualQa=1&visualQaSpot=bridge',
    viewport: Object.freeze({
      width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    }),
  }),
  Object.freeze({
    id: 'skyway-finish-desktop',
    scope: 'skyway',
    path: '/?game=obstacle&qa=1&perf=1&visualQa=1&visualQaSpot=finish',
    viewport: Object.freeze({ width: 1440, height: 900, deviceScaleFactor: 1 }),
  }),
  Object.freeze({
    id: 'skyway-finish-mobile',
    scope: 'skyway',
    path: '/?game=obstacle&qa=1&perf=1&visualQa=1&visualQaSpot=finish',
    viewport: Object.freeze({
      width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    }),
  }),
  Object.freeze({
    id: 'balloon-desktop',
    scope: 'balloon',
    path: '/?game=balloon&qa=1&perf=1&visualQaBalloon=runner',
    viewport: Object.freeze({ width: 1440, height: 900, deviceScaleFactor: 1 }),
  }),
  Object.freeze({
    id: 'balloon-mobile',
    scope: 'balloon',
    path: '/?game=balloon&qa=1&perf=1&visualQaBalloon=runner',
    viewport: Object.freeze({
      width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    }),
  }),
  Object.freeze({
    id: 'balloon-late-mobile',
    scope: 'balloon',
    path: '/?game=balloon&qa=1&perf=1&visualQaBalloon=late',
    viewport: Object.freeze({
      width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    }),
  }),
  Object.freeze({
    id: 'show67-intro-desktop',
    scope: 'show67',
    state: 'intro',
    path: '/?game=show67&qa=1&perf=1&visualQaShow=intro',
    viewport: Object.freeze({ width: 1440, height: 900, deviceScaleFactor: 1 }),
  }),
  Object.freeze({
    id: 'show67-intro-mobile',
    scope: 'show67',
    state: 'intro',
    path: '/?game=show67&qa=1&perf=1&visualQaShow=intro',
    viewport: Object.freeze({
      width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    }),
  }),
  Object.freeze({
    id: 'show67-transition-desktop',
    scope: 'show67',
    state: 'transition',
    path: '/?game=show67&qa=1&perf=1&visualQaShow=transition',
    viewport: Object.freeze({ width: 1440, height: 900, deviceScaleFactor: 1 }),
  }),
  Object.freeze({
    id: 'show67-ceremony-desktop',
    scope: 'show67',
    state: 'ceremony',
    path: '/?game=show67&qa=1&perf=1&visualQaShow=ceremony',
    viewport: Object.freeze({ width: 1440, height: 900, deviceScaleFactor: 1 }),
  }),
  Object.freeze({
    id: 'show67-podium-mobile',
    scope: 'show67',
    state: 'final-result',
    path: '/?game=show67&qa=1&perf=1&visualQaShow=podium',
    viewport: Object.freeze({
      width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    }),
  }),
  Object.freeze({
    id: 'ugc-playback-mobile',
    scope: 'ugc-playback',
    path: '/?panel=discovery&qa=1&perf=1',
    viewport: Object.freeze({
      width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    }),
  }),
  Object.freeze({
    id: 'ugc-result-mobile',
    scope: 'ugc-result',
    path: '/?panel=discovery&qa=1&perf=1&ugcAutoplay=1',
    viewport: Object.freeze({
      width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    }),
  }),
  Object.freeze({
    id: 'ugc-near-max-retry-mobile',
    scope: 'ugc-playback',
    path: '/?panel=discovery&qa=1&perf=1',
    fixture: 'near-max-local-world',
    retry: true,
    viewport: Object.freeze({
      width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    }),
  }),
  Object.freeze({
    id: 'ugc-near-max-result-mobile',
    scope: 'ugc-result',
    path: '/?panel=discovery&qa=1&perf=1&ugcAutoplay=1',
    fixture: 'near-max-local-world',
    viewport: Object.freeze({
      width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    }),
  }),
  Object.freeze({
    id: 'ugc-near-max-crowd-lod-mobile',
    scope: 'ugc-playback',
    path: '/?panel=discovery&qa=1&perf=1&ugcCharacterLod=crowd',
    fixture: 'near-max-local-world',
    retry: true,
    viewport: Object.freeze({
      width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    }),
  }),
  ...[
    ['race', 'race-starter'],
    ['survival', 'survival-ring'],
    ['score', 'score-circuit'],
  ].flatMap(([mode, template]) => ([
    Object.freeze({
      id: `ugc-template-${mode}-playback-desktop`,
      scope: 'ugc-template-playback',
      fixture: 'template-local-world',
      template,
      worldId: templateLocalWorldId(template),
      path: '/?panel=discovery&qa=1&perf=1&visualQaUgc=1',
      viewport: Object.freeze({ width: 1440, height: 900, deviceScaleFactor: 1 }),
    }),
    Object.freeze({
      id: `ugc-template-${mode}-playback-mobile`,
      scope: 'ugc-template-playback',
      fixture: 'template-local-world',
      template,
      worldId: templateLocalWorldId(template),
      path: '/?panel=discovery&qa=1&perf=1&visualQaUgc=1',
      viewport: Object.freeze({
        width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
      }),
    }),
  ])),
  Object.freeze({
    id: 'creator-templates-desktop',
    scope: 'creator-template',
    path: '/?game=creator&qa=1&perf=1&creatorTemplates=1',
    viewport: Object.freeze({ width: 1440, height: 900, deviceScaleFactor: 1 }),
  }),
  Object.freeze({
    id: 'creator-templates-mobile',
    scope: 'creator-template',
    path: '/?game=creator&qa=1&perf=1&creatorTemplates=1',
    viewport: Object.freeze({
      width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    }),
  }),
]);

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

async function chromeExecutable() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  throw new Error(
    'Visual QA capture needs Chrome/Chromium. Set PUPPETEER_EXECUTABLE_PATH or CHROME_PATH.',
  );
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export const HUB_SCREENSHOT_EVIDENCE_MINIMUMS = Object.freeze({
  sampledPixels: 1_000,
  rgbVariance: 400,
  quantizedColorCount: 24,
});

export function hasMeaningfulHubScreenshot(evidence) {
  return (
    Number.isFinite(evidence?.sampledPixels)
    && evidence.sampledPixels >= HUB_SCREENSHOT_EVIDENCE_MINIMUMS.sampledPixels
    && Number.isFinite(evidence?.rgbVariance)
    && evidence.rgbVariance >= HUB_SCREENSHOT_EVIDENCE_MINIMUMS.rgbVariance
    && Number.isFinite(evidence?.quantizedColorCount)
    && evidence.quantizedColorCount >= HUB_SCREENSHOT_EVIDENCE_MINIMUMS.quantizedColorCount
  );
}

async function screenshotVisualEvidence(page, screenshotBytes) {
  return page.evaluate(async (base64Png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64Png}`;
    await image.decode();

    // Inspect the central game view, excluding the fixed HUD at the edges.
    // A small downsample is deterministic and catches a canvas filled by one
    // near-camera surface without adding an image-processing dependency.
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 80;
    sampleCanvas.height = 50;
    const context = sampleCanvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(
      image,
      image.width * 0.1,
      image.height * 0.12,
      image.width * 0.8,
      image.height * 0.72,
      0,
      0,
      sampleCanvas.width,
      sampleCanvas.height,
    );
    const pixels = context.getImageData(
      0,
      0,
      sampleCanvas.width,
      sampleCanvas.height,
    ).data;
    const quantizedColors = new Set();
    let red = 0;
    let green = 0;
    let blue = 0;
    let redSquared = 0;
    let greenSquared = 0;
    let blueSquared = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      red += r;
      green += g;
      blue += b;
      redSquared += r * r;
      greenSquared += g * g;
      blueSquared += b * b;
      quantizedColors.add(`${r >> 4},${g >> 4},${b >> 4}`);
    }
    const sampledPixels = pixels.length / 4;
    const variance = (sumSquared, sum) => (
      sumSquared / sampledPixels - (sum / sampledPixels) ** 2
    );
    return {
      sampledPixels,
      rgbVariance: (
        variance(redSquared, red)
        + variance(greenSquared, green)
        + variance(blueSquared, blue)
      ),
      quantizedColorCount: quantizedColors.size,
    };
  }, screenshotBytes.toString('base64'));
}

async function capturePoint(browser, baseUrl, point) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    errors.push(`request: ${request.url()} (${request.failure()?.errorText || 'failed'})`);
  });
  await page.setViewport(point.viewport);
  if (point.fixture === 'near-max-local-world') {
    await page.evaluateOnNewDocument((collection) => {
      localStorage.setItem('67v.ugcWorlds', JSON.stringify(collection));
    }, nearMaxLocalWorldCollection());
  } else if (point.fixture === 'template-local-world') {
    await page.evaluateOnNewDocument((collection) => {
      localStorage.setItem('67v.ugcWorlds', JSON.stringify(collection));
    }, templateLocalWorldCollection(point.template));
  }
  await page.goto(`${baseUrl}${point.path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__67VERSE_PERF__?.snapshot, { timeout: 15_000 });

  if (point.scope === 'hub' || point.scope === 'hub-activity') {
    await page.click('#enter-game');
    await page.waitForFunction(() => (
      !document.body.classList.contains('entry-open')
      && window.__67VERSE_QA__?.player
    ));
    if (point.scope === 'hub-activity') {
      await page.waitForFunction(() => window.__67VERSE_QA__?.activity()?.active);
    }
    if (point.pose) {
      await page.evaluate(({ x, z, yaw }) => {
        window.__67VERSE_QA__.teleport(x, z);
        window.__67VERSE_QA__.orient(yaw);
      }, point.pose);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 350));
    }
  } else if (point.scope === 'skyway') {
    await page.waitForFunction(() => (
      document.body.classList.contains('skyway-mode')
      && window.__67VERSE_PERF__?.snapshot()?.scope === 'skyway'
    ), { timeout: 15_000 });
  } else if (point.scope === 'balloon') {
    await page.waitForFunction(() => (
      document.body.classList.contains('balloon-mode')
      && window.__67VERSE_PERF__?.snapshot()?.scope === 'balloon'
    ), { timeout: 15_000 });
    await page.waitForFunction(() => document.body.dataset.balloonPhase === 'playing');
    if (point.id === 'balloon-late-mobile') {
      await page.waitForFunction(() => document.body.dataset.balloonFinal === 'true');
    }
  } else if (point.scope === 'show67') {
    await page.waitForFunction((state) => (
      document.body.classList.contains('show67-mode')
      && document.body.dataset.show67Phase === state
      && window.__67VERSE_PERF__?.snapshot()?.scope === 'show67'
    ), { timeout: 15_000 }, point.state);
  } else if (point.scope === 'tag') {
    await page.waitForFunction(() => (
      document.body.classList.contains('tag-mode')
      && document.body.dataset.tagPhase === 'playing'
      && window.__67VERSE_PERF__?.snapshot()?.scope === 'tag'
    ), { timeout: 15_000 });
    if (point.path.includes('visualQaTag=final')) {
      await page.waitForFunction(() => document.body.dataset.tagFinal === 'true');
    }
    if (point.modal === 'return') {
      await page.click('#return-skypark');
      await page.waitForFunction(() => (
        document.body.classList.contains('modal-open')
        && document.querySelector('[role="dialog"]')?.textContent.includes('Return to Skypark?')
      ));
    }
  } else if (
    point.scope === 'ugc-playback'
    || point.scope === 'ugc-result'
    || point.scope === 'ugc-template-playback'
  ) {
    await page.waitForSelector('.uvd-panel');
    await page.$eval('#enter-game', (button) => button.click());
    await page.waitForFunction(() => !document.body.classList.contains('entry-open'));
    await page.$$eval('.uvd-card', (cards, worldId) => {
      const card = worldId
        ? cards.find((candidate) => candidate.dataset.worldId === worldId)
        : cards[0];
      [...(card?.querySelectorAll('button') || [])]
        .find((button) => button.textContent.trim() === '▶ Play')
        ?.click();
    }, point.worldId || (
      point.fixture === 'near-max-local-world' ? NEAR_MAX_UGC_WORLD_ID : null
    ));
    await page.waitForSelector(
      point.scope === 'ugc-result' ? '.uvd-winbox' : '.uvd-playhud',
      { timeout: 15_000 },
    );
    await page.waitForFunction(() => (
      window.__67VERSE_PERF__?.snapshot()?.scope === 'ugc'
    ), { timeout: 15_000 });
    if (point.retry) {
      await page.evaluate(() => window.__67VERSE_UGC_QA__.forceFallRetry());
      await page.waitForFunction(() => (
        window.__67VERSE_UGC_QA__?.snapshot().retries === 1
        && document.querySelector('.uvd-playhud')?.textContent.includes('Back at the start')
      ));
    }
  } else if (point.scope === 'creator-template' || point.scope === 'creator-playback') {
    await page.waitForFunction(() => document.body.classList.contains('creator-mode'));
    if (await page.$('#enter-game')) await page.click('#enter-game');
    await page.waitForFunction(() => !document.body.classList.contains('entry-open'));
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 350));
    if (point.scope === 'creator-playback') {
      await page.$$eval('.uge-top button', (buttons) => {
        buttons.find((button) => button.textContent.includes('Play Test'))?.click();
      });
      await page.waitForFunction(() => (
        document.body.classList.contains('creator-playing')
        && [...document.querySelectorAll('.uge-bottom')]
          .some((bar) => getComputedStyle(bar).display !== 'none'
            && bar.textContent.includes('Editor'))
      ), { timeout: 15_000 });
    } else if (!await page.$('.uge-template-panel')) {
      await page.$$eval('.uge-top button', (buttons) => {
        buttons.find((button) => button.textContent.includes('New'))?.click();
      });
      await page.waitForFunction(() => (
        document.querySelector('[role="dialog"]')?.textContent.includes('Start a fresh world?')
      ));
      await page.$$eval('[role="dialog"] button', (buttons) => {
        buttons.find((button) => button.textContent.trim() === 'Yes')?.click();
      });
    }
    if (point.scope === 'creator-template') {
      await page.waitForSelector('.uge-template-panel', { timeout: 15_000 });
    }
    await page.waitForFunction(() => (
      window.__67VERSE_PERF__?.snapshot()?.scope === 'ugc'
    ), { timeout: 15_000 });
  }

  // Character-heavy Tag and Balloon scenes settle over several frames. Keep
  // their fixed-view comparison on a steady 240-sample window instead of
  // allowing one 120-sample cold-start tail to dominate p95.
  const requiredSamples = point.scope === 'ugc-template-playback'
    ? 600
    : (
      point.scope === 'tag'
      || point.scope === 'balloon'
      || point.scope === 'creator-playback'
    ) ? 240 : 120;
  await page.waitForFunction((minimum) => (
    window.__67VERSE_PERF__.snapshot()?.sampleCount >= minimum
  ), { timeout: 30_000 }, requiredSamples);
  if (point.id !== 'balloon-late-mobile') {
    await page.waitForFunction(() => !document.querySelector('.uv-toast'), { timeout: 8_000 });
  }
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 350));

  const capture = await page.evaluate((label) => window.__67VERSE_PERF__.capture(label), point.id);
  await page.evaluate(() => {
    const overlay = document.querySelector('#dev-overlay');
    if (overlay) overlay.style.display = 'none';
    document.querySelector('.ps-objective')?.remove();
  });
  const screenshotPath = join(artifactDir, `${point.id}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const screenshotBytes = await readFile(screenshotPath);
  const visualEvidence = await screenshotVisualEvidence(page, screenshotBytes);
  await page.close();

  return {
    id: point.id,
    scope: point.scope,
    route: point.path,
    viewport: point.viewport,
    screenshot: relative(projectRoot, screenshotPath),
    screenshotSha256: sha256(screenshotBytes),
    visualEvidence,
    errors,
    runtime: capture.runtime,
    attribution: capture.attribution,
    quality: capture.quality,
  };
}

export function validateCaptureReport(
  report,
  { expectedPoints = CAPTURE_POINTS } = {},
) {
  const failures = [];
  const expectedIds = new Set(expectedPoints.map(({ id }) => id));
  for (const capture of report.captures || []) {
    expectedIds.delete(capture.id);
    if (capture.errors?.length) failures.push(`${capture.id}: ${capture.errors.join('; ')}`);
    if (capture.runtime?.status !== 'within-guardrails') {
      failures.push(`${capture.id}: runtime ${capture.runtime?.status || 'missing'}`);
    }
    if (
      (
        capture.scope?.startsWith('ugc-')
        || capture.scope === 'creator-template'
        || capture.scope === 'creator-playback'
      )
      && capture.runtime?.scope !== 'ugc'
    ) {
      failures.push(`${capture.id}: expected dedicated UGC runtime scope`);
    }
    if (!capture.screenshotSha256) failures.push(`${capture.id}: screenshot hash missing`);
    if (
      (capture.scope === 'hub' || capture.scope === 'hub-activity')
      && !hasMeaningfulHubScreenshot(capture.visualEvidence)
    ) {
      failures.push(
        `${capture.id}: hub screenshot is effectively blank ` +
        `(variance ${capture.visualEvidence?.rgbVariance ?? 'missing'}, ` +
        `colors ${capture.visualEvidence?.quantizedColorCount ?? 'missing'})`,
      );
    }
    if (!Number.isFinite(capture.attribution?.estimatedDraws)) {
      failures.push(`${capture.id}: scene attribution missing`);
    }
    if (capture.id?.startsWith('ugc-near-max-')) {
      const staticGroup = capture.attribution?.groups
        ?.find(({ group }) => group === 'ugc-static');
      const animatedGroup = capture.attribution?.groups
        ?.find(({ group }) => group === 'ugc-animated');
      if (
        capture.attribution?.estimatedDraws > 16
        || staticGroup?.estimatedDraws !== 2
        || staticGroup?.instances !== 54
        || animatedGroup?.estimatedDraws !== 4
        || animatedGroup?.instances !== 80
      ) {
        failures.push(`${capture.id}: UGC batching evidence missing or over draw limit`);
      }
    }
    if (capture.id === 'ugc-near-max-crowd-lod-mobile') {
      const characters = capture.attribution?.groups
        ?.find(({ group }) => group === 'characters');
      if (
        capture.runtime?.metrics?.characters?.crowd !== 1
        // The QA runner deliberately replaced the unrigged Ghost placeholder.
        // Its articulated five-draw crowd LOD is 2,416 triangles.
        || characters?.triangles !== 2_416
        || characters?.estimatedDraws !== 5
      ) {
        failures.push(`${capture.id}: existing Crowd LOD comparison evidence missing`);
      }
    }
    if (!['high', 'low'].includes(capture.quality?.tier)) {
      failures.push(`${capture.id}: quality tier missing`);
    }
    if (!Number.isFinite(capture.quality?.pixelRatio)) {
      failures.push(`${capture.id}: quality pixel ratio missing`);
    }
  }
  for (const id of expectedIds) failures.push(`${id}: capture missing`);
  return failures;
}

export async function runVisualQaCapture({ ids = null } = {}) {
  await mkdir(artifactDir, { recursive: true });
  const selectedPoints = ids?.length
    ? CAPTURE_POINTS.filter(({ id }) => ids.includes(id))
    : CAPTURE_POINTS;
  if (ids?.length && selectedPoints.length !== new Set(ids).size) {
    const known = new Set(selectedPoints.map(({ id }) => id));
    const unknown = [...new Set(ids)].filter((id) => !known.has(id));
    throw new Error(`Unknown visual QA capture point: ${unknown.join(', ')}`);
  }
  const server = await createServer({
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address !== 'object') throw new Error('Visual QA server did not bind.');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const executablePath = await chromeExecutable();
  const launchBrowser = () => puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--hide-scrollbars',
      '--mute-audio',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  });
  // Each template is a separate benchmark specimen. Give those six fixed
  // views a clean renderer process so shader/GC residue from the previous
  // viewport cannot decide whether an otherwise identical capture passes.
  const needsSharedBrowser = selectedPoints.some(
    ({ scope }) => scope !== 'ugc-template-playback',
  );
  const browser = needsSharedBrowser ? await launchBrowser() : null;

  const captures = [];
  try {
    for (const point of selectedPoints) {
      console.log(`capture ${point.id}...`);
      const isolated = point.scope === 'ugc-template-playback';
      const pointBrowser = isolated ? await launchBrowser() : browser;
      try {
        captures.push(await capturePoint(pointBrowser, baseUrl, point));
      } finally {
        if (isolated) await pointBrowser.close();
      }
    }
  } finally {
    await browser?.close();
    await server.close();
  }

  const report = {
    kind: '67verse-visual-qa-report',
    generatedAt: new Date().toISOString(),
    artBible: 'ART-BIBLE.md',
    caveat: 'Headless fixed-view evidence. Mobile viewports are not physical-device benchmarks.',
    automatedStatus: 'pending',
    humanReview: 'required',
    captures,
  };
  const failures = validateCaptureReport(report, { expectedPoints: selectedPoints });
  report.automatedStatus = failures.length ? 'fail' : 'pass';
  report.failures = failures;
  const reportFilename = ids?.length
    ? `report-${selectedPoints.map(({ id }) => id).join('__')}.json`
    : 'report.json';
  await writeFile(
    join(artifactDir, reportFilename),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  for (const capture of captures) {
    const { runtime, attribution } = capture;
    console.log(
      `${capture.id}: ${capture.quality.tier}@${capture.quality.pixelRatio.toFixed(2)}x; ` +
      `${runtime.status}; p95 ${runtime.metrics.frameMs.p95.toFixed(1)}ms; ` +
      `draws ${runtime.metrics.drawCalls.peak}; tris ${runtime.metrics.triangles.peak}; ` +
      `scene draws ${attribution.estimatedDraws}`,
    );
  }
  if (failures.length) {
    throw new Error(`Visual QA capture failed:\n- ${failures.join('\n- ')}`);
  }
  console.log(`visual QA PASS -> ${relative(projectRoot, join(artifactDir, reportFilename))}`);
  return report;
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const ids = process.env.VISUAL_QA_IDS
    ?.split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  await runVisualQaCapture({ ids });
  // Chrome can retain idle DevTools pipe handles after `browser.close()` on
  // macOS. All screenshots, the report, browser, and Vite server are already
  // awaited above, so explicitly terminate the completed CLI gate.
  process.exit(0);
}
