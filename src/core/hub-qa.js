// Deferred integration-only surface. Production players never request this
// chunk; browser QA loads it with ?qa=1 and waits for __67VERSE_QA__.
export function installHubQa({
  camera,
  camOrbit,
  camTarget,
  camLook,
  sim,
  getCharacter,
  hubActivities,
  world,
  bus,
}) {
  window.__67VERSE_QA__ = Object.freeze({
    camera() {
      return {
        yaw: camOrbit.yaw,
        pitch: camOrbit.pitch,
        position: camera.position.toArray(),
        desiredPosition: camTarget.toArray(),
        focus: camLook.toArray(),
        desiredDistance: camTarget.distanceTo(camLook),
        resolvedDistance: camera.position.distanceTo(camLook),
      };
    },
    animation() {
      const character = getCharacter();
      return {
        characterId: character?.id || null,
        taggedJointCount: character?.animator.taggedJointCount || 0,
        locomotionState: character?.animator.locomotionState || 'loading',
        action: character?.animator.currentAction || null,
        contact: character?.animator.contact || null,
        pose: character?.animator.pose || null,
      };
    },
    emote(id = 'wave') {
      return Boolean(getCharacter()?.animator.play(id));
    },
    orient(yaw, pitch = camOrbit.pitch) {
      if (![yaw, pitch].every(Number.isFinite)) return false;
      camOrbit.yaw = yaw;
      camOrbit.pitch = Math.max(-0.08, Math.min(0.82, pitch));
      sim.yaw = yaw;
      return true;
    },
    player() {
      return {
        x: sim.pos.x,
        y: sim.pos.y,
        z: sim.pos.z,
        grounded: sim.grounded,
      };
    },
    activity() {
      return hubActivities.snapshot();
    },
    onboarding() {
      const onboarding = world.onboarding;
      return onboarding ? {
        active: onboarding.active,
        stage: onboarding.stage,
        prompt: onboarding.prompt,
      } : null;
    },
    composition() {
      return world.skyparkComposition || null;
    },
    startOnboarding() {
      const onboarding = world.onboarding;
      if (!onboarding) return false;
      onboarding.start();
      return onboarding.active;
    },
    startActivity(id) {
      return Boolean(hubActivities.start(id));
    },
    chatMessage(from, text) {
      if (
        typeof from !== 'string'
        || typeof text !== 'string'
        || from.length < 1
        || from.length > 64
        || text.length < 1
        || text.length > 120
      ) return false;
      bus.emit('chat-message', { from, text });
      return true;
    },
    teleport(x, z, y = 0) {
      if (![x, y, z].every(Number.isFinite)) return false;
      sim.pos.x = x;
      sim.pos.y = y;
      sim.pos.z = z;
      sim.vel.x = 0;
      sim.vel.y = 0;
      sim.vel.z = 0;
      sim.grounded = true;
      return true;
    },
  });
}
