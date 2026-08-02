import {
  applySkywayAuthoritativeCorrectionBatch,
} from './skyway-authoritative-correction.js';
import {
  commitSkywayInputAdmissionBatch,
  createSkywayInputAdmissionBatch,
  restoreSkywayInputAdmissionWindow,
  snapshotSkywayInputAdmissionWindow,
} from './skyway-input-admission.js';
import {
  createSkywayRoundCheckpointBundle,
  restoreSkywayRoundCheckpointBundle,
} from './skyway-round-checkpoint.js';
import {
  canonicalizeSkywaySnapshot,
  hashSkywaySnapshot,
} from './skyway-snapshot-history.js';

export const SKYWAY_AUTHORITATIVE_INTAKE_VERSION = 1;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function sameOrder(first, second) {
  return Array.isArray(first) &&
    Array.isArray(second) &&
    first.length === second.length &&
    first.every((value, index) => value === second[index]);
}

function cloneRoundStack({
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

function liveCheckpoint({
  sessionIncarnation,
  roundEpoch,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  return createSkywayRoundCheckpointBundle({
    sessionIncarnation,
    roundEpoch,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
}

function restoreRoundStack({
  sessionIncarnation,
  roundEpoch,
  bundle,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  return restoreSkywayRoundCheckpointBundle({
    sessionIncarnation,
    roundEpoch,
    bundle,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
}

export function applySkywayAuthoritativeIntake({
  sessionIncarnation,
  roundEpoch,
  baseCheckpointBundle,
  admissionBatch,
  environmentForRound,
  admissionWindow,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  const abortCheckpoint = liveCheckpoint({
    sessionIncarnation,
    roundEpoch,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
  if (abortCheckpoint.bundleHash !== baseCheckpointBundle?.bundleHash) {
    throw new RangeError(
      'Skyway authoritative intake checkpoint revision is stale.',
    );
  }
  const abortAdmissionSnapshot =
    snapshotSkywayInputAdmissionWindow(admissionWindow);
  const abortAdmissionHash = hashSkywaySnapshot(abortAdmissionSnapshot);
  if (
    admissionBatch?.sessionIncarnation !== sessionIncarnation ||
    admissionBatch?.roundEpoch !== roundEpoch ||
    admissionBatch?.currentTick !== baseCheckpointBundle.tick ||
    admissionWindow.currentTick !== baseCheckpointBundle.tick
  ) {
    throw new RangeError(
      'Skyway authoritative intake admission head is stale or misaligned.',
    );
  }
  if (!sameOrder(
    admissionWindow.participantIds,
    baseCheckpointBundle.participantIds,
  )) {
    throw new TypeError(
      'Skyway authoritative intake participants are not aligned.',
    );
  }

  const scratchStack = cloneRoundStack({
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
  const scratchAdmission = structuredClone(admissionWindow);
  let admissionCommit = null;
  let correctionBatch = null;
  if (admissionBatch?.correctionCount === 0) {
    const currentEmptyBatch = createSkywayInputAdmissionBatch(
      scratchAdmission,
      {
        sessionIncarnation,
        roundEpoch,
        throughTick: admissionBatch.throughTick,
      },
    );
    if (
      canonicalizeSkywaySnapshot(currentEmptyBatch) !==
      canonicalizeSkywaySnapshot(admissionBatch)
    ) {
      throw new RangeError(
        'Skyway authoritative intake admission reservation is stale.',
      );
    }
  } else {
    admissionCommit = commitSkywayInputAdmissionBatch(scratchAdmission, {
      sessionIncarnation,
      roundEpoch,
      batch: admissionBatch,
    });
    correctionBatch = applySkywayAuthoritativeCorrectionBatch({
      ...scratchStack,
      sessionIncarnation,
      roundEpoch,
      baseCheckpointBundle,
      corrections: admissionBatch.corrections,
      environmentForRound,
    });
  }
  const correctedCheckpoint = correctionBatch?.checkpointBundle ??
    baseCheckpointBundle;
  const committedAdmissionSnapshot =
    snapshotSkywayInputAdmissionWindow(scratchAdmission);
  const committedAdmissionHash =
    hashSkywaySnapshot(committedAdmissionSnapshot);

  // Prove both prepared images can restore into matching scratch targets before
  // either live target is touched.
  const restoreProofStack = cloneRoundStack({
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
  restoreRoundStack({
    ...restoreProofStack,
    sessionIncarnation,
    roundEpoch,
    bundle: correctedCheckpoint,
  });
  const restoreProofAdmission = structuredClone(admissionWindow);
  restoreSkywayInputAdmissionWindow(
    restoreProofAdmission,
    committedAdmissionSnapshot,
    { sessionIncarnation, roundEpoch },
  );

  const checkpointCommitTarget = liveCheckpoint({
    sessionIncarnation,
    roundEpoch,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
  const admissionCommitTarget =
    snapshotSkywayInputAdmissionWindow(admissionWindow);
  if (checkpointCommitTarget.bundleHash !== abortCheckpoint.bundleHash) {
    throw new RangeError(
      'Skyway authoritative intake checkpoint target changed during preparation.',
    );
  }
  if (
    hashSkywaySnapshot(admissionCommitTarget) !== abortAdmissionHash ||
    admissionCommitTarget.revision !== admissionBatch.admissionRevision
  ) {
    throw new RangeError(
      'Skyway authoritative intake admission target changed during preparation.',
    );
  }

  const acks = admissionCommit?.acks ??
    committedAdmissionSnapshot.owners.map(({ ownerId, ackSequence }) => ({
      ownerId,
      ackSequence,
    }));
  const result = deepFreeze({
    version: SKYWAY_AUTHORITATIVE_INTAKE_VERSION,
    kind: 'skyway-authoritative-intake',
    sessionIncarnation,
    roundEpoch,
    status: correctionBatch?.status ?? 'no-op',
    admissionBatchHash: admissionBatch.batchHash,
    admissionRevision: admissionCommit?.admissionRevision ??
      committedAdmissionSnapshot.revision,
    abortAdmissionRevision: abortAdmissionSnapshot.revision,
    abortCheckpointHash: abortCheckpoint.bundleHash,
    abortAdmissionHash,
    checkpointHash: correctedCheckpoint.bundleHash,
    admissionSnapshotHash: committedAdmissionHash,
    admissionBatch,
    checkpointBundle: correctedCheckpoint,
    admissionSnapshot: committedAdmissionSnapshot,
    acks,
    admissionCommit,
    correctionBatch,
    finalityToken: correctionBatch?.finalityToken ?? null,
    suppressPresentation: correctionBatch?.suppressPresentation ?? false,
  });

  if (admissionBatch.correctionCount === 0) return result;

  try {
    restoreRoundStack({
      sessionIncarnation,
      roundEpoch,
      bundle: correctedCheckpoint,
      round,
      snapshotHistory,
      commandJournal,
      replayEventLedger,
    });
    restoreSkywayInputAdmissionWindow(
      admissionWindow,
      committedAdmissionSnapshot,
      { sessionIncarnation, roundEpoch },
    );
  } catch (error) {
    restoreRoundStack({
      sessionIncarnation,
      roundEpoch,
      bundle: abortCheckpoint,
      round,
      snapshotHistory,
      commandJournal,
      replayEventLedger,
    });
    restoreSkywayInputAdmissionWindow(
      admissionWindow,
      abortAdmissionSnapshot,
      { sessionIncarnation, roundEpoch },
    );
    throw error;
  }

  return result;
}
