import {
  SKYWAY_ROLLBACK_COORDINATOR_VERSION,
} from './skyway-rollback-coordinator.js';
import {
  assertSkywayRoundFinalityToken,
} from './skyway-round-finality.js';

export const SKYWAY_REPLAY_EVENT_LEDGER_VERSION = 3;
export const SKYWAY_REPLAY_EVENT_LEDGER_CAPACITY = 120;

const PARTICIPANT_EVENT_KEYS = Object.freeze({
  jump: ['participantId', 'type'],
  land: ['participantId', 'type'],
  impact: ['participantId', 'type'],
  shortcut: ['participantId', 'type'],
  checkpoint: ['checkpoint', 'participantId', 'type'],
  fall: ['checkpoint', 'participantId', 'type'],
  finish: ['finishTime', 'participantId', 'place', 'type'],
});

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === keys.length &&
    actual.every((key, index) => key === keys[index]);
}

function validParticipantIds(participantIds) {
  return Array.isArray(participantIds) &&
    participantIds.length > 0 &&
    participantIds.every((id) => (
      typeof id === 'string' && id.length > 0 && id.length <= 64
    )) &&
    new Set(participantIds).size === participantIds.length;
}

function normalizeEvent(event, participantIds) {
  if (event?.type === 'countdown') {
    if (
      !exactKeys(event, ['number', 'type']) ||
      !Number.isInteger(event.number) ||
      event.number < 1 ||
      event.number > 60
    ) {
      throw new TypeError('Invalid Skyway countdown event.');
    }
    return { type: 'countdown', number: event.number };
  }
  if (event?.type === 'round-start') {
    if (!exactKeys(event, ['type'])) {
      throw new TypeError('Invalid Skyway round-start event.');
    }
    return { type: 'round-start' };
  }

  const keys = PARTICIPANT_EVENT_KEYS[event?.type];
  if (
    !keys ||
    !exactKeys(event, keys) ||
    !participantIds.includes(event.participantId)
  ) {
    throw new TypeError('Invalid Skyway participant event.');
  }
  if (
    (event.type === 'checkpoint' || event.type === 'fall') &&
    (!Number.isInteger(event.checkpoint) || event.checkpoint < 0)
  ) {
    throw new TypeError('Invalid Skyway checkpoint event.');
  }
  if (
    event.type === 'finish' &&
    (
      !Number.isInteger(event.place) ||
      event.place < 1 ||
      !Number.isFinite(event.finishTime) ||
      event.finishTime < 0
    )
  ) {
    throw new TypeError('Invalid Skyway finish event.');
  }

  const normalized = {
    participantId: event.participantId,
    type: event.type,
  };
  if (event.type === 'checkpoint' || event.type === 'fall') {
    normalized.checkpoint = event.checkpoint;
  } else if (event.type === 'finish') {
    normalized.place = event.place;
    normalized.finishTime = event.finishTime;
  }
  return normalized;
}

function normalizeEvents(events, participantIds) {
  if (!Array.isArray(events)) {
    throw new TypeError('Skyway event frames require an event array.');
  }
  return events.map((event) => normalizeEvent(event, participantIds));
}

function eventsEqual(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function assertLedger(ledger) {
  if (
    !ledger ||
    ledger.version !== SKYWAY_REPLAY_EVENT_LEDGER_VERSION ||
    !Number.isInteger(ledger.capacityTicks) ||
    ledger.capacityTicks < 1 ||
    !Number.isInteger(ledger.nextTick) ||
    ledger.nextTick < 1 ||
    !Number.isInteger(ledger.committedThroughTick) ||
    ledger.committedThroughTick < 0 ||
    ledger.committedThroughTick >= ledger.nextTick ||
    !Number.isSafeInteger(ledger.revision) ||
    ledger.revision < 0 ||
    !Number.isSafeInteger(ledger.roundEpoch) ||
    ledger.roundEpoch < 1 ||
    !validParticipantIds(ledger.participantIds) ||
    !Array.isArray(ledger.slots) ||
    ledger.slots.length !== ledger.capacityTicks ||
    (ledger.oldestTick === null
      ? ledger.latestTick !== null
      : (
        !Number.isInteger(ledger.oldestTick) ||
        !Number.isInteger(ledger.latestTick) ||
        ledger.oldestTick < 1 ||
        ledger.latestTick < ledger.oldestTick ||
        ledger.latestTick !== ledger.nextTick - 1 ||
        ledger.latestTick - ledger.oldestTick >= ledger.capacityTicks
      )) ||
    (ledger.pendingFinality !== null && (
      !Number.isInteger(ledger.pendingFinality.roundEpoch) ||
      ledger.pendingFinality.roundEpoch !== ledger.roundEpoch ||
      !Number.isInteger(ledger.pendingFinality.throughTick) ||
      ledger.pendingFinality.throughTick < ledger.committedThroughTick ||
      typeof ledger.pendingFinality.roundSnapshotHash !== 'string' ||
      !Number.isSafeInteger(ledger.pendingFinality.ledgerRevision) ||
      ledger.pendingFinality.ledgerRevision !== ledger.revision
    ))
  ) {
    throw new TypeError('Invalid Skyway replay event ledger.');
  }
}

function slotIndex(ledger, tick) {
  return tick % ledger.capacityTicks;
}

function assertRevisionCanAdvance(ledger) {
  if (ledger.revision >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Skyway event ledger revision is exhausted.');
  }
}

function retainedEntry(ledger, tick) {
  if (
    !Number.isInteger(tick) ||
    ledger.oldestTick === null ||
    tick < ledger.oldestTick ||
    tick > ledger.latestTick
  ) {
    return null;
  }
  const entry = ledger.slots[slotIndex(ledger, tick)];
  return entry?.tick === tick ? entry : null;
}

function detachedFrame(entry) {
  return entry
    ? { tick: entry.tick, events: entry.events.map((event) => ({ ...event })) }
    : null;
}

function frozenFrames(frames) {
  return Object.freeze(frames.map((frame) => Object.freeze({
    tick: frame.tick,
    events: Object.freeze(
      frame.events.map((event) => Object.freeze({ ...event })),
    ),
  })));
}

function freezeCommit({ fromTick, throughTick, frames, finalityToken }) {
  const releasedFrames = frozenFrames(frames);
  return Object.freeze({
    version: SKYWAY_REPLAY_EVENT_LEDGER_VERSION,
    kind: 'skyway-event-commit',
    finality: 'caller-asserted',
    roundEpoch: finalityToken.roundEpoch,
    roundSnapshotHash: finalityToken.roundSnapshotHash,
    finalityTokenHash: finalityToken.tokenHash,
    fromTick,
    throughTick,
    eventCount: releasedFrames.reduce(
      (count, frame) => count + frame.events.length,
      0,
    ),
    frames: releasedFrames,
  });
}

export function createSkywayReplayEventLedger({
  participantIds,
  capacityTicks = SKYWAY_REPLAY_EVENT_LEDGER_CAPACITY,
  nextTick = 1,
  roundEpoch = 1,
}) {
  if (
    !validParticipantIds(participantIds) ||
    !Number.isInteger(capacityTicks) ||
    capacityTicks < 1 ||
    !Number.isInteger(nextTick) ||
    nextTick < 1 ||
    !Number.isSafeInteger(roundEpoch) ||
    roundEpoch < 1
  ) {
    throw new TypeError(
      'Skyway replay event ledger requires participants, capacity, and next tick.',
    );
  }
  return {
    version: SKYWAY_REPLAY_EVENT_LEDGER_VERSION,
    capacityTicks,
    participantIds: [...participantIds],
    nextTick,
    committedThroughTick: nextTick - 1,
    roundEpoch,
    oldestTick: null,
    latestTick: null,
    revision: 0,
    pendingFinality: null,
    slots: Array(capacityTicks).fill(null),
  };
}

export function lookupSkywayReplayEventFrame(ledger, tick) {
  assertLedger(ledger);
  return detachedFrame(retainedEntry(ledger, tick));
}

export function appendSkywayReplayEventFrame(ledger, { tick, events }) {
  assertLedger(ledger);
  if (!Number.isInteger(tick) || tick < 1) {
    throw new TypeError('Skyway event frame tick must be a positive integer.');
  }
  const normalized = normalizeEvents(events, ledger.participantIds);
  if (tick < ledger.nextTick) {
    const retained = retainedEntry(ledger, tick);
    return retained && eventsEqual(retained.events, normalized)
      ? { accepted: false, reason: 'duplicate', revision: ledger.revision }
      : {
          accepted: false,
          reason: retained ? 'conflict' : 'unavailable',
          revision: ledger.revision,
        };
  }
  if (tick !== ledger.nextTick) {
    throw new RangeError(`Skyway replay event ledger expected tick ${ledger.nextTick}.`);
  }

  assertRevisionCanAdvance(ledger);
  if (
    ledger.oldestTick !== null &&
    tick - ledger.oldestTick >= ledger.capacityTicks
  ) {
    if (ledger.oldestTick > ledger.committedThroughTick) {
      throw new RangeError('Skyway event capacity cannot evict uncommitted ticks.');
    }
    const oldestIndex = slotIndex(ledger, ledger.oldestTick);
    if (ledger.slots[oldestIndex]?.tick === ledger.oldestTick) {
      ledger.slots[oldestIndex] = null;
    }
    ledger.oldestTick += 1;
  }

  ledger.slots[slotIndex(ledger, tick)] = { tick, events: normalized };
  if (ledger.oldestTick === null) ledger.oldestTick = tick;
  ledger.latestTick = tick;
  ledger.nextTick = tick + 1;
  ledger.revision += 1;
  ledger.pendingFinality = null;
  return { accepted: true, reason: null, revision: ledger.revision };
}

export function replaceSkywayReplayEventRange(
  ledger,
  { resimulationEnvelope, finalityToken, roundSnapshot, frames },
) {
  assertLedger(ledger);
  const envelope = resimulationEnvelope;
  if (
    !envelope ||
    envelope.version !== SKYWAY_ROLLBACK_COORDINATOR_VERSION ||
    envelope.kind !== 'skyway-resimulation' ||
    envelope.suppressPresentation !== true ||
    envelope.roundEpoch !== ledger.roundEpoch ||
    !Number.isInteger(envelope.rollbackTick) ||
    !Number.isInteger(envelope.fromTick) ||
    !Number.isInteger(envelope.throughTick) ||
    envelope.fromTick !== envelope.rollbackTick + 1 ||
    envelope.throughTick < envelope.fromTick ||
    ledger.latestTick !== envelope.throughTick ||
    ledger.nextTick !== envelope.throughTick + 1
  ) {
    throw new TypeError('Skyway event resimulation envelope is not aligned.');
  }
  assertSkywayRoundFinalityToken(finalityToken, {
    ledger,
    roundSnapshot,
    expectedRoundTick: envelope.throughTick,
  });
  if (envelope.rollbackTick < ledger.committedThroughTick) {
    throw new RangeError('Skyway events already committed across the rollback tick.');
  }
  if (
    !Array.isArray(frames) ||
    frames.length !== envelope.throughTick - envelope.fromTick + 1
  ) {
    throw new RangeError('Skyway event replacement coverage is incomplete.');
  }

  const prepared = [];
  let changedTicks = 0;
  for (let index = 0; index < frames.length; index++) {
    const tick = envelope.fromTick + index;
    const frame = frames[index];
    const retained = retainedEntry(ledger, tick);
    if (!retained) {
      throw new RangeError(`Skyway event ledger does not retain tick ${tick}.`);
    }
    if (!exactKeys(frame, ['events', 'tick']) || frame.tick !== tick) {
      throw new TypeError('Skyway event replacement frames are not ordered.');
    }
    const events = normalizeEvents(frame.events, ledger.participantIds);
    if (!eventsEqual(retained.events, events)) changedTicks += 1;
    prepared.push({ tick, events });
  }

  const bindingChanged = (
    ledger.pendingFinality?.throughTick !== envelope.throughTick ||
    ledger.pendingFinality?.roundSnapshotHash !== finalityToken.roundSnapshotHash
  );
  if (changedTicks > 0 || bindingChanged) {
    assertRevisionCanAdvance(ledger);
  }
  if (changedTicks > 0) {
    for (const frame of prepared) {
      ledger.slots[slotIndex(ledger, frame.tick)] = frame;
    }
  }
  if (changedTicks > 0 || bindingChanged) {
    ledger.revision += 1;
  }
  ledger.pendingFinality = {
    roundEpoch: ledger.roundEpoch,
    throughTick: envelope.throughTick,
    roundSnapshotHash: finalityToken.roundSnapshotHash,
    ledgerRevision: ledger.revision,
  };
  return Object.freeze({
    fromTick: envelope.fromTick,
    throughTick: envelope.throughTick,
    changedTicks,
    bindingChanged,
    revision: ledger.revision,
    roundEpoch: ledger.roundEpoch,
    roundSnapshotHash: finalityToken.roundSnapshotHash,
    suppressPresentation: true,
  });
}

export function commitSkywayReplayEvents(
  ledger,
  { throughTick, finalityToken, roundSnapshot },
) {
  assertLedger(ledger);
  if (!Number.isInteger(throughTick) || throughTick < ledger.committedThroughTick) {
    throw new TypeError('Skyway event commit tick is invalid.');
  }
  assertSkywayRoundFinalityToken(finalityToken, {
    ledger,
    roundSnapshot,
    expectedRoundTick: ledger.latestTick,
  });
  if (
    ledger.pendingFinality?.throughTick === throughTick &&
    ledger.pendingFinality.roundSnapshotHash !== finalityToken.roundSnapshotHash
  ) {
    throw new RangeError('Skyway event commit snapshot does not match its replacement.');
  }
  if (throughTick === ledger.committedThroughTick) {
    return freezeCommit({
      fromTick: throughTick + 1,
      throughTick,
      frames: [],
      finalityToken,
    });
  }
  if (throughTick > ledger.latestTick) {
    throw new RangeError('Skyway event commit coverage is incomplete.');
  }

  const fromTick = ledger.committedThroughTick + 1;
  const frames = [];
  for (let tick = fromTick; tick <= throughTick; tick++) {
    const entry = retainedEntry(ledger, tick);
    if (!entry) {
      throw new RangeError(`Skyway event ledger does not retain tick ${tick}.`);
    }
    frames.push(detachedFrame(entry));
  }

  assertRevisionCanAdvance(ledger);
  ledger.committedThroughTick = throughTick;
  ledger.revision += 1;
  if (ledger.pendingFinality?.throughTick === throughTick) {
    ledger.pendingFinality = null;
  } else if (ledger.pendingFinality) {
    ledger.pendingFinality.ledgerRevision = ledger.revision;
  }
  return freezeCommit({ fromTick, throughTick, frames, finalityToken });
}

export function resetSkywayReplayEventLedger(
  ledger,
  { nextTick = 1, roundEpoch } = {},
) {
  assertLedger(ledger);
  if (!Number.isSafeInteger(roundEpoch) || roundEpoch !== ledger.roundEpoch) {
    throw new RangeError('Skyway replay event ledger round epoch is stale.');
  }
  if (!Number.isInteger(nextTick) || nextTick < 1) {
    throw new TypeError('Skyway replay event reset requires a positive next tick.');
  }
  if (ledger.roundEpoch >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Skyway replay event round epoch is exhausted.');
  }
  ledger.nextTick = nextTick;
  ledger.committedThroughTick = nextTick - 1;
  ledger.roundEpoch += 1;
  ledger.oldestTick = null;
  ledger.latestTick = null;
  ledger.revision = 0;
  ledger.pendingFinality = null;
  ledger.slots.fill(null);
  return ledger;
}
