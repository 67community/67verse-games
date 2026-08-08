// mevsim-bak.js — force autumn, then winter with snow; bird's-eye each.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_HAVA__?.mevsimZorla && Date.now() - t0 < 25000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const hava = window.__67VERSE_HAVA__;
  const qa = window.__67VERSE_QA__;
  if (!hava?.mevsimZorla) return { error: 'hava kancasi yok' };
  hava.mevsimZorla('sonbahar');
  qa.birdseye(28, 28, 44);
  setTimeout(() => { hava.mevsimZorla('kis'); hava.zorla('yagmur'); }, 6500);
  setTimeout(() => { qa.birdseyeOff(); qa.teleport(30, 26); }, 9000);
  return 'armed';
})()
