// skyway-minimap.js — bird's-eye race map: course line, checkpoints, finish
// bar and every racer as a live dot (player white on top, rivals in their
// accent colors). One canvas, redrawn from the game's own frame ticker.
export function createSkywayMinimap({ waypoints, checkpoints, finishZ, label = 'COURSE' }) {
  const wrap = document.createElement('div');
  wrap.className = 'sw-minimap';
  const canvas = document.createElement('canvas');
  const tag = document.createElement('span');
  tag.className = 'sw-minimap-tag';
  tag.textContent = label;
  wrap.append(canvas, tag);
  document.body.appendChild(wrap);

  const W = 92, H = 264, DPR = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * DPR; canvas.height = H * DPR;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const g = canvas.getContext('2d');

  const xs = waypoints.map((p) => p.x);
  const zAll = waypoints.map((p) => p.z).concat([finishZ, 6]);
  const xlo = Math.min(...xs) - 7, xhi = Math.max(...xs) + 7;
  const zlo = Math.min(...zAll), zhi = Math.max(...zAll);
  const PAD = 12;
  const sx = (x) => PAD + ((x - xlo) / (xhi - xlo)) * (W - PAD * 2);
  const sz = (z) => PAD + ((zhi - z) / (zhi - zlo)) * (H - PAD * 2);

  function draw(dots = []) {
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 2.5; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath();
    waypoints.forEach((p, i) => {
      const X = sx(p.x), Y = sz(p.z);
      if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
    });
    g.stroke();
    g.strokeStyle = 'rgba(255,214,110,0.95)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(PAD - 3, sz(finishZ)); g.lineTo(W - PAD + 3, sz(finishZ)); g.stroke();
    for (const ci of checkpoints) {
      const p = waypoints[ci];
      g.beginPath(); g.arc(sx(p.x), sz(p.z), 4, 0, 7);
      g.fillStyle = 'rgba(12,16,28,0.9)'; g.fill();
      g.lineWidth = 1.6; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.stroke();
    }
    const ordered = dots.slice().sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
    for (const d of ordered) {
      const X = Math.max(4, Math.min(W - 4, sx(d.x)));
      const Y = Math.max(4, Math.min(H - 4, sz(d.z)));
      g.beginPath(); g.arc(X, Y, d.isPlayer ? 4.6 : 3.4, 0, 7);
      g.fillStyle = d.isPlayer ? '#ffffff' : ('#' + ((d.color || 0x8ea2c0) >>> 0).toString(16).padStart(6, '0'));
      g.fill();
      if (d.isPlayer) { g.lineWidth = 2; g.strokeStyle = 'rgba(10,14,26,0.85)'; g.stroke(); }
    }
  }
  draw([]);
  return { el: wrap, update: draw, dispose() { wrap.remove(); } };
}
