// standart-tur.js — Standard edition now picks character AND items on the
// premium stage; a moving car shoves the player; B toggles the board.
(async () => {
  const rapor = {};
  const tikla = (sec) => document.querySelector(sec)?.click();
  const bas = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c }));
  const birak = (c) => window.dispatchEvent(new KeyboardEvent('keyup', { code: c }));

  setTimeout(() => tikla('#enter-game'), 800);
  setTimeout(() => tikla('.ks-kart[data-surum="normal"]'), 2000);   // STANDARD
  setTimeout(() => { rapor.pickerAcik = document.querySelector('#karakter-secim')?.classList.contains('nft-secim'); }, 3200);
  setTimeout(() => tikla('#ks-sec'), 3600);                          // SELECT -> item asamasi
  setTimeout(() => {
    rapor.itemAsamasi = document.querySelector('#karakter-secim')?.classList.contains('item-asamasi');
    rapor.itemAdi = document.querySelector('#ks-ad')?.textContent;
  }, 4600);
  setTimeout(() => tikla('#ks-sag'), 5000);                          // yan tusla item gez
  setTimeout(() => { rapor.ikinciItem = document.querySelector('#ks-ad')?.textContent; }, 5600);
  setTimeout(() => tikla('#ks-sec'), 6000);                          // WEAR
  setTimeout(() => {
    rapor.giyildi = JSON.parse(localStorage.getItem('67v.equippedCosmetics') || '{}');
  }, 6600);
  setTimeout(() => tikla('#ks-bitti'), 7000);                        // DONE -> dunya

  // trafik yolu ustunde bekle: z -19.5 caddesi, serit x'te gezer; y ekseni yolu
  const qaBekle = setInterval(() => {
    if (window.__67VERSE_QA__?.teleport) {
      clearInterval(qaBekle);
      setTimeout(() => { window.__67VERSE_QA__.teleport(0, -19.0); rapor.once = window.__67VERSE_QA__.player(); }, 8000);
      setTimeout(() => { rapor.sonra = window.__67VERSE_QA__.player(); }, 13500);
      // B ile kaykay
      setTimeout(() => bas('KeyB'), 14000);
      setTimeout(() => {
        rapor.kaykayToast = [...document.querySelectorAll('.uv-toast')].at(-1)?.textContent || null;
        console.log('[standart-qa]', JSON.stringify(rapor));
      }, 15200);
    }
  }, 300);
  return 'armed';
})()
