// headless-qa.mjs — headless verification for 67 Park work while the Browser
// pane is hidden (hidden panes park RAF, freezing the app). Headless Chrome
// treats its page as visible, so the game really runs and screenshots are
// truthful. Usage:
//   node scripts/headless-qa.mjs '<path-with-query>' <shot1s> ... [--out prefix]
// Example:
//   node scripts/headless-qa.mjs '/?game=karting&qa=1' 3 10 20 34
import { access, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].filter(Boolean);

async function chromeExecutable() {
  for (const candidate of CHROME_CANDIDATES) {
    try { await access(candidate, constants.X_OK); return candidate; } catch {}
  }
  throw new Error('No Chrome found; set CHROME_PATH');
}

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const prefix = outIdx >= 0 ? args[outIdx + 1] : 'shot';
const positional = outIdx >= 0 ? [...args.slice(0, outIdx), ...args.slice(outIdx + 2)] : args;
const path = positional[0] || '/?game=karting&qa=1';
const times = positional.slice(1).map(Number);
const shots = times.length ? times : [3, 10, 20, 34];

const outDir = new URL('../artifacts/headless-qa/', import.meta.url).pathname;
await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: await chromeExecutable(),
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--window-size=1440,900', '--hide-scrollbars', '--mute-audio'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const errors = [];
const telemetry = [];
page.on('console', (msg) => {
  const text = msg.text();
  if (msg.type() === 'error' || msg.type() === 'warn') errors.push(`[${msg.type()}] ${text}`);
  if (text.includes('-qa]') || text.includes('[67VERSE]')) telemetry.push(text);
});
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));

await page.goto(`http://localhost:5173${path}`, { waitUntil: 'networkidle2', timeout: 45000 });
// Through the entry gate if it is showing.
try {
  await page.waitForSelector('#enter-game', { timeout: 6000 });
  await page.click('#enter-game');
} catch {}

const t0 = Date.now();
for (const s of shots) {
  const wait = t0 + s * 1000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const file = `${outDir}${prefix}-${String(s).padStart(3, '0')}s.png`;
  await page.screenshot({ path: file });
  console.log('shot', `${s}s`, '->', file);
}
console.log('--- telemetry ---');
for (const t of telemetry.slice(-40)) console.log(t);
console.log('--- console issues (last 25) ---');
for (const e of errors.slice(-25)) console.log(e);
if (!errors.length) console.log('(temiz)');
await browser.close();
