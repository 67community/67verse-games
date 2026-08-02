import {
  resetSkywayInputAdmissionWindow,
  restoreSkywayInputAdmissionWindow,
  snapshotSkywayInputAdmissionWindow,
} from './skyway-input-admission.js';
import {
  createSkywayRoundCheckpointBundle,
  restoreSkywayRoundCheckpointBundle,
} from './skyway-round-checkpoint.js';
import {
  resetSkywayRoundLifecycle,
} from './skyway-round-lifecycle.js';
import {
  snapshotSkywayRound,
} from './skyway-round.js';
import {
  canonicalizeSkywaySnapshot,
  hashSkywaySnapshot,
} from './skyway-snapshot-history.js';

export const SKYWAY_AUTHORITATIVE_LIFECYCLE_VERSION = 1;

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

function restoreObjectState(target, source) {
  for (const key of Object.keys(target)) {
    if (!Object.hasOwn(source, key)) delete target[key];
  }
  Object.assign(target, structuredClone(source));
}

function checkpoint({
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

export function resetSkywayAuthoritativeLifecycle({
  sessionIncarnation,
  roundEpoch,
  baseCheckpointBundle,
  baseAdmissionSnapshot,
  admissionWindow,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  const abortCheckpoint = checkpoint({
    sessionIncarnation,
    roundEpoch,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
  const checkpointProof = cloneRoundStack({
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
  restoreSkywayRoundCheckpointBundle({
    ...checkpointProof,
    sessionIncarnation,
    roundEpoch,
    bundle: baseCheckpointBundle,
  });
  if (abortCheckpoint.bundleHash !== baseCheckpointBundle.bundleHash) {
    throw new RangeError(
      'Skyway authoritative lifecycle checkpoint revision is stale.',
    );
  }

  const abortAdmissionSnapshot =
    snapshotSkywayInputAdmissionWindow(admissionWindow);
  const abortAdmissionHash = hashSkywaySnapshot(abortAdmissionSnapshot);
  const suppliedAdmissionSnapshot = structuredClone(baseAdmissionSnapshot);
  const admissionProof = structuredClone(admissionWindow);
  restoreSkywayInputAdmissionWindow(
    admissionProof,
    suppliedAdmissionSnapshot,
    { sessionIncarnation, roundEpoch },
  );
  if (
    canonicalizeSkywaySnapshot(abortAdmissionSnapshot) !==
    canonicalizeSkywaySnapshot(suppliedAdmissionSnapshot)
  ) {
    throw new RangeError(
      'Skyway authoritative lifecycle admission revision is stale.',
    );
  }
  if (
    admissionWindow.currentTick !== baseCheckpointBundle.tick ||
    !sameOrder(
      admissionWindow.participantIds,
      baseCheckpointBundle.participantIds,
    )
  ) {
    throw new RangeError(
      'Skyway authoritative lifecycle heads or participants are not aligned.',
    );
  }

  const scratchStack = cloneRoundStack({
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
  const scratchAdmission = structuredClone(admissionWindow);
  const roundLifecycle = resetSkywayRoundLifecycle({
    ...scratchStack,
    roundEpoch,
  });
  const admissionReset = resetSkywayInputAdmissionWindow(
    scratchAdmission,
    { sessionIncarnation, roundEpoch },
  );
  if (
    roundLifecycle.roundEpoch !== admissionReset.roundEpoch ||
    roundLifecycle.roundEpoch !== roundEpoch + 1 ||
    scratchAdmission.currentTick !== 0 ||
    !sameOrder(
      scratchAdmission.participantIds,
      scratchStack.round.participants.map(({ id }) => id),
    )
  ) {
    throw new RangeError(
      'Skyway authoritative lifecycle reset images are not aligned.',
    );
  }

  const nextRoundEpoch = roundLifecycle.roundEpoch;
  const finalCheckpoint = checkpoint({
    ...scratchStack,
    sessionIncarnation,
    roundEpoch: nextRoundEpoch,
  });
  const finalAdmissionSnapshot =
    snapshotSkywayInputAdmissionWindow(scratchAdmission);
  const finalAdmissionHash = hashSkywaySnapshot(finalAdmissionSnapshot);
  const clearedDecisions = abortAdmissionSnapshot.slots
    .filter(Boolean)
    .flatMap(({ decisions }) => decisions);

  // Re-run both existing reset Implementations on throwaway copies before
  // either live epoch is rotated.
  const proofStack = cloneRoundStack({
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
  const proofAdmission = structuredClone(admissionWindow);
  const proofRoundResult = resetSkywayRoundLifecycle({
    ...proofStack,
    roundEpoch,
  });
  const proofAdmissionResult = resetSkywayInputAdmissionWindow(
    proofAdmission,
    { sessionIncarnation, roundEpoch },
  );
  if (
    canonicalizeSkywaySnapshot(proofRoundResult) !==
      canonicalizeSkywaySnapshot(roundLifecycle) ||
    canonicalizeSkywaySnapshot(proofAdmissionResult) !==
      canonicalizeSkywaySnapshot(admissionReset) ||
    hashSkywaySnapshot(snapshotSkywayRound(proofStack.round)) !==
      finalCheckpoint.roundSnapshotHash ||
    hashSkywaySnapshot(proofAdmission) !== finalAdmissionHash
  ) {
    throw new RangeError(
      'Skyway authoritative lifecycle reset preflight diverged.',
    );
  }

  const checkpointTarget = checkpoint({
    sessionIncarnation,
    roundEpoch,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
  const admissionTarget =
    snapshotSkywayInputAdmissionWindow(admissionWindow);
  if (checkpointTarget.bundleHash !== abortCheckpoint.bundleHash) {
    throw new RangeError(
      'Skyway authoritative lifecycle checkpoint target changed during preparation.',
    );
  }
  if (
    hashSkywaySnapshot(admissionTarget) !== abortAdmissionHash ||
    admissionTarget.revision !== abortAdmissionSnapshot.revision
  ) {
    throw new RangeError(
      'Skyway authoritative lifecycle admission target changed during preparation.',
    );
  }

  const result = deepFreeze({
    version: SKYWAY_AUTHORITATIVE_LIFECYCLE_VERSION,
    kind: 'skyway-authoritative-lifecycle-reset',
    sessionIncarnation,
    previousRoundEpoch: roundEpoch,
    roundEpoch: nextRoundEpoch,
    previousTick: abortCheckpoint.tick,
    tick: 0,
    nextTick: 1,
    abortCheckpointHash: abortCheckpoint.bundleHash,
    abortAdmissionHash,
    checkpointHash: finalCheckpoint.bundleHash,
    admissionSnapshotHash: finalAdmissionHash,
    initialSnapshotHash: roundLifecycle.initialSnapshotHash,
    previousAdmissionRevision: abortAdmissionSnapshot.revision,
    admissionRevision: finalAdmissionSnapshot.revision,
    clearedDecisionCount: clearedDecisions.length,
    clearedPendingDecisionCount: clearedDecisions.filter(({ status }) => (
      status === 'pending'
    )).length,
    clearedAckCount: abortAdmissionSnapshot.owners.filter(({ ackSequence }) => (
      ackSequence >= 0
    )).length,
    checkpointBundle: finalCheckpoint,
    admissionSnapshot: finalAdmissionSnapshot,
    acks: finalAdmissionSnapshot.owners.map(({ ownerId, ackSequence }) => ({
      ownerId,
      ackSequence,
    })),
    roundLifecycle,
    admissionReset,
  });

  const admissionBackup =
    snapshotSkywayInputAdmissionWindow(admissionWindow);
  try {
    const committedAdmission = resetSkywayInputAdmissionWindow(
      admissionWindow,
      { sessionIncarnation, roundEpoch },
    );
    if (
      canonicalizeSkywaySnapshot(committedAdmission) !==
        canonicalizeSkywaySnapshot(admissionReset)
    ) {
      throw new RangeError(
        'Skyway authoritative lifecycle live reset diverged.',
      );
    }
    resetSkywayRoundLifecycle({
      round,
      snapshotHistory,
      commandJournal,
      replayEventLedger,
      roundEpoch,
    });
  } catch (error) {
    restoreObjectState(admissionWindow, admissionBackup);
    throw error;
  }

  return result;
}
