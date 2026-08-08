// phone-tour.js — weather + phone end to end: force rain, catch the alert,
// open the phone, text a friend, take a photo. Shots at 5 / 8 / 12 / 17 / 22s.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.teleport && Date.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;
  if (!qa?.teleport) return { error: 'QA hooks never appeared' };
  const rapor = {};

  qa.teleport(2, -34);
  setTimeout(() => { rapor.uyari = window.__67VERSE_HAVA__?.uyariTetikle() || false; }, 2500);
  setTimeout(() => { rapor.bildirimGorunur = document.querySelector('#tf-bildirim')?.style.display === 'block'; }, 3500);
  setTimeout(() => { window.__67VERSE_HAVA__?.zorla('yagmur'); }, 4000);
  setTimeout(() => { rapor.hava = window.__67VERSE_HAVA__?.oku(); }, 7000);
  setTimeout(() => { document.querySelector('#tf-dugme')?.click(); }, 9000);
  setTimeout(() => {
    [...document.querySelectorAll('.tf-app')].find((a) => a.textContent.includes('Messages'))?.click();
  }, 10500);
  setTimeout(() => { document.querySelector('.tf-kisi')?.click(); }, 11500);
  setTimeout(() => {
    const giris = document.querySelector('#tf-yaz input');
    if (giris) {
      giris.value = 'See you at the funfair?';
      document.querySelector('#tf-yaz button')?.click();
    }
  }, 12500);
  setTimeout(() => {
    rapor.mesajBalonlari = document.querySelectorAll('.tf-balon').length;
  }, 16000);
  setTimeout(() => {
    [...document.querySelectorAll('.tf-geri')].at(-1)?.click();
  }, 16500);
  setTimeout(() => {
    [...document.querySelectorAll('.tf-geri')].at(-1)?.click();
  }, 17000);
  setTimeout(() => {
    [...document.querySelectorAll('.tf-app')].find((a) => a.textContent.includes('Camera'))?.click();
  }, 17600);
  setTimeout(() => { document.querySelector('.tf-buyuk')?.click(); }, 18600);
  setTimeout(() => {
    rapor.fotograflar = document.querySelectorAll('.tf-foto').length;
    console.log('[phone-qa]', JSON.stringify(rapor));
  }, 20500);
  return 'phone tour armed';
})()
