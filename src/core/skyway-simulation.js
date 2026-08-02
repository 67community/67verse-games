import { createPlayerState, stepPlayer } from '../player.js';

export const SKYWAY_SIMULATION_VERSION = 1;
export const SKYWAY_FIXED_DT = 1 / 60;

export function createSkywaySimulationState({ x = 0, z = 3 } = {}) {
  return {
    version: SKYWAY_SIMULATION_VERSION,
    tick: 0,
    time: 0,
    player: createPlayerState(x, z),
  };
}

export function skywayInputFromControl(command) {
  let dirX = Number.isFinite(command?.mx) ? command.mx : 0;
  let dirZ = Number.isFinite(command?.my) ? command.my : 0;
  const length = Math.hypot(dirX, dirZ);
  if (length > 1) {
    dirX /= length;
    dirZ /= length;
  }
  return {
    dirX,
    dirZ,
    moving: Math.hypot(dirX, dirZ) > 0.001,
    jumpHeld: command?.jump === true,
    grabPressed: command?.grab === true,
  };
}

export function stepSkywaySimulation(simulation, input, env) {
  if (!simulation || simulation.version !== SKYWAY_SIMULATION_VERSION) {
    throw new TypeError('Unsupported Skyway simulation state');
  }
  stepPlayer(simulation.player, input, SKYWAY_FIXED_DT, env);
  simulation.tick += 1;
  simulation.time = simulation.tick * SKYWAY_FIXED_DT;
  return simulation;
}

export function snapshotSkywaySimulation(simulation) {
  return {
    version: simulation.version,
    tick: simulation.tick,
    time: simulation.time,
    player: {
      pos: { ...simulation.player.pos },
      vel: { ...simulation.player.vel },
      yaw: simulation.player.yaw,
      grounded: simulation.player.grounded,
      grabCooldown: simulation.player.grabCooldown,
      grabEvent: simulation.player.grabEvent,
      jumpEvent: simulation.player.jumpEvent,
      coyoteTime: simulation.player.coyoteTime,
      jumpBufferTime: simulation.player.jumpBufferTime,
      jumpHeldLast: simulation.player.jumpHeldLast,
    },
  };
}

export function restoreSkywaySimulation(simulation, snapshot) {
  if (
    !snapshot ||
    snapshot.version !== SKYWAY_SIMULATION_VERSION ||
    !Number.isInteger(snapshot.tick) ||
    snapshot.tick < 0 ||
    !Number.isFinite(snapshot.time) ||
    !snapshot.player ||
    ![snapshot.player.pos?.x, snapshot.player.pos?.y, snapshot.player.pos?.z]
      .every(Number.isFinite) ||
    ![snapshot.player.vel?.x, snapshot.player.vel?.y, snapshot.player.vel?.z]
      .every(Number.isFinite) ||
    !['yaw', 'grabCooldown', 'coyoteTime', 'jumpBufferTime']
      .every((key) => Number.isFinite(snapshot.player[key])) ||
    !['grounded', 'grabEvent', 'jumpEvent', 'jumpHeldLast']
      .every((key) => typeof snapshot.player[key] === 'boolean')
  ) {
    throw new TypeError('Invalid Skyway simulation snapshot');
  }
  const player = simulation.player;
  simulation.tick = snapshot.tick;
  simulation.time = snapshot.time;
  Object.assign(player.pos, snapshot.player.pos);
  Object.assign(player.vel, snapshot.player.vel);
  for (const key of ['yaw', 'grabCooldown', 'coyoteTime', 'jumpBufferTime']) {
    player[key] = snapshot.player[key];
  }
  for (const key of ['grounded', 'grabEvent', 'jumpEvent', 'jumpHeldLast']) {
    player[key] = snapshot.player[key];
  }
  return simulation;
}

export function replaySkywaySimulation({ x = 0, z = 3, inputs, env }) {
  const simulation = createSkywaySimulationState({ x, z });
  for (const input of inputs) stepSkywaySimulation(simulation, input, env);
  return snapshotSkywaySimulation(simulation);
}
