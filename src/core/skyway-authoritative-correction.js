import {
  replaceSkywayJournalCommand,
} from './skyway-command-journal.js';
import {
  replaceSkywayReplayEventRange,
} from './skyway-replay-event-ledger.js';
import {
  coordinateSkywayRollback,
} from './skyway-rollback-coordinator.js';
import {
  createSkywayRoundCheckpointBundle,
  restoreSkywayRoundCheckpointBundle,
} from './skyway-round-checkpoint.js';
import {
  createSkywayRoundFinalityToken,
} from './skyway-round-finality.js';
import {
  snapshotSkywayRound,
  stepSkywayRound,
  validateSkywayTickInput,
} from './skyway-round.js';
import {
  recordSkywaySnapshot,
} from './skyway-snapshot-history.js';

export const SKYWAY_AUTHORITATIVE_CORRECTION_VERSION = 1;
export const SKYWAY_AUTHORITATIVE_CORRECTION_BATCH_VERSION = 1;
export const SKYWAY_AUTHORITATIVE_CORRECTION_BATCH_CAPACITY = 32;

const CORRECTION_KEYS = Object.freeze([
  'input',
  'participantId',
  'tick',
]);

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function cloneStack({
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  return {
    round: structuredClone(round),
    snapshotHistory: structuredClone(snapshotHistory),
    commandJournal: structuredClone(commandJournal),
    replayEventLedger: structuredClone(replayEventLedger),
  };
}

function inputsEqual(first, second) {
  return first.dirX === second.dirX &&
    first.dirZ === second.dirZ &&
    first.moving === second.moving &&
    first.jumpHeld === second.jumpHeld &&
    first.grabPressed === second.grabPressed;
}

function normalizeCorrections(corrections, participantIds) {
  if (
    !Array.isArray(corrections) ||
    corrections.length < 1 ||
    corrections.length > SKYWAY_AUTHORITATIVE_CORRECTION_BATCH_CAPACITY
  ) {
    throw new TypeError(
      `Skyway authoritative correction batch requires 1-${SKYWAY_AUTHORITATIVE_CORRECTION_BATCH_CAPACITY} corrections.`,
    );
  }
  const participantOrder = new Map(
    participantIds.map((participantId, index) => [participantId, index]),
  );
  const unique = new Map();
  let duplicateCount = 0;

  for (const correction of corrections) {
    if (
      !exactKeys(correction, CORRECTION_KEYS) ||
      !Number.isInteger(correction.tick) ||
      correction.tick < 1 ||
      !participantOrder.has(correction.participantId)
    ) {
      throw new TypeError('Invalid Skyway authoritative correction.');
    }
    const input = validateSkywayTickInput(correction.input);
    if (!input) {
      throw new TypeError('Invalid Skyway authoritative correction input.');
    }
    const key = `${correction.tick}:${participantOrder.get(correction.participantId)}`;
    const existing = unique.get(key);
    if (existing) {
      if (!inputsEqual(existing.input, input)) {
        throw new TypeError(
          'Skyway authoritative correction batch contains a deterministic conflict.',
        );
      }
      duplicateCount += 1;
      continue;
    }
    unique.set(key, {
      tick: correction.tick,
      participantId: correction.participantId,
      input,
      participantOrder: participantOrder.get(correction.participantId),
    });
  }

  const ordered = [...unique.values()]
    .sort((first, second) => (
      first.tick - second.tick ||
      first.participantOrder - second.participantOrder
    ))
    .map(({ participantOrder: _participantOrder, ...correction }) => correction);
  return { ordered, duplicateCount };
}

function batchResultEnvelope({
  sessionIncarnation,
  roundEpoch,
  inputCount,
  duplicateCount,
  corrections,
  status,
  earliestRollbackTick = null,
  throughTick,
  roundSnapshotHash,
  abortCheckpointHash,
  checkpointHash,
  resimulationEnvelope = null,
  eventReplacement = null,
  finalityToken = null,
  checkpointBundle,
}) {
  const appliedCount = corrections.filter(({ accepted }) => accepted).length;
  const changedCount = corrections.filter(({ changed }) => changed).length;
  return deepFreeze({
    version: SKYWAY_AUTHORITATIVE_CORRECTION_BATCH_VERSION,
    kind: 'skyway-authoritative-correction-batch',
    sessionIncarnation,
    roundEpoch,
    status,
    accepted: appliedCount > 0,
    inputCount,
    correctionCount: corrections.length,
    duplicateCount,
    appliedCount,
    changedCount,
    earliestRollbackTick,
    throughTick,
    tickCount: resimulationEnvelope?.tickCount ?? 0,
    corrections,
    roundSnapshotHash,
    abortCheckpointHash,
    checkpointHash,
    resimulationEnvelope,
    eventReplacement,
    finalityToken,
    checkpointBundle,
    suppressPresentation: changedCount > 0,
  });
}

export function applySkywayAuthoritativeCorrectionBatch({
  sessionIncarnation,
  roundEpoch,
  baseCheckpointBundle,
  corrections,
  environmentForRound,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  const currentCheckpoint = createSkywayRoundCheckpointBundle({
    sessionIncarnation,
    roundEpoch,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });

  const scratch = cloneStack({
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
  restoreSkywayRoundCheckpointBundle({
    ...scratch,
    bundle: baseCheckpointBundle,
    sessionIncarnation,
    roundEpoch,
  });
  if (currentCheckpoint.bundleHash !== baseCheckpointBundle.bundleHash) {
    throw new RangeError('Skyway authoritative correction batch base is stale.');
  }
  const abortCheckpoint = baseCheckpointBundle;
  const normalized = normalizeCorrections(
    corrections,
    abortCheckpoint.participantIds,
  );
  const replacements = [];
  for (const correction of normalized.ordered) {
    const replacement = replaceSkywayJournalCommand(
      scratch.commandJournal,
      {
        roundEpoch,
        tick: correction.tick,
        participantId: correction.participantId,
        authority: 'authoritative',
        input: correction.input,
      },
    );
    if (!replacement.accepted && replacement.reason !== 'duplicate') {
      const ErrorType = replacement.reason === 'unavailable'
        ? RangeError
        : TypeError;
      throw new ErrorType(
        `Skyway authoritative correction batch rejected: ${replacement.reason}.`,
      );
    }
    replacements.push({
      tick: correction.tick,
      participantId: correction.participantId,
      status: replacement.changed
        ? 'resimulated'
        : replacement.accepted
          ? 'authority-upgraded'
          : 'no-op',
      accepted: replacement.accepted,
      reason: replacement.reason,
      previousAuthority: replacement.previousAuthority ?? null,
      changed: replacement.changed ?? false,
      rollbackTick: replacement.rollbackTick ?? null,
    });
  }

  const changedReplacements = replacements.filter(({ changed }) => changed);
  if (replacements.every(({ accepted }) => !accepted)) {
    return batchResultEnvelope({
      sessionIncarnation,
      roundEpoch,
      inputCount: corrections.length,
      duplicateCount: normalized.duplicateCount,
      corrections: replacements,
      status: 'no-op',
      throughTick: abortCheckpoint.tick,
      roundSnapshotHash: abortCheckpoint.roundSnapshotHash,
      abortCheckpointHash: abortCheckpoint.bundleHash,
      checkpointHash: abortCheckpoint.bundleHash,
      checkpointBundle: abortCheckpoint,
    });
  }

  let resimulationEnvelope = null;
  let eventReplacement = null;
  let finalityToken = null;
  let earliestRollbackTick = null;
  if (changedReplacements.length > 0) {
    if (typeof environmentForRound !== 'function') {
      throw new TypeError(
        'Skyway authoritative resimulation requires an environment adapter.',
      );
    }
    earliestRollbackTick = Math.min(
      ...changedReplacements.map(({ rollbackTick }) => rollbackTick),
    );
    const throughTick = scratch.round.tick;
    resimulationEnvelope = coordinateSkywayRollback({
      ...scratch,
      rollbackTick: earliestRollbackTick,
      throughTick,
      roundEpoch,
    });
    const env = environmentForRound({
      round: scratch.round,
      course: scratch.round.course,
    });
    if (
      !env ||
      typeof env !== 'object' ||
      typeof env.sampleGround !== 'function' ||
      !Number.isFinite(env.bounds) ||
      env.bounds <= 0
    ) {
      throw new TypeError(
        'Skyway authoritative resimulation environment is invalid.',
      );
    }
    const eventFrames = [];
    for (
      let tick = resimulationEnvelope.fromTick;
      tick <= resimulationEnvelope.throughTick;
      tick++
    ) {
      const frame = stepSkywayRound(scratch.round, { env });
      if (frame.tick !== tick) {
        throw new RangeError('Skyway authoritative resimulation tick diverged.');
      }
      recordSkywaySnapshot(
        scratch.snapshotHistory,
        frame.snapshot,
        { roundEpoch },
      );
      eventFrames.push({ tick, events: frame.events });
    }
    const correctedRoundSnapshot = snapshotSkywayRound(scratch.round);
    const replacementToken = createSkywayRoundFinalityToken({
      ledger: scratch.replayEventLedger,
      roundSnapshot: correctedRoundSnapshot,
    });
    eventReplacement = replaceSkywayReplayEventRange(
      scratch.replayEventLedger,
      {
        resimulationEnvelope,
        finalityToken: replacementToken,
        roundSnapshot: correctedRoundSnapshot,
        frames: eventFrames,
      },
    );
    finalityToken = createSkywayRoundFinalityToken({
      ledger: scratch.replayEventLedger,
      roundSnapshot: correctedRoundSnapshot,
    });
  }

  const finalCheckpoint = createSkywayRoundCheckpointBundle({
    ...scratch,
    sessionIncarnation,
    roundEpoch,
  });
  const commitTarget = createSkywayRoundCheckpointBundle({
    sessionIncarnation,
    roundEpoch,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
  if (commitTarget.bundleHash !== abortCheckpoint.bundleHash) {
    throw new RangeError(
      'Skyway authoritative correction target changed during preparation.',
    );
  }
  restoreSkywayRoundCheckpointBundle({
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
    bundle: finalCheckpoint,
    sessionIncarnation,
    roundEpoch,
  });

  return batchResultEnvelope({
    sessionIncarnation,
    roundEpoch,
    inputCount: corrections.length,
    duplicateCount: normalized.duplicateCount,
    corrections: replacements,
    status: changedReplacements.length > 0
      ? 'resimulated'
      : 'authority-upgraded',
    earliestRollbackTick,
    throughTick: finalCheckpoint.tick,
    roundSnapshotHash: finalCheckpoint.roundSnapshotHash,
    abortCheckpointHash: abortCheckpoint.bundleHash,
    checkpointHash: finalCheckpoint.bundleHash,
    resimulationEnvelope,
    eventReplacement,
    finalityToken,
    checkpointBundle: finalCheckpoint,
  });
}

export function applySkywayAuthoritativeCorrection(options) {
  const batch = applySkywayAuthoritativeCorrectionBatch({
    ...options,
    corrections: [options.correction],
  });
  const correction = batch.corrections[0];
  return deepFreeze({
    version: SKYWAY_AUTHORITATIVE_CORRECTION_VERSION,
    kind: 'skyway-authoritative-correction',
    sessionIncarnation: batch.sessionIncarnation,
    roundEpoch: batch.roundEpoch,
    status: batch.status,
    accepted: correction.accepted,
    reason: correction.reason,
    tick: correction.tick,
    participantId: correction.participantId,
    previousAuthority: correction.previousAuthority,
    changed: correction.changed,
    rollbackTick: correction.rollbackTick,
    throughTick: batch.throughTick,
    tickCount: batch.tickCount,
    roundSnapshotHash: batch.roundSnapshotHash,
    abortCheckpointHash: batch.abortCheckpointHash,
    checkpointHash: batch.checkpointHash,
    resimulationEnvelope: batch.resimulationEnvelope,
    eventReplacement: batch.eventReplacement,
    finalityToken: batch.finalityToken,
    checkpointBundle: batch.checkpointBundle,
    suppressPresentation: batch.suppressPresentation,
  });
}
