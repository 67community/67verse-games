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
  scene,
  THREE,
  view,
}) {
  // The map-audit camera: while set, the main loop renders this view instead
  // of the player camera, which is how QA takes the bird's-eye shots that
  // match Oscar's reference layouts. Fog is parked while it is on — from
  // audit height the whole town would otherwise wash into the haze.
  let auditCamera = null;
  let parkedFog = null;
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
    // ---------- Map audit ----------
    // Named world nodes with their ground footprints, for numeric overlap
    // checks — auditing intersections beats eyeballing them.
    sceneBoxes(maxDepth = 3) {
      if (!scene || !THREE) return [];
      const out = [];
      const box = new THREE.Box3();
      const walk = (node, depth, trail) => {
        if (depth > maxDepth) return;
        for (const child of node.children) {
          const name = child.name || '';
          const label = trail ? `${trail}/${name || child.type}` : (name || child.type);
          if (name) {
            box.setFromObject(child);
            if (Number.isFinite(box.min.x) && !box.isEmpty()) {
              out.push({
                name: label,
                min: [+box.min.x.toFixed(2), +box.min.y.toFixed(2), +box.min.z.toFixed(2)],
                max: [+box.max.x.toFixed(2), +box.max.y.toFixed(2), +box.max.z.toFixed(2)],
              });
            }
          }
          walk(child, depth + 1, label);
        }
      };
      walk(scene, 0, '');
      return out;
    },
    // Straight-down raycast at world (x,z): names every mesh under that spot,
    // with instanceId for instanced meshes — definitive identity for any
    // object seen in a bird's-eye shot.
    pick(x, z, fromY = 60) {
      if (!scene || !THREE) return [];
      const ray = new THREE.Raycaster(
        new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0), 0, fromY + 10,
      );
      return ray.intersectObjects(scene.children, true).slice(0, 12).map((hit) => {
        const chain = [];
        for (let node = hit.object; node && chain.length < 6; node = node.parent) {
          if (node.name) chain.unshift(node.name);
        }
        return {
          name: chain.join('/') || hit.object.type,
          y: +hit.point.y.toFixed(2),
          instanceId: hit.instanceId ?? null,
        };
      });
    },
    // Bird's-eye camera override: the main loop renders it while set.
    birdseye(x = 0, z = 0, height = 95, look = null) {
      if (!scene || !THREE || !view) return false;
      if (scene.fog && !parkedFog) { parkedFog = scene.fog; scene.fog = null; }
      auditCamera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 600);
      auditCamera.position.set(x, height, z + 0.01);
      const target = look || [x, 0, z];
      auditCamera.lookAt(target[0], target[1], target[2]);
      view.current = { scene, camera: auditCamera };
      return true;
    },
    birdseyeOff() {
      if (view && auditCamera && view.current?.camera === auditCamera) view.current = null;
      if (parkedFog) { scene.fog = parkedFog; parkedFog = null; }
      auditCamera = null;
      return true;
    },
  });
}
