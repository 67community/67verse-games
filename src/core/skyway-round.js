import {
  resetSkywayCourseSimulation,
  restoreSkywayCourseSimulation,
  snapshotSkywayCourseSimulation,
  startSkywayRace,
  stepSkywayCourseClock,
  stepSkywayCourseParticipant,
} from './skyway-course-simulation.js';
import {
  createSkywaySimulationState,
  restoreSkywaySimulation,
  SKYWAY_FIXED_DT,
  snapshotSkywaySimulation,
  stepSkywaySimulation,
} from './skyway-simulation.js';
import {
  advanceSkywayInputTimeline,
  createSkywayInputTimeline,
  hasSkywayTimelineInput,
  queueSkywayTimelineInput,
  readSkywayTimelineInput,
  resetSkywayInputTimeline,
  restoreSkywayInputTimeline,
  SKYWAY_IDLE_INPUT,
  SKYWAY_INPUT_TIMELINE_CAPACITY,
  snapshotSkywayInputTimeline,
  validateSkywayTickInput,
} from './skyway-input-timeline.js';

export { validateSkywayTickInput } from './skyway-input-timeline.js';

export const SKYWAY_ROUND_VERSION = 3;
export const SKYWAY_COUNTDOWN_TICKS = Math.round(3 / SKYWAY_FIXED_DT);

const RACE_KEYS = Object.freeze([
  'cp',
  'finished',
  'place',
  'finishTime',
  'knockCd',
  'stun',
  'falls',
  'usedShortcut',
]);

function createRaceState({ cp = 0 } = {}) {
  if (!Number.isInteger(cp) || cp < 0) throw new TypeError('Invalid Skyway checkpoint.');
  return {
    cp,
    finished: false,
    place: 0,
    finishTime: 0,
    knockCd: 0,
    stun: 0,
    falls: 0,
    usedShortcut: false,
  };
}

function normalizeSpawn(value, label) {
  const spawn = {
    x: value?.x,
    y: value?.y ?? 0,
    z: value?.z,
    yaw: value?.yaw ?? Math.PI,
  };
  if (![spawn.x, spawn.y, spawn.z, spawn.yaw].every(Number.isFinite)) {
    throw new TypeError(`${label} must be finite.`);
  }
  return spawn;
}

function snapshotRace(race) {
  return Object.fromEntries(RACE_KEYS.map((key) => [key, race[key]]));
}

function validRaceSnapshot(race) {
  return race &&
    ['cp', 'place', 'falls'].every((key) => Number.isInteger(race[key]) && race[key] >= 0) &&
    ['finishTime', 'knockCd', 'stun'].every((key) => Number.isFinite(race[key]) && race[key] >= 0) &&
    ['finished', 'usedShortcut'].every((key) => typeof race[key] === 'boolean');
}

function createCountdownState(durationTicks) {
  if (durationTicks !== null && (
    !Number.isInteger(durationTicks) ||
    durationTicks < 1
  )) {
    throw new TypeError('Skyway countdown ticks must be a positive integer or null.');
  }
  return {
    durationTicks,
    elapsedTicks: 0,
  };
}

function countdownCue(countdown) {
  if (countdown.durationTicks === null) return null;
  const remainingTicks = countdown.durationTicks - countdown.elapsedTicks;
  if (remainingTicks <= 0) return null;
  return Math.max(1, Math.ceil(remainingTicks * SKYWAY_FIXED_DT));
}

function validCountdownSnapshot(saved, current, phase) {
  if (
    !saved ||
    saved.durationTicks !== current.durationTicks ||
    !Number.isInteger(saved.elapsedTicks) ||
    saved.elapsedTicks < 0
  ) {
    return false;
  }
  if (current.durationTicks === null) {
    return saved.elapsedTicks === 0 && phase === 'countdown';
  }
  if (saved.elapsedTicks > current.durationTicks) return false;
  return phase === 'countdown'
    ? saved.elapsedTicks < current.durationTicks
    : saved.elapsedTicks === current.durationTicks;
}

export function createSkywayRound({
  course,
  participants,
  countdownTicks = SKYWAY_COUNTDOWN_TICKS,
  inputCapacityTicks = SKYWAY_INPUT_TIMELINE_CAPACITY,
}) {
  if (
    !course ||
    course.phase !== 'countdown' ||
    !Array.isArray(participants) ||
    participants.length < 1
  ) {
    throw new TypeError('Skyway round requires a course and ordered participants.');
  }
  const ids = new Set();
  const initialized = participants.map((definition) => {
    if (
      !definition?.id ||
      ids.has(definition.id) ||
      typeof definition.isPlayer !== 'boolean'
    ) {
      throw new TypeError('Skyway round participants require unique ids and player roles.');
    }
    ids.add(definition.id);
    const spawn = normalizeSpawn(definition.spawn, `${definition.id}.spawn`);
    const resetSpawn = normalizeSpawn(
      definition.resetSpawn ?? spawn,
      `${definition.id}.resetSpawn`,
    );
    const simulation = createSkywaySimulationState({ x: spawn.x, z: spawn.z });
    simulation.player.pos.y = spawn.y;
    simulation.player.yaw = spawn.yaw;
    const participant = {
      id: definition.id,
      isPlayer: definition.isPlayer,
      spawn,
      resetSpawn,
      simulation,
      race: createRaceState(definition.race),
    };
    if (participant.race.cp >= course.checkpoints.length) {
      throw new RangeError('Skyway participant checkpoint is outside the course.');
    }
    return participant;
  });
  return {
    version: SKYWAY_ROUND_VERSION,
    tick: 0,
    countdown: createCountdownState(countdownTicks),
    inputTimeline: createSkywayInputTimeline({
      participantIds: initialized.map((participant) => participant.id),
      capacityTicks: inputCapacityTicks,
    }),
    course,
    participants: initialized,
  };
}

export function resetSkywayRound(round) {
  round.tick = 0;
  round.countdown.elapsedTicks = 0;
  resetSkywayInputTimeline(round.inputTimeline);
  resetSkywayCourseSimulation(round.course);
  for (const participant of round.participants) {
    participant.simulation.tick = 0;
    participant.simulation.time = 0;
    Object.assign(participant.race, createRaceState());
    const player = participant.simulation.player;
    player.pos.x = participant.resetSpawn.x;
    player.pos.y = participant.resetSpawn.y;
    player.pos.z = participant.resetSpawn.z;
    Object.assign(player.vel, { x: 0, y: 0, z: 0 });
    player.yaw = participant.resetSpawn.yaw;
    player.grounded = true;
  }
  return round;
}

export function snapshotSkywayRound(round) {
  return {
    version: round.version,
    tick: round.tick,
    countdown: { ...round.countdown },
    inputTimeline: snapshotSkywayInputTimeline(round.inputTimeline),
    course: snapshotSkywayCourseSimulation(round.course),
    participants: round.participants.map((participant) => ({
      id: participant.id,
      isPlayer: participant.isPlayer,
      race: snapshotRace(participant.race),
      simulation: snapshotSkywaySimulation(participant.simulation),
    })),
  };
}

function applyRoundSnapshot(round, snapshot) {
  restoreSkywayCourseSimulation(round.course, snapshot.course);
  round.participants.forEach((participant, index) => {
    const saved = snapshot.participants[index];
    restoreSkywaySimulation(participant.simulation, saved.simulation);
    Object.assign(participant.race, saved.race);
  });
  restoreSkywayInputTimeline(round.inputTimeline, snapshot.inputTimeline);
  round.countdown.elapsedTicks = snapshot.countdown.elapsedTicks;
  round.tick = snapshot.tick;
}

export function restoreSkywayRound(round, snapshot) {
  if (
    !snapshot ||
    snapshot.version !== SKYWAY_ROUND_VERSION ||
    !Number.isInteger(snapshot.tick) ||
    snapshot.tick < 0 ||
    snapshot.inputTimeline?.nextTick !== snapshot.tick + 1 ||
    !validCountdownSnapshot(
      snapshot.countdown,
      round.countdown,
      snapshot.course?.phase,
    ) ||
    !Array.isArray(snapshot.participants) ||
    snapshot.participants.length !== round.participants.length ||
    snapshot.course?.finishCount > round.participants.length ||
    round.participants.some((participant, index) => {
      const saved = snapshot.participants[index];
      return saved?.id !== participant.id ||
        saved.isPlayer !== participant.isPlayer ||
        !validRaceSnapshot(saved.race) ||
        saved.race.cp >= round.course.checkpoints.length ||
        saved.race.place > round.participants.length ||
        (saved.race.finished ? saved.race.place < 1 : saved.race.place !== 0);
    })
  ) {
    throw new TypeError('Invalid Skyway round snapshot');
  }
  const backup = snapshotSkywayRound(round);
  try {
    applyRoundSnapshot(round, snapshot);
  } catch {
    applyRoundSnapshot(round, backup);
    throw new TypeError('Invalid Skyway round snapshot');
  }
  return round;
}

export function queueSkywayRoundInput(round, frame) {
  if (!round || round.version !== SKYWAY_ROUND_VERSION) {
    throw new TypeError('Skyway input requires a current round.');
  }
  return queueSkywayTimelineInput(round.inputTimeline, frame);
}

export function stepSkywayRound(round, { inputFor, env, includeSnapshot = true }) {
  if (
    round.version !== SKYWAY_ROUND_VERSION ||
    (inputFor !== undefined && typeof inputFor !== 'function') ||
    !env ||
    round.inputTimeline.nextTick !== round.tick + 1
  ) {
    throw new TypeError('Skyway round step requires a current round, optional input adapter, and environment.');
  }
  round.tick += 1;
  const events = [];
  const inputs = [];
  const wasCountingDown = round.course.phase === 'countdown';
  const previousCue = wasCountingDown ? countdownCue(round.countdown) : null;

  stepSkywayCourseClock(round.course);

  if (wasCountingDown && round.countdown.durationTicks !== null) {
    round.countdown.elapsedTicks += 1;
    const nextCue = countdownCue(round.countdown);
    if (round.countdown.elapsedTicks === 1 || nextCue !== previousCue) {
      if (nextCue !== null) events.push({ type: 'countdown', number: nextCue });
    }
    if (round.countdown.elapsedTicks === round.countdown.durationTicks) {
      startSkywayRace(round.course);
      events.push({ type: 'round-start' });
    }
  }

  if (!wasCountingDown) {
    for (const participant of round.participants) {
      if (participant.isPlayer) {
        participant.race.stun = Math.max(
          0,
          participant.race.stun - SKYWAY_FIXED_DT,
        );
      }
      const accepted = !participant.isPlayer || participant.race.stun <= 0;
      if (
        accepted &&
        inputFor &&
        !hasSkywayTimelineInput(round.inputTimeline, round.tick, participant.id)
      ) {
        const queued = queueSkywayTimelineInput(round.inputTimeline, {
          tick: round.tick,
          participantId: participant.id,
          input: inputFor(participant, round),
        });
        if (!queued.accepted) {
          throw new TypeError(`Invalid Skyway tick input for "${participant.id}".`);
        }
      }
      const input = accepted
        ? readSkywayTimelineInput(
            round.inputTimeline,
            round.tick,
            participant.id,
          ).input
        : SKYWAY_IDLE_INPUT;

      const player = participant.simulation.player;
      const wasGrounded = player.grounded;
      stepSkywaySimulation(participant.simulation, input, env);
      const locomotionPose = {
        x: player.pos.x,
        y: player.pos.y,
        z: player.pos.z,
        yaw: player.yaw,
      };
      inputs.push({ id: participant.id, accepted, input, locomotionPose });
      if (player.jumpEvent) events.push({ participantId: participant.id, type: 'jump' });
      if (!wasGrounded && player.grounded) {
        events.push({ participantId: participant.id, type: 'land' });
      }
      for (const event of stepSkywayCourseParticipant(
        round.course,
        participant.race,
        player,
        { isPlayer: participant.isPlayer },
      )) {
        events.push({ participantId: participant.id, ...event });
      }
    }
  }
  advanceSkywayInputTimeline(round.inputTimeline, round.tick);

  return {
    tick: round.tick,
    inputs,
    events,
    snapshot: includeSnapshot ? snapshotSkywayRound(round) : null,
  };
}
