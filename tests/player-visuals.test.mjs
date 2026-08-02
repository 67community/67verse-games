import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  createCharacterAnimator,
  createWalkAnimator,
} from '../src/player-visuals.js';

function taggedJoint(role, x = 0, y = 0, z = 0) {
  const joint = new THREE.Group();
  joint.userData.walkRole = role;
  joint.position.set(x, y, z);
  return joint;
}

function articulatedFixture() {
  const root = new THREE.Group();
  const torso = taggedJoint('torso');
  const legLeft = taggedJoint('leg-l', -0.2, 0.78, 0);
  const legRight = taggedJoint('leg-r', 0.2, 0.78, 0);
  const armLeft = taggedJoint('arm-l', -0.43, 1.37, 0);
  const armRight = taggedJoint('arm-r', 0.43, 1.37, 0);
  armLeft.rotation.z = -0.12;
  armRight.rotation.z = 0.12;
  root.add(torso, legLeft, legRight, armLeft, armRight);
  return root;
}

test('procedural gait reports live run state and alternating rear-readable limb poses', () => {
  const root = articulatedFixture();
  const animator = createWalkAnimator(root, { maxSpeed: 6 });
  let positive = null;
  let negative = null;

  for (let frame = 0; frame < 360 && (!positive || !negative); frame++) {
    animator.update(1 / 60, {
      speed: 6,
      grounded: true,
      verticalSpeed: 0,
    });
    const pose = animator.pose;
    if (pose.locomotionWeight < 0.8) continue;
    if (!positive && pose.stride > 0.78) positive = pose;
    if (!negative && pose.stride < -0.78) negative = pose;
  }

  assert.ok(positive, 'positive half-stride was not observed');
  assert.ok(negative, 'negative half-stride was not observed');
  assert.equal(animator.state, 'run');
  assert.ok(animator.contact.serial >= 1);

  assert.ok(positive.joints['leg-l'].rotation.x > 0.65);
  assert.ok(positive.joints['leg-r'].rotation.x < -0.65);
  assert.ok(positive.joints['arm-l'].rotation.x < -0.55);
  assert.ok(positive.joints['arm-r'].rotation.x > 0.55);
  assert.ok(negative.joints['leg-l'].rotation.x < -0.65);
  assert.ok(negative.joints['leg-r'].rotation.x > 0.65);
  assert.ok(negative.joints['arm-l'].rotation.x > 0.55);
  assert.ok(negative.joints['arm-r'].rotation.x < -0.55);

  assert.ok(
    Math.abs(
      positive.joints['arm-l'].rotation.z
      - negative.joints['arm-l'].rotation.z,
    ) > 0.15,
    'arm silhouette should change across the rear-camera view',
  );
  assert.ok(
    Math.abs(
      positive.joints['leg-l'].position.y
      - negative.joints['leg-l'].position.y,
    ) > 0.02,
    'the lifted foot should visibly separate from the planted foot',
  );
});

test('character animator exposes the latest locomotion pose instead of recomputing idle', () => {
  const animator = createCharacterAnimator(articulatedFixture(), { maxSpeed: 6 });
  for (let frame = 0; frame < 30; frame++) {
    animator.update(1 / 60, { speed: 6, grounded: true });
  }
  assert.equal(animator.locomotionState, 'run');
  assert.equal(animator.pose.state, 'run');
  assert.ok(animator.pose.speedRatio > 0.99);

  animator.update(1 / 60, {
    speed: 6,
    grounded: false,
    verticalSpeed: 3,
  });
  assert.equal(animator.locomotionState, 'jump');
  assert.equal(animator.pose.state, 'jump');
});
