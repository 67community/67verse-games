// video-kare.mjs — grab style frames from the YouTube reference so the
// graphics pass works from the actual footage.
import { access, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
async function chrome() {
  for (const c of CHROME) { try { await access(c, constants.X_OK); return c; } catch {} }
  throw new Error('Chrome yok');
}
const outDir = new URL('../../artifacts/headless-qa/', import.meta.url).pathname;
await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: await chrome(),
  headless: 'new',
  args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
await page.goto('https://www.youtube.com/watch?v=ifKnOtWOW0w&mute=1', {
  waitUntil: 'networkidle2', timeout: 45000,
});
// tiklamayla oynatmayi da dene
// cerez ekraninda en gizlilik-dostu secenek: reddet
try {
  await page.waitForSelector('button', { timeout: 6000 });
  await page.evaluate(() => {
    const dugme = [...document.querySelectorAll('button')]
      .find((b) => /reject|tumunu reddet|reddet/i.test(b.textContent));
    dugme?.click();
  });
} catch {}
await new Promise((r) => setTimeout(r, 3000));
try { await page.click('.ytp-large-play-button', { timeout: 3000 }); } catch {}
try { await page.keyboard.press('k'); } catch {}
// dogrudan videonun icinde noktalara atla
await new Promise((r) => setTimeout(r, 6000));
const sure = await page.evaluate(() => document.querySelector('video')?.duration || 0);
console.log('video suresi:', Math.round(sure), 's');
const oranlar = [0.18, 0.32, 0.46, 0.60, 0.74, 0.88];
for (const oran of oranlar) {
  await page.evaluate((t) => {
    const v = document.querySelector('video');
    if (v) { v.currentTime = t; v.play(); }
  }, sure * oran);
  await new Promise((r) => setTimeout(r, 2500));
  const etiket = String(Math.round(oran * 100)).padStart(2, '0');
  const file = `${outDir}video-p${etiket}.png`;
  await page.screenshot({ path: file });
  console.log('kare %' + etiket, '->', file);
}
await browser.close();
