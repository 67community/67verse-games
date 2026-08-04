// hub-plus.js - Skypark arrival interaction adapter.
//
// buildWorld() owns the authored civic-ceramic composition; this hook adds only
// interaction signals, onboarding, destination metadata and atmosphere.

import * as THREE from 'three';
import { HUB_ACTIVITY_DEFINITIONS } from '../core/hub-activities.js';
import { registerHook } from '../core/registry.js';
import { PALETTE } from '../world.js';

export function destinationFocusVisualState(
  focused,
  reducedMotion,
  time,
  phase = 0,
  target = {},
) {
  target.diamondRotationY = reducedMotion ? phase : time * 0.9 + phase;
  target.diamondY = 1.35 + (
    reducedMotion ? 0 : Math.sin(time * 1.8 + phase) * (focused ? 0.2 : 0.12)
  );
  target.diamondScale = focused ? 1.28 : 1;
  target.labelScale = focused ? 1.14 : 1;
  target.labelOpacity = focused ? 1 : 0.78;
  return target;
}

export function commitQuickStartReward(save) {
  return save?.commitCoins?.(25, 'Quick Start', () => (
    save.set('quickStartDone', true)
  )) ?? null;
}

export function commitSkyparkArrival(save) {
  if (save?.get?.('seenSkyparkArrival', false) === true) {
    return Object.freeze({ firstVisit: false, committed: true });
  }
  return Object.freeze({
    firstVisit: true,
    committed: save?.set?.('seenSkyparkArrival', true) === true,
  });
}

export function registerHubCameraCollider(world, mesh, bounds = null) {
  if (
    !world?.registerCameraCollider
    || !mesh
    || mesh.visible === false
    || mesh.userData?.cameraIgnore
  ) return false;
  const box = bounds || new THREE.Box3().setFromObject(mesh);
  if (!box || box.max.y - box.min.y < 0.45) return false;
  mesh.userData.cameraCollider = 'hub-solid';
  world.registerCameraCollider(mesh);
  return true;
}

function installCompactProofHub(ctx, scene, world, getSim) {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  scene.fog = new THREE.Fog(PALETTE.sky, 76, 172);
  scene.traverse((object) => {
    const uniforms = object.material?.uniforms;
    if (uniforms?.top?.value && uniforms?.bottom?.value) {
      uniforms.top.value.set(PALETTE.sky);
      uniforms.bottom.value.set(0xd8eef0);
    }
  });

  world.skyparkComposition = Object.freeze({
    version: 'arrival-rebuild-v1',
    landmarkIds: Object.freeze(['skyfold-canopy']),
    routeIds: Object.freeze([
      'arrival-court',
      'confluence-plaza',
      'play-lozenges',
      'creator-terrace',
      'echo-commons',
    ]),
    primaryRouteId: 'play-lozenges',
    validationIssues: Object.freeze([]),
  });

  world.destinations = [
    {
      id: 'skyway',
      label: 'Enter Skyway',
      x: world.portalPos.x,
      z: world.portalPos.z,
      kind: 'game',
      target: 'obstacle',
      radius: 3.2,
    },
    {
      id: 'activity-skate-line',
      label: 'Run Beacon Line',
      x: HUB_ACTIVITY_DEFINITIONS[0].start.x,
      z: HUB_ACTIVITY_DEFINITIONS[0].start.z,
      kind: 'activity',
      target: 'skate-line',
      radius: HUB_ACTIVITY_DEFINITIONS[0].start.radius,
    },
    {
      id: 'echo-wave',
      label: 'Wave at Echo Grove',
      x: 11,
      z: 10.5,
      kind: 'emote',
      target: 'wave',
      radius: 3.4,
    },
    {
      id: 'creator-studio',
      label: 'Open Creator Studio',
      x: -13,
      z: 10.2,
      kind: 'game',
      target: 'creator',
      radius: 3.2,
    },
  ];

  const markerMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.yellow,
    emissive: PALETTE.yellow,
    emissiveIntensity: 0.35,
    roughness: 0.48,
  });
  const markerGeometry = new THREE.OctahedronGeometry(0.42, 0);
  const markerViews = world.destinations.map((destination, index) => {
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.name = `proof-destination:${destination.id}`;
    marker.position.set(destination.x, 1.35, destination.z);
    marker.userData.perfGroup = 'hub-proof-signals';
    marker.userData.cameraIgnore = true;
    world.group.add(marker);
    world.animated.push((time) => {
      const focused = world.focusDestination === destination.id;
      const state = destinationFocusVisualState(
        focused,
        reducedMotion,
        time,
        index * 0.7,
      );
      marker.rotation.y = state.diamondRotationY;
      marker.position.y = state.diamondY;
      marker.scale.setScalar(state.diamondScale);
    });
    return marker;
  });

  const checkpointMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.aqua,
    emissive: PALETTE.aqua,
    emissiveIntensity: 0.55,
    roughness: 0.5,
    transparent: true,
    opacity: 0.85,
  });
  const checkpointGeometry = new THREE.TorusGeometry(0.88, 0.075, 6, 24);
  const checkpointViews = HUB_ACTIVITY_DEFINITIONS.flatMap((definition) => (
    definition.checkpoints.map((checkpoint) => {
      const ring = new THREE.Mesh(checkpointGeometry, checkpointMaterial);
      ring.name = `proof-checkpoint:${definition.id}:${checkpoint.id}`;
      ring.rotation.x = Math.PI / 2;
      ring.position.set(checkpoint.x, 0.18, checkpoint.z);
      ring.visible = false;
      ring.userData.perfGroup = 'hub-proof-signals';
      ring.userData.activityId = definition.id;
      ring.userData.checkpointId = checkpoint.id;
      ring.userData.cameraIgnore = true;
      world.group.add(ring);
      return ring;
    })
  ));
  world.hubActivityVisuals = {
    setState(state) {
      for (const ring of checkpointViews) {
        ring.visible = Boolean(
          state?.active
          && state.activityId === ring.userData.activityId
          && state.nextCheckpoint?.id === ring.userData.checkpointId
        );
      }
    },
  };

  const onboarding = {
    active: false,
    stage: 0,
    prompt: '',
    startPosition: { x: 0, z: 42 },
    start() {
      this.active = true;
      this.stage = 0;
      this.prompt = 'Follow the gold lozenges to Confluence Plaza';
      const sim = getSim?.();
      if (sim) this.startPosition = { x: sim.pos.x, z: sim.pos.z };
    },
    update(sim) {
      if (!this.active || !sim) return;
      if (
        this.stage === 0
        && Math.hypot(
          sim.pos.x - this.startPosition.x,
          sim.pos.z - this.startPosition.z,
        ) >= 3
      ) {
        this.stage = 1;
        this.prompt = 'Jump up the Flow Steps';
      }
      if (this.stage === 1 && !sim.grounded) {
        this.stage = 2;
        this.prompt = 'Reach Confluence Plaza';
      }
      if (this.stage === 2 && sim.pos.z <= 14) {
        this.active = false;
        this.prompt = '';
        const total = commitQuickStartReward(ctx.save);
        if (total == null) {
          ctx.ui.toast('Quick Start reward could not be saved on this device. Progress was not completed.');
        } else {
          this.stage = 3;
          ctx.ui.toast('Quick Start complete · +25 local Coins');
        }
      }
    },
  };
  world.onboarding = onboarding;

  function beginArrival() {
    const arrival = commitSkyparkArrival(ctx.save);
    if (arrival.firstVisit) {
      onboarding.start();
      if (!arrival.committed) {
        onboarding.prompt = 'Progress is not saved · follow the gold lozenges';
      }
      // The persistent onboarding prompt already explains the successful first
      // visit. Keep the toast channel free for the only extra fact that matters:
      // a failed write means the hint may repeat.
      if (!arrival.committed) {
        ctx.ui.toast('Welcome to 67 Park · first-visit status was not saved, so this hint may repeat');
      }
    }
  }
  if (document.body.classList.contains('entry-open')) {
    const stopWaiting = ctx.bus.on('world-entered', () => {
      stopWaiting();
      beginArrival();
    });
  } else {
    beginArrival();
  }

  world.compactProof = Object.freeze({
    id: 'confluence-arrival',
    destinationIds: Object.freeze(world.destinations.map(({ id }) => id)),
    visibleMarkerCount: markerViews.length,
  });
}

registerHook('hub', (ctx, { scene, world, getSim }) => {
  if (!scene || !world || !world.group) return;
  installCompactProofHub(ctx, scene, world, getSim);
});
