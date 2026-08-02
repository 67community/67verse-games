const TWO_PI = Math.PI * 2;

function shortestAngle(a, b) {
  let delta = (b - a) % TWO_PI;
  if (delta > Math.PI) delta -= TWO_PI;
  if (delta < -Math.PI) delta += TWO_PI;
  return delta;
}

export function createOrbitState(yaw = Math.PI) {
  return { yaw, pitch: 0, manualHold: 0 };
}

export function updateOrbitState(state, frameInput, dt, {
  autoYaw = null,
  autoRate = 2,
  manualHold = 1.35,
  minPitch = -0.28,
  maxPitch = 0.52,
} = {}) {
  const yawDelta = Number.isFinite(frameInput?.lookYaw) ? frameInput.lookYaw : 0;
  const pitchDelta = Number.isFinite(frameInput?.lookPitch) ? frameInput.lookPitch : 0;
  if (frameInput?.looking || Math.abs(yawDelta) + Math.abs(pitchDelta) > 1e-5) {
    state.manualHold = manualHold;
  } else {
    state.manualHold = Math.max(0, state.manualHold - dt);
  }
  state.yaw += yawDelta;
  state.pitch = Math.max(minPitch, Math.min(maxPitch, state.pitch + pitchDelta));
  if (state.manualHold <= 0 && Number.isFinite(autoYaw)) {
    state.yaw += shortestAngle(state.yaw, autoYaw) * Math.min(1, autoRate * dt);
  }
  return state;
}

export function orbitCameraPosition(out, focus, state, horizontalDistance, baseHeight) {
  const distanceScale = Math.cos(state.pitch * 0.55);
  const distance = horizontalDistance * distanceScale;
  out.set(
    focus.x - Math.sin(state.yaw) * distance,
    focus.y + baseHeight + state.pitch * horizontalDistance * 0.72,
    focus.z - Math.cos(state.yaw) * distance,
  );
  return out;
}

export function resolveCameraObstruction(
  raycaster,
  focus,
  desired,
  colliders,
  out,
  { padding = 0.28, minDistance = 1.25 } = {},
) {
  out.copy(desired);
  if (!raycaster || !colliders?.length) return out;
  const dx = desired.x - focus.x;
  const dy = desired.y - focus.y;
  const dz = desired.z - focus.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance <= minDistance) return out;
  raycaster.ray.origin.copy(focus);
  raycaster.ray.direction.set(dx / distance, dy / distance, dz / distance);
  raycaster.near = 0.08;
  raycaster.far = distance;
  const hit = raycaster.intersectObjects(colliders, true).find(({ object }) => (
    object.visible
    && !object.userData?.cameraIgnore
    && object.material?.visible !== false
  ));
  if (!hit) return out;
  const safeDistance = Math.max(minDistance, hit.distance - padding);
  out.copy(focus).addScaledVector(raycaster.ray.direction, safeDistance);
  return out;
}
