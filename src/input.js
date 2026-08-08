// input.js — unified input: keyboard (e.code), touch stick + buttons, gamepad.
// Produces one normalized frame input consumed by the player sim.

const STICK_RADIUS = 48; // px of knob travel for full deflection

export function cameraRelativeDirection(frameInput, cameraYaw) {
  const forwardX = Math.sin(cameraYaw);
  const forwardZ = Math.cos(cameraYaw);
  const rightX = -forwardZ;
  const rightZ = forwardX;
  let x = forwardX * -frameInput.my + rightX * frameInput.mx;
  let z = forwardZ * -frameInput.my + rightZ * frameInput.mx;
  const length = Math.hypot(x, z);
  if (length > 1e-4) {
    const divisor = Math.max(1, length);
    x /= divisor;
    z /= divisor;
  }
  return { x, z, moving: frameInput.moving && length > 1e-4 };
}

export function createInput() {
  const keys = new Set();
  const isTouchDevice =
    'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // ----- Keyboard (physical key codes, layout-independent) -----
  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));

  // ----- Touch: floating left-half stick + DOM buttons -----
  const stick = { active: false, id: null, sx: 0, sy: 0, dx: 0, dy: 0 };
  const stickBase = document.getElementById('stick-base');
  const stickKnob = document.getElementById('stick-knob');
  const btnJump = document.getElementById('btn-jump');
  const btnGrab = document.getElementById('btn-grab');
  let touchJump = false;
  let touchGrab = false;
  let touchSprint = false;
  const look = {
    active: false,
    id: null,
    x: 0,
    y: 0,
    yaw: 0,
    pitch: 0,
    moved: false,
  };

  function isUiTarget(target) {
    return Boolean(target?.closest?.(
      '.tbtn,button,input,textarea,select,.uv-panel,.uvchat-dock,.uv-hudbar,#hub-actions',
    ));
  }

  function inputIsBlocked() {
    return document.body.classList.contains('entry-open')
      || document.body.classList.contains('modal-open')
      || document.body.classList.contains('show67-overlay-open');
  }

  if (isTouchDevice) {
    document.body.classList.add('touch');
    document.getElementById('hint').textContent = 'Stick to move · drag right side to look · JUMP · GRAB';
  }

  function stickStart(e) {
    if (e.pointerType !== 'touch' || stick.active) return;
    if (inputIsBlocked()) return;
    if (
      isUiTarget(e.target)
    ) return;
    if (e.clientX > window.innerWidth * 0.55) return; // left zone only
    stick.active = true;
    stick.id = e.pointerId;
    stick.sx = e.clientX; stick.sy = e.clientY;
    stick.dx = 0; stick.dy = 0;
    stickBase.style.display = 'block';
    stickBase.style.left = e.clientX + 'px';
    stickBase.style.top = e.clientY + 'px';
  }
  function stickMove(e) {
    if (!stick.active || e.pointerId !== stick.id) return;
    let dx = e.clientX - stick.sx;
    let dy = e.clientY - stick.sy;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) { dx = dx / len * STICK_RADIUS; dy = dy / len * STICK_RADIUS; }
    stick.dx = dx; stick.dy = dy;
    stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
  function stickEnd(e) {
    if (!stick.active || e.pointerId !== stick.id) return;
    stick.active = false; stick.id = null;
    stick.dx = 0; stick.dy = 0;
    stickBase.style.display = 'none';
    stickKnob.style.transform = 'translate(-50%, -50%)';
  }
  window.addEventListener('pointerdown', stickStart);
  window.addEventListener('pointermove', stickMove);
  window.addEventListener('pointerup', stickEnd);
  window.addEventListener('pointercancel', stickEnd);

  // ----- Camera look: primary-button drag on desktop, right-side drag on touch -----
  function lookStart(e) {
    if (look.active || isUiTarget(e.target)) return;
    if (inputIsBlocked()) return;
    const isTouchLook = e.pointerType === 'touch' && e.clientX > window.innerWidth * 0.55;
    const isMouseLook = e.pointerType === 'mouse' && e.button === 0;
    if (!isTouchLook && !isMouseLook) return;
    look.active = true;
    look.id = e.pointerId;
    look.x = e.clientX;
    look.y = e.clientY;
    look.moved = false;
  }
  function lookMove(e) {
    if (!look.active || e.pointerId !== look.id) return;
    const dx = e.clientX - look.x;
    const dy = e.clientY - look.y;
    look.x = e.clientX;
    look.y = e.clientY;
    if (Math.abs(dx) + Math.abs(dy) < 0.1) return;
    const sensitivity = e.pointerType === 'touch' ? 0.0065 : 0.005;
    look.yaw -= dx * sensitivity;
    look.pitch -= dy * sensitivity * 0.75;
    look.moved = true;
    if (e.cancelable) e.preventDefault();
  }
  function lookEnd(e) {
    if (!look.active || e.pointerId !== look.id) return;
    look.active = false;
    look.id = null;
  }
  window.addEventListener('pointerdown', lookStart);
  window.addEventListener('pointermove', lookMove, { passive: false });
  window.addEventListener('pointerup', lookEnd);
  window.addEventListener('pointercancel', lookEnd);

  function bindButton(el, set, unset) {
    el.addEventListener('pointerdown', (e) => {
      if (inputIsBlocked()) return;
      e.preventDefault();
      el.classList.add('held');
      set();
    });
    const off = () => { el.classList.remove('held'); unset(); };
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  }
  bindButton(btnJump, () => { touchJump = true; }, () => { touchJump = false; });
  bindButton(btnGrab, () => { touchGrab = true; }, () => { touchGrab = false; });
  // FAST is a latch, not a hold: holding it fought the camera-look thumb and
  // read as "the button does nothing". One tap locks the run and lights the
  // button; the next tap releases it.
  const sprintButton = document.getElementById('btn-sprint');
  sprintButton.addEventListener('pointerdown', (e) => {
    if (inputIsBlocked()) return;
    e.preventDefault();
    touchSprint = !touchSprint;
    sprintButton.classList.toggle('on', touchSprint);
  });

  // ----- Frame polling -----
  let prevGrab = false;
  let prevPadGrab = false;

  function resetTransient() {
    keys.clear();
    stick.active = false;
    stick.id = null;
    stick.dx = 0;
    stick.dy = 0;
    stickBase.style.display = 'none';
    stickKnob.style.transform = 'translate(-50%, -50%)';
    look.active = false;
    look.id = null;
    look.yaw = 0;
    look.pitch = 0;
    look.moved = false;
    touchJump = false;
    touchGrab = false;
    prevGrab = false;
    prevPadGrab = false;
    btnJump.classList.remove('held');
    btnGrab.classList.remove('held');
  }

  window.addEventListener('blur', resetTransient);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) resetTransient();
  });

  function poll() {
    // Keyboard move (x: right+, y: down+ on screen)
    let mx = 0, my = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;

    // Touch stick
    if (stick.active) {
      mx += stick.dx / STICK_RADIUS;
      my += stick.dy / STICK_RADIUS;
    }

    let jumpHeld = keys.has('Space') || touchJump;
    let grabNow = keys.has('KeyE') || keys.has('ShiftLeft') || touchGrab;
    // Sprint: right Shift on keyboard, or the touch stick shoved to its rim
    // (left Shift stays grab — it predates sprint).
    let sprintHeld = keys.has('ShiftRight') || touchSprint ||
      (stick.active && Math.hypot(stick.dx, stick.dy) / STICK_RADIUS > 0.92);

    let lookYaw = look.yaw;
    let lookPitch = look.pitch;
    let looking = look.active || look.moved;
    look.yaw = 0;
    look.pitch = 0;
    look.moved = false;

    // Gamepad: left stick move, right stick look, A(0) jump, B(1)/RT(7) grab
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const ax = pad.axes[0] || 0;
      const ay = pad.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.18) { mx += ax; my += ay; }
      const rx = pad.axes[2] || 0;
      const ry = pad.axes[3] || 0;
      if (Math.hypot(rx, ry) > 0.2) {
        lookYaw -= rx * 0.045;
        lookPitch -= ry * 0.032;
        looking = true;
      }
      if (pad.buttons[0] && pad.buttons[0].pressed) jumpHeld = true;
      if (pad.buttons[5] && pad.buttons[5].pressed) sprintHeld = true;   // RB = sprint
      const padGrab =
        (pad.buttons[1] && pad.buttons[1].pressed) ||
        (pad.buttons[7] && pad.buttons[7].pressed);
      if (padGrab && !prevPadGrab) grabNow = true;
      prevPadGrab = padGrab;
      break; // first connected pad only
    }

    // Clamp magnitude (diagonal / mixed sources)
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }

    const grabPressed = grabNow && !prevGrab;
    prevGrab = grabNow;

    return {
      mx, my,
      moving: len > 0.12,
      jumpHeld,
      sprintHeld,
      grabPressed,
      lookYaw,
      lookPitch,
      looking,
    };
  }

  return { poll, resetTransient, isTouchDevice };
}
