// player-visuals.js - presentation-only character motion.
//
// Gameplay remains deterministic and serializable in player.js. This module
// turns that state into a readable articulated pose and can later be replaced
// by authored AnimationMixer clips without changing the simulation contract.

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const damp = (current, target, response, dt) => (
  current + (target - current) * (1 - Math.exp(-response * dt))
);

export const LOCOMOTION_STATES = Object.freeze([
  'idle',
  'walk',
  'run',
  'jump',
  'fall',
  'land',
  'turn',
  'emote',
]);

export function classifyLocomotionState({
  speed = 0,
  grounded = true,
  verticalSpeed = 0,
  turnAmount = 0,
  action = null,
  maxSpeed = 6,
} = {}) {
  if (action && ['wave', 'groove', 'celebrate', 'spin', 'hop'].includes(action)) {
    return 'emote';
  }
  if (action === 'land') return 'land';
  if (!grounded) return verticalSpeed >= -0.15 ? 'jump' : 'fall';
  const ratio = clamp01(speed / Math.max(0.001, maxSpeed));
  if (ratio < 0.08 && Math.abs(turnAmount) > 0.35) return 'turn';
  if (ratio < 0.08) return 'idle';
  return ratio < 0.62 ? 'walk' : 'run';
}

function captureTaggedNodes(root) {
  const nodes = new Map();
  root.traverse((node) => {
    const role = node.userData?.walkRole;
    if (!role) return;
    nodes.set(role, {
      node,
      position: node.position.clone(),
      rotation: node.rotation.clone(),
      scale: node.scale.clone(),
    });
  });
  return nodes;
}

function restoreTaggedNodes(nodes) {
  for (const { node, position, rotation, scale } of nodes.values()) {
    node.position.copy(position);
    node.rotation.copy(rotation);
    node.scale.copy(scale);
  }
}

function addRotation(nodes, role, x = 0, y = 0, z = 0) {
  const entry = nodes.get(role);
  if (!entry) return;
  entry.node.rotation.x += x;
  entry.node.rotation.y += y;
  entry.node.rotation.z += z;
}

function addPosition(nodes, role, x = 0, y = 0, z = 0) {
  const entry = nodes.get(role);
  if (!entry) return;
  entry.node.position.x += x;
  entry.node.position.y += y;
  entry.node.position.z += z;
}

function taggedPose(nodes, role) {
  const entry = nodes.get(role);
  if (!entry) return null;
  return Object.freeze({
    rotation: Object.freeze({
      x: entry.node.rotation.x,
      y: entry.node.rotation.y,
      z: entry.node.rotation.z,
    }),
    position: Object.freeze({
      x: entry.node.position.x,
      y: entry.node.position.y,
      z: entry.node.position.z,
    }),
  });
}

/**
 * Procedural gait for articulated QA characters and a restrained compatibility
 * fallback for future imported rigs. Tagged joints receive real limb motion;
 * an untagged mesh only receives a small root response and cannot masquerade
 * as production-ready animation.
 */
export function createWalkAnimator(root, { maxSpeed = 6 } = {}) {
  const nodes = captureTaggedNodes(root);
  const rootPosition = root.position.clone();
  const rootRotation = root.rotation.clone();
  const rootScale = root.scale.clone();
  let phase = 0;
  let locomotionWeight = 0;
  let groundedWeight = 1;
  let lastState = 'idle';
  let lastHalfStep = 0;
  let contactSerial = 0;
  let contactFoot = 'right';
  let lastPose = Object.freeze({
    state: 'idle',
    phase: 0,
    speedRatio: 0,
    locomotionWeight: 0,
    stride: 0,
    joints: Object.freeze({}),
  });

  return {
    update(dt, {
      speed = 0,
      grounded = true,
      verticalSpeed = 0,
      turnAmount = 0,
      scaleMultiplier = 1,
      action = null,
    } = {}) {
      const speedRatio = clamp01(speed / Math.max(0.001, maxSpeed));
      const targetWeight = grounded ? speedRatio : Math.max(0.18, speedRatio * 0.45);
      locomotionWeight = damp(locomotionWeight, targetWeight, 13, dt);
      groundedWeight = damp(groundedWeight, grounded ? 1 : 0, 16, dt);
      const cadence = 3.2 + speedRatio * 7.2;
      phase += dt * cadence;
      const halfStep = Math.floor(phase / Math.PI);
      if (grounded && speedRatio > 0.18 && halfStep !== lastHalfStep) {
        contactSerial++;
        contactFoot = halfStep % 2 === 0 ? 'right' : 'left';
      }
      lastHalfStep = halfStep;

      restoreTaggedNodes(nodes);
      root.position.copy(rootPosition);
      root.rotation.copy(rootRotation);
      root.scale.copy(rootScale).multiplyScalar(scaleMultiplier);

      lastState = classifyLocomotionState({
        speed,
        grounded,
        verticalSpeed,
        turnAmount,
        action,
        maxSpeed,
      });

      const strideWave = Math.sin(phase);
      const contactWave = Math.abs(Math.cos(phase));
      const stride = strideWave * locomotionWeight;
      const liftLeft = Math.max(0, Math.sin(phase)) * locomotionWeight;
      const liftRight = Math.max(0, -Math.sin(phase)) * locomotionWeight;
      const turn = Math.max(-1, Math.min(1, turnAmount * 0.16));

      if (groundedWeight > 0.01) {
        const idleBreath = (1 - speedRatio) * Math.sin(phase * 0.36);
        root.position.y += idleBreath * 0.012 + contactWave * locomotionWeight * 0.035;
        root.rotation.x -= speedRatio * 0.09;
        root.rotation.z += strideWave * locomotionWeight * 0.018;

        // The primary X swing provides the gait in profile. A restrained
        // secondary Z swing and lift keeps the alternating silhouette legible
        // from the default rear chase camera instead of collapsing into a
        // depth-only motion that reads as gliding.
        addRotation(nodes, 'leg-l', stride * 0.88, 0, -turn * 0.08 - liftLeft * 0.07);
        addRotation(nodes, 'leg-r', -stride * 0.88, 0, -turn * 0.08 + liftRight * 0.07);
        addPosition(nodes, 'leg-l', -liftLeft * 0.018, liftLeft * 0.035, 0);
        addPosition(nodes, 'leg-r', liftRight * 0.018, liftRight * 0.035, 0);
        addRotation(nodes, 'shin-l', -0.08 - liftLeft * 0.68);
        addRotation(nodes, 'shin-r', -0.08 - liftRight * 0.68);
        addRotation(nodes, 'foot-l', -stride * 0.2 + liftLeft * 0.35);
        addRotation(nodes, 'foot-r', stride * 0.2 + liftRight * 0.35);

        addRotation(nodes, 'arm-l', -stride * 0.74, 0, -0.05 + stride * 0.1);
        addRotation(nodes, 'arm-r', stride * 0.74, 0, 0.05 + stride * 0.1);
        addRotation(nodes, 'forearm-l', -0.18 - Math.max(0, -stride) * 0.28);
        addRotation(nodes, 'forearm-r', -0.18 - Math.max(0, stride) * 0.28);
        addRotation(nodes, 'torso', 0, -stride * 0.15 + turn * 0.18, stride * 0.018 + turn * 0.07);
        addRotation(nodes, 'head', 0, stride * 0.045 - turn * 0.12, -turn * 0.035);
        addPosition(nodes, 'head', 0, idleBreath * 0.008, 0);
      }

      if (!grounded) {
        const rising = verticalSpeed >= -0.15;
        const tuck = rising ? 0.42 : 0.24;
        root.rotation.x += rising ? -0.08 : 0.07;
        root.scale.y *= rising ? 1.035 : 0.985;
        root.scale.x *= rising ? 0.985 : 1.02;
        addRotation(nodes, 'leg-l', -0.28);
        addRotation(nodes, 'leg-r', 0.18);
        addRotation(nodes, 'shin-l', -tuck);
        addRotation(nodes, 'shin-r', -tuck * 0.85);
        addRotation(nodes, 'arm-l', rising ? -0.72 : -0.28, 0, -0.18);
        addRotation(nodes, 'arm-r', rising ? -0.72 : -0.28, 0, 0.18);
        addRotation(nodes, 'forearm-l', -0.4);
        addRotation(nodes, 'forearm-r', -0.4);
      }

      // Contact compression gives the stride visible weight on small screens.
      const compression = contactWave * locomotionWeight * groundedWeight * 0.025;
      root.scale.x *= 1 + compression;
      root.scale.z *= 1 + compression;
      root.scale.y *= 1 - compression * 1.4;

      const joints = {};
      for (const role of ['leg-l', 'leg-r', 'arm-l', 'arm-r', 'torso', 'head']) {
        const pose = taggedPose(nodes, role);
        if (pose) joints[role] = pose;
      }
      lastPose = Object.freeze({
        state: lastState,
        phase: ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2),
        speedRatio,
        locomotionWeight,
        stride,
        joints: Object.freeze(joints),
      });
    },
    reset() {
      root.position.copy(rootPosition);
      root.rotation.copy(rootRotation);
      root.scale.copy(rootScale);
      restoreTaggedNodes(nodes);
      phase = 0;
      locomotionWeight = 0;
      groundedWeight = 1;
      lastState = 'idle';
      lastHalfStep = 0;
      contactSerial = 0;
      contactFoot = 'right';
      lastPose = Object.freeze({
        state: 'idle',
        phase: 0,
        speedRatio: 0,
        locomotionWeight: 0,
        stride: 0,
        joints: Object.freeze({}),
      });
    },
    get state() { return lastState; },
    get pose() { return lastPose; },
    get taggedJointCount() { return nodes.size; },
    get contact() {
      return Object.freeze({ serial: contactSerial, foot: contactFoot });
    },
    nodes,
  };
}

const ACTIONS = Object.freeze({
  jump: { duration: 0.2, priority: 3 },
  land: { duration: 0.28, priority: 5 },
  impact: { duration: 0.34, priority: 6 },
  celebrate: { duration: 1.1, priority: 2 },
  hop: { duration: 0.6, priority: 2 },
  spin: { duration: 0.8, priority: 2 },
  wave: { duration: 1.15, priority: 2 },
  groove: { duration: 1.2, priority: 2 },
});

export function createCharacterAnimator(visual, options = {}) {
  const locomotion = createWalkAnimator(visual, options);
  const nodes = locomotion.nodes;
  let action = null;
  let elapsed = 0;
  let strength = 1;

  function start(name, details = {}) {
    const next = ACTIONS[name];
    if (!next) return false;
    const current = action && ACTIONS[action];
    if (current && elapsed < current.duration && next.priority < current.priority) return false;
    action = name;
    elapsed = 0;
    strength = clamp01(Number.isFinite(details.strength) ? details.strength : 1);
    return true;
  }

  return {
    update(dt, state = {}) {
      locomotion.update(dt, { ...state, action });
      if (!action) return;
      const definition = ACTIONS[action];
      elapsed += dt;
      const progress = clamp01(elapsed / definition.duration);
      const pulse = Math.sin(Math.PI * progress);

      if (action === 'jump' || action === 'hop') {
        visual.position.y += pulse * (action === 'hop' ? 0.12 : 0.045);
        visual.scale.x *= 1 - pulse * 0.045;
        visual.scale.z *= 1 - pulse * 0.045;
        visual.scale.y *= 1 + pulse * 0.075;
      } else if (action === 'land') {
        visual.position.y -= pulse * 0.08 * strength;
        visual.scale.x *= 1 + pulse * 0.09 * strength;
        visual.scale.z *= 1 + pulse * 0.09 * strength;
        visual.scale.y *= 1 - pulse * 0.13 * strength;
        addRotation(nodes, 'leg-l', -pulse * 0.34 * strength);
        addRotation(nodes, 'leg-r', -pulse * 0.34 * strength);
        addRotation(nodes, 'shin-l', -pulse * 0.5 * strength);
        addRotation(nodes, 'shin-r', -pulse * 0.5 * strength);
        addRotation(nodes, 'arm-l', pulse * 0.2 * strength);
        addRotation(nodes, 'arm-r', pulse * 0.2 * strength);
      } else if (action === 'impact') {
        visual.rotation.z += Math.sin(progress * Math.PI * 3) * (1 - progress) * 0.16 * strength;
        addRotation(nodes, 'arm-l', pulse * 0.55);
        addRotation(nodes, 'arm-r', pulse * 0.55);
      } else if (action === 'wave') {
        addRotation(nodes, 'arm-r', -1.95 * pulse, 0, 0.28 * pulse);
        addRotation(nodes, 'forearm-r', -0.55 - Math.sin(progress * Math.PI * 8) * 0.42 * pulse);
        addRotation(nodes, 'head', 0, -0.16 * pulse, -0.07 * pulse);
        addRotation(nodes, 'torso', 0, -0.12 * pulse, 0.04 * pulse);
      } else if (action === 'celebrate') {
        visual.position.y += Math.abs(Math.sin(progress * Math.PI * 2)) * 0.1;
        addRotation(nodes, 'arm-l', -2.05 * pulse, 0, -0.18);
        addRotation(nodes, 'arm-r', -2.05 * pulse, 0, 0.18);
      } else if (action === 'spin') {
        visual.rotation.y += progress * Math.PI * 2;
      } else if (action === 'groove') {
        visual.rotation.z += Math.sin(progress * Math.PI * 6) * 0.09;
        visual.position.y += pulse * 0.035;
        addRotation(nodes, 'arm-l', Math.sin(progress * Math.PI * 4) * 0.5);
        addRotation(nodes, 'arm-r', -Math.sin(progress * Math.PI * 4) * 0.5);
      }

      if (progress >= 1) action = null;
    },
    signal(name, details) { return start(name, details); },
    play(name, details) { return start(name, details); },
    reset() {
      action = null;
      elapsed = 0;
      locomotion.reset();
    },
    get currentAction() { return action; },
    get locomotionState() { return locomotion.state; },
    get pose() { return locomotion.pose; },
    get taggedJointCount() { return locomotion.taggedJointCount; },
    get contact() { return locomotion.contact; },
  };
}
