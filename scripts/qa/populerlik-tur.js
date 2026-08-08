// populerlik-tur.js — photo, share, likes, score. Shots at 6 / 13s.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.teleport && Date.now() - t0 < 25000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const tikla = (sec) => document.querySelector(sec)?.click();
  const rapor = {};
  setTimeout(() => tikla('#tf-dugme'), 1500);
  setTimeout(() => {
    [...document.querySelectorAll('.tf-app')].find((a) => a.textContent.includes('Camera'))?.click();
  }, 2600);
  setTimeout(() => tikla('.tf-buyuk'), 3400);                    // foto cek
  setTimeout(() => {
    const paylas = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Share');
    rapor.paylasVar = Boolean(paylas);
    paylas?.click();
  }, 4600);
  setTimeout(() => {
    rapor.puan = JSON.parse(localStorage.getItem('67v.populerlik') || '0');
    rapor.bildirim = document.querySelector('#tf-bildirim')?.textContent || null;
    console.log('[populerlik-qa]', JSON.stringify(rapor));
  }, 12500);
  return 'armed';
})()
