// systems/harita.js — the park map, and travelling by tapping it.
//
// Walking the whole island to reach one corner of it is the problem this
// solves: open the map, tap a place, arrive. The image is a real orthographic
// render of the world taken at a fixed projection — centre (0,0), 62 units to
// each edge, north up — so a pixel maps onto a world position exactly, with no
// alignment fudge factor:
//
//     world x = (px / size - 0.5) * 124
//     world z = (py / size - 0.5) * 124
//
// Anywhere on the map is a valid destination, not just the labelled places.
// The labels are there because a name is faster to find than a shape.
//
// ctx APIs: ctx.ui (panel/toast), ctx.travelTo, ctx.playerPosition

import { registerSystem } from '../core/registry.js';

const MAP_SRC = `${import.meta.env?.BASE_URL ?? '/'}map/harita.png`;
// The 67VERSE skate lobby is its own deployment, so this is its live address
// rather than the local one it is developed against: the map ships to phones.
const LOBBY_URL = 'https://67verse.67gamehub.workers.dev/skate';
const MAP_SPAN = 124;

// Measured places, each on ground you can actually stand on — the marina's pin
// sits on its promenade rather than out on a pier, and the beach's on sand
// rather than in the bay.
export const HARITA_YERLERI = Object.freeze([
  // Pinned north of the plaza's true centre so the LOBBY button, which sits
  // dead centre, does not cover its own label.
  Object.freeze({ id: 'plaza', name: '67 Plaza', x: -2, z: -11 }),
  Object.freeze({ id: 'skatepark', name: 'Skatepark', x: 0.6, z: -34.8 }),
  Object.freeze({ id: 'marina', name: 'Marina', x: 41.5, z: -38.6 }),
  Object.freeze({ id: 'funfair', name: 'Funfair', x: 30, z: -44 }),
  Object.freeze({ id: 'beach', name: 'Beach', x: 50, z: -10 }),
  Object.freeze({ id: 'stadium', name: 'Stadium', x: 29.7, z: 0.3 }),
  Object.freeze({ id: 'court', name: 'Basketball court', x: -36, z: 0 }),
  Object.freeze({ id: 'athletics', name: 'Athletics track', x: -36, z: -30 }),
  Object.freeze({ id: 'market', name: 'Market square', x: -2, z: 31 }),
  Object.freeze({ id: 'playground', name: 'Playground', x: 32, z: 32 }),
]);

// Both directions of the same projection, exported so the panel and its tests
// agree on one conversion rather than each carrying its own copy.
export function haritaToWorld(px, py, size) {
  return {
    x: (px / size - 0.5) * MAP_SPAN,
    z: (py / size - 0.5) * MAP_SPAN,
  };
}

export function worldToHarita(x, z) {
  return {
    left: `${(x / MAP_SPAN + 0.5) * 100}%`,
    top: `${(z / MAP_SPAN + 0.5) * 100}%`,
  };
}

function styled(element, styles) {
  Object.assign(element.style, styles);
  return element;
}

function marker(place, onPick) {
  const pin = document.createElement('button');
  pin.type = 'button';
  pin.dataset.placeId = place.id;
  pin.title = place.name;
  pin.setAttribute('aria-label', `Travel to ${place.name}`);
  const at = worldToHarita(place.x, place.z);
  styled(pin, {
    position: 'absolute',
    left: at.left,
    top: at.top,
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 9px 4px 5px',
    borderRadius: '999px',
    border: '1px solid rgba(28,28,32,0.14)',
    background: 'rgba(255,255,255,0.9)',
    color: '#1c1c20',
    font: '600 11px/1 Figtree, system-ui, sans-serif',
    letterSpacing: '0.01em',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    boxShadow: '0 1px 4px rgba(20,16,24,0.18)',
  });
  const dot = styled(document.createElement('span'), {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#d8604f',
    flex: '0 0 auto',
  });
  const label = document.createElement('span');
  label.textContent = place.name;
  pin.append(dot, label);
  pin.addEventListener('click', (event) => {
    event.stopPropagation();
    onPick(place.x, place.z, place.name);
  });
  return pin;
}

function openMap(ctx) {
  const panel = ctx.ui.panel({ title: '67 Park map' });
  const intro = document.createElement('p');
  intro.className = 'uv-play-intro';
  intro.textContent = 'Tap anywhere on the map to travel there. LOBBY leaves 67 Park for the 67VERSE skate lobby.';

  const frame = styled(document.createElement('div'), {
    position: 'relative',
    width: 'min(70vh, 100%)',
    aspectRatio: '1 / 1',
    margin: '0 auto',
    borderRadius: '14px',
    overflow: 'hidden',
    border: '1px solid rgba(28,28,32,0.12)',
    background: '#e9e3df',
    cursor: 'crosshair',
    touchAction: 'manipulation',
  });

  const image = document.createElement('img');
  image.src = MAP_SRC;
  image.alt = 'Bird’s-eye map of 67 Park';
  image.draggable = false;
  styled(image, { width: '100%', height: '100%', display: 'block', userSelect: 'none' });

  // Where the player is standing right now, so the map answers "where am I"
  // as well as "take me there".
  const here = styled(document.createElement('span'), {
    position: 'absolute',
    width: '13px',
    height: '13px',
    borderRadius: '50%',
    border: '2px solid #ffffff',
    background: '#2f6fd0',
    transform: 'translate(-50%, -50%)',
    boxShadow: '0 1px 4px rgba(20,16,24,0.35)',
    pointerEvents: 'none',
  });
  const at = ctx.playerPosition?.();
  if (at) Object.assign(here.style, worldToHarita(at.x, at.z));
  else here.hidden = true;

  const travel = (x, z, name) => {
    const moved = ctx.travelTo?.({ x, z, label: name });
    if (moved !== false) panel.close();
  };

  frame.addEventListener('click', (event) => {
    const box = frame.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const spot = haritaToWorld(event.clientX - box.left, event.clientY - box.top, box.width);
    travel(spot.x, spot.z, null);
  });

  // The 67VERSE lobby, in the middle of the map. It is a different park on a
  // different server, so this leaves 67 Park rather than teleporting inside
  // it — the deployed address, not a local one, so it works from a phone too.
  const lobby = document.createElement('button');
  lobby.type = 'button';
  lobby.textContent = 'SKATE LOBBY';
  lobby.setAttribute('aria-label', 'Open the 67VERSE skate lobby');
  styled(lobby, {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    padding: '13px 24px',
    borderRadius: '999px',
    border: '2px solid rgba(255,255,255,0.75)',
    background: '#1c1c20',
    color: '#ffffff',
    font: '800 14px/1 Figtree, system-ui, sans-serif',
    letterSpacing: '0.09em',
    cursor: 'pointer',
    boxShadow: '0 2px 10px rgba(20,16,24,0.35)',
  });
  lobby.addEventListener('click', (event) => {
    event.stopPropagation();
    window.location.assign(LOBBY_URL);
  });

  frame.append(image, here);
  for (const place of HARITA_YERLERI) frame.appendChild(marker(place, travel));
  frame.appendChild(lobby);
  panel.body.append(intro, frame);
}

registerSystem('harita', {
  open(ctx) {
    openMap(ctx);
  },
});
