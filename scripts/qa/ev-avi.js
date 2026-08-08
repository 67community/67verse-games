// ev-avi.js — hunt the houses standing in the street. Bird's-eye passes down
// the west riverside strip, then names every mesh under each suburb house.
(async () => {
  const t0 = Date.now();
  while (!window.__67VERSE_QA__?.birdseye && Date.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const qa = window.__67VERSE_QA__;

  // Every suburb house body is one instance of district:suburb-houses; read
  // the instance matrices straight off the scene to get their real positions.
  const kutular = qa.sceneBoxes(4);
  const evKutu = kutular.filter((b) => /suburb|ev|house/i.test(b.name));
  console.log('[ev-qa] ev meshleri:', JSON.stringify(evKutu.map((b) => b.name)));

  // West strip from the north end down, one shot each.
  qa.birdseye(-50, -20, 52);
  setTimeout(() => qa.birdseye(-50, 20, 52), 6000);
  setTimeout(() => qa.birdseye(-50, 50, 52), 11000);
  return 'armed';
})()
