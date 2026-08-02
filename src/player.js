// player.js — 67VERSE player simulation.
//
// SERVER-AUTHORITATIVE DESIGN NOTE:
// This sim operates ONLY on a plain, serializable state object
//   { pos:{x,y,z}, vel:{x,y,z}, yaw, grounded, grabCooldown }
// plus an injected `env` interface (sampleGround / bounds). It is fully
// deterministic given (state, input, dt). When multiplayer lands, an
// authoritative server (Cloudflare Durable Object) can own this exact step
// function while clients run it locally for prediction + reconciliation.

export const TUNING = {
  maxSpeed: 6.0,      // units/s horizontal run speed
  accel: 34.0,        // units/s^2 toward desired velocity
  decel: 42.0,        // units/s^2 when no input (friction)
  gravity: -16.0,     // units/s^2
  jumpImpulse: 4.5,   // units/s vertical impulse
  stepUp: 0.55,       // max ledge height walkable without jumping
  radius: 0.35,       // collision radius vs obstacle AABBs
  turnRate: 12.0,     // yaw spring rate toward movement heading
  coyoteTime: 0.1,    // grace window after walking off an edge
  jumpBufferTime: 0.12, // remember a jump press just before landing
  grabCooldownTime: 0.6,
};

export function createPlayerState(x = 0, z = 10) {
  return {
    pos: { x, y: 0, z },
    vel: { x: 0, y: 0, z: 0 },
    yaw: Math.PI,        // face -z (toward park center from spawn)
    grounded: true,
    grabCooldown: 0,
    grabEvent: false,    // true for exactly one tick when grab fires
    jumpEvent: false,    // true for exactly one tick when leaving ground
    coyoteTime: TUNING.coyoteTime,
    jumpBufferTime: 0,
    jumpHeldLast: false,
  };
}

// Shortest-arc angle interpolation.
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

// Push a circle (state.pos, radius) out of a 2D AABB inflated by radius.
// Returns true if a push happened.
function pushOutOfBox(s, box) {
  const r = TUNING.radius;
  const minX = box.minX - r, maxX = box.maxX + r;
  const minZ = box.minZ - r, maxZ = box.maxZ + r;
  const { x, z } = s.pos;
  if (x <= minX || x >= maxX || z <= minZ || z >= maxZ) return false;
  // Smallest-penetration axis wins.
  const dxMin = x - minX, dxMax = maxX - x;
  const dzMin = z - minZ, dzMax = maxZ - z;
  const m = Math.min(dxMin, dxMax, dzMin, dzMax);
  if (m === dxMin) { s.pos.x = minX; if (s.vel.x > 0) s.vel.x = 0; }
  else if (m === dxMax) { s.pos.x = maxX; if (s.vel.x < 0) s.vel.x = 0; }
  else if (m === dzMin) { s.pos.z = minZ; if (s.vel.z > 0) s.vel.z = 0; }
  else { s.pos.z = maxZ; if (s.vel.z < 0) s.vel.z = 0; }
  return true;
}

/**
 * Advance the player by one fixed step.
 * input: { dirX, dirZ, moving, jumpHeld, grabPressed }  (dir is world-space, normalized)
 * env:   { sampleGround(x, z, fromY) -> { y, box2|null }, bounds }
 */
export function stepPlayer(s, input, dt, env) {
  s.grabEvent = false;
  s.jumpEvent = false;
  s.coyoteTime = Number.isFinite(s.coyoteTime) ? s.coyoteTime : 0;
  s.jumpBufferTime = Number.isFinite(s.jumpBufferTime) ? s.jumpBufferTime : 0;
  s.jumpHeldLast = Boolean(s.jumpHeldLast);
  const jumpPressed = Boolean(input.jumpHeld) && !s.jumpHeldLast;
  s.jumpHeldLast = Boolean(input.jumpHeld);
  if (jumpPressed) s.jumpBufferTime = TUNING.jumpBufferTime;
  else s.jumpBufferTime = Math.max(0, s.jumpBufferTime - dt);
  if (s.grounded) s.coyoteTime = TUNING.coyoteTime;
  else s.coyoteTime = Math.max(0, s.coyoteTime - dt);

  // --- Horizontal acceleration toward desired velocity ---
  const wantX = input.moving ? input.dirX * TUNING.maxSpeed : 0;
  const wantZ = input.moving ? input.dirZ * TUNING.maxSpeed : 0;
  const rate = input.moving ? TUNING.accel : TUNING.decel;
  const blend = Math.min(1, rate * dt / TUNING.maxSpeed);
  s.vel.x += (wantX - s.vel.x) * blend;
  s.vel.z += (wantZ - s.vel.z) * blend;

  // --- Jump + gravity ---
  if (s.jumpBufferTime > 0 && (s.grounded || s.coyoteTime > 0)) {
    s.vel.y = TUNING.jumpImpulse;
    s.grounded = false;
    s.coyoteTime = 0;
    s.jumpBufferTime = 0;
    s.jumpEvent = true;
  }
  s.vel.y += TUNING.gravity * dt;

  // --- Integrate ---
  s.pos.x += s.vel.x * dt;
  s.pos.y += s.vel.y * dt;
  s.pos.z += s.vel.z * dt;

  // --- Plaza bounds ---
  // Hub world exposes `boundsCircle`: the island is round, so the reachable
  // area is a disc — a square clamp would let players walk past the rounded
  // rim at the corners and stand on open sky. Square-bound worlds (UGC
  // editor plots) keep the legacy box clamp.
  if (env.boundsCircle) {
    const rim = Math.hypot(s.pos.x, s.pos.z);
    if (rim > env.bounds) {
      const scale = env.bounds / rim;
      s.pos.x *= scale;
      s.pos.z *= scale;
    }
  } else {
    s.pos.x = Math.max(-env.bounds, Math.min(env.bounds, s.pos.x));
    s.pos.z = Math.max(-env.bounds, Math.min(env.bounds, s.pos.z));
  }

  // --- Ground / wall resolution ---
  // Raycast down from above the head: walkable surfaces within stepUp are
  // ground; a hit far above means we're inside a wall -> push out of its AABB.
  let g = env.sampleGround(s.pos.x, s.pos.z, s.pos.y + 3.0);
  if (g.y - s.pos.y > TUNING.stepUp && g.box2) {
    if (pushOutOfBox(s, g.box2)) {
      g = env.sampleGround(s.pos.x, s.pos.z, s.pos.y + 3.0);
      if (g.y - s.pos.y > TUNING.stepUp) g = { y: 0, box2: null };
    } else {
      g = { y: 0, box2: null }; // adjacent but outside: plain plaza ground
    }
  }

  // Land / stick to ground. The 0.3 snap margin keeps downhill ramp walking
  // glued instead of micro-bouncing every tick.
  if (s.vel.y <= 0 && s.pos.y <= g.y + 0.3) {
    if (!s.grounded && s.vel.y < -3) { /* (landing feedback hook for later) */ }
    s.pos.y = g.y;
    s.vel.y = 0;
    s.grounded = true;
  } else {
    s.grounded = false;
  }

  // A buffered press made shortly before landing fires on the landing tick.
  if (s.grounded && s.jumpBufferTime > 0) {
    s.vel.y = TUNING.jumpImpulse;
    s.grounded = false;
    s.coyoteTime = 0;
    s.jumpBufferTime = 0;
    s.jumpEvent = true;
  }

  // --- Face movement direction smoothly ---
  if (input.moving) {
    const heading = Math.atan2(input.dirX, input.dirZ);
    s.yaw = angleLerp(s.yaw, heading, TUNING.turnRate * dt);
  }

  // --- Grab / Push (stub: event only, interaction arrives with multiplayer) ---
  s.grabCooldown = Math.max(0, s.grabCooldown - dt);
  if (input.grabPressed && s.grabCooldown <= 0) {
    s.grabCooldown = TUNING.grabCooldownTime;
    s.grabEvent = true;
  }
}
