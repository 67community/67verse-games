import {
  assertSkywayAdmissionAckRestore,
  assertSkywayAdmissionAckWatermark,
  createSkywayAdmissionAckWatermark,
} from './skyway-admission-ack-finality.js';
import {
  assertSkywayAuthorityCheckpoint,
  createSkywayAuthorityCheckpoint,
  restoreSkywayAuthorityCheckpoint,
} from './skyway-authority-checkpoint.js';
import {
  resetSkywayAuthoritativeLifecycle,
} from './skyway-authoritative-lifecycle.js';
import {
  resetSkywayReconnectLeaseWindow,
  restoreSkywayReconnectLeaseWindow,
  snapshotSkywayReconnectLeaseWindow,
} from './skyway-reconnect-lease.js';
import {
  canonicalizeSkywaySnapshot,
  hashSkywaySnapshot,
} from './skyway-snapshot-history.js';

export const SKYWAY_RECONNECT_AUTHORITY_CHECKPOINT_VERSION = 1;

const CHECKPOINT_KEYS = Object.freeze([
  'admissionAckWatermarkHash',
  'authorityCheckpointHash',
  'components',
  'kind',
  'leaseWindowSnapshotHash',
  'participantIds',
  'reconnectAuthorityCheckpointHash',
  'rosterHash',
  'roundEpoch',
  'sessionIncarnation',
  'sessionIncarnationHash',
  'tick',
  'version',
]);
const COMPONENT_KEYS = Object.freeze([
  'admissionAckWatermark',
  'authorityCheckpoint',
  'leaseWindowSnapshot',
]);

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function sameOrder(first, second) {
  return Array.isArray(first) &&
    Array.isArray(second) &&
    first.length === second.length &&
    first.every((value, index) => value === second[index]);
}

function restoreObjectState(target, source) {
  for (const key of Object.keys(target)) {
    if (!Object.hasOwn(source, key)) delete target[key];
  }
  Object.assign(target, structuredClone(source));
}

function cloneAuthorityStack({
  admissionWindow,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  return {
    admissionWindow: structuredClone(admissionWindow),
    round: structuredClone(round),
    snapshotHistory: structuredClone(snapshotHistory),
    commandJournal: structuredClone(commandJournal),
    replayEventLedger: structuredClone(replayEventLedger),
  };
}

function checkpointPayload(checkpoint) {
  return {
    version: checkpoint.version,
    kind: checkpoint.kind,
    sessionIncarnation: checkpoint.sessionIncarnation,
    sessionIncarnationHash: checkpoint.sessionIncarnationHash,
    roundEpoch: checkpoint.roundEpoch,
    tick: checkpoint.tick,
    participantIds: checkpoint.participantIds,
    rosterHash: checkpoint.rosterHash,
    authorityCheckpointHash: checkpoint.authorityCheckpointHash,
    leaseWindowSnapshotHash: checkpoint.leaseWindowSnapshotHash,
    admissionAckWatermarkHash:
      checkpoint.admissionAckWatermarkHash,
    components: checkpoint.components,
  };
}

function assertCheckpoint(checkpoint) {
  if (
    !exactKeys(checkpoint, CHECKPOINT_KEYS) ||
    checkpoint.version !==
      SKYWAY_RECONNECT_AUTHORITY_CHECKPOINT_VERSION ||
    checkpoint.kind !== 'skyway-reconnect-authority-checkpoint' ||
    !exactKeys(checkpoint.components, COMPONENT_KEYS) ||
    typeof checkpoint.sessionIncarnation !== 'string' ||
    typeof checkpoint.sessionIncarnationHash !== 'string' ||
    !Number.isSafeInteger(checkpoint.roundEpoch) ||
    checkpoint.roundEpoch < 1 ||
    !Number.isSafeInteger(checkpoint.tick) ||
    checkpoint.tick < 0 ||
    !Array.isArray(checkpoint.participantIds) ||
    typeof checkpoint.rosterHash !== 'string' ||
    typeof checkpoint.authorityCheckpointHash !== 'string' ||
    typeof checkpoint.leaseWindowSnapshotHash !== 'string' ||
    typeof checkpoint.admissionAckWatermarkHash !== 'string' ||
    typeof checkpoint.reconnectAuthorityCheckpointHash !== 'string'
  ) {
    throw new TypeError(
      'Invalid Skyway Reconnect Authority checkpoint.',
    );
  }

  const {
    authorityCheckpoint,
    leaseWindowSnapshot,
    admissionAckWatermark,
  } = checkpoint.components;
  assertSkywayAuthorityCheckpoint(authorityCheckpoint);
  assertSkywayAdmissionAckWatermark(admissionAckWatermark);
  assertSkywayAdmissionAckRestore(admissionAckWatermark, {
    authorityCheckpoint,
  });
  const canonicalLeaseSnapshot = snapshotSkywayReconnectLeaseWindow(
    structuredClone(leaseWindowSnapshot),
  );
  if (
    checkpoint.sessionIncarnation !==
      authorityCheckpoint.sessionIncarnation ||
    checkpoint.sessionIncarnationHash !==
      hashSkywaySnapshot(checkpoint.sessionIncarnation) ||
    checkpoint.sessionIncarnationHash !==
      canonicalLeaseSnapshot.sessionIncarnationHash ||
    checkpoint.roundEpoch !== authorityCheckpoint.roundEpoch ||
    checkpoint.roundEpoch !== canonicalLeaseSnapshot.roundEpoch ||
    checkpoint.tick !== authorityCheckpoint.tick ||
    checkpoint.rosterHash !== authorityCheckpoint.rosterHash ||
    checkpoint.rosterHash !== canonicalLeaseSnapshot.rosterHash ||
    !sameOrder(
      checkpoint.participantIds,
      authorityCheckpoint.participantIds,
    ) ||
    checkpoint.authorityCheckpointHash !==
      authorityCheckpoint.authorityCheckpointHash ||
    checkpoint.leaseWindowSnapshotHash !==
      hashSkywaySnapshot(canonicalLeaseSnapshot) ||
    checkpoint.admissionAckWatermarkHash !==
      admissionAckWatermark.watermarkHash
  ) {
    throw new RangeError(
      'Skyway Reconnect Authority checkpoint binding is invalid.',
    );
  }
  if (
    checkpoint.reconnectAuthorityCheckpointHash !==
      hashSkywaySnapshot(checkpointPayload(checkpoint))
  ) {
    throw new RangeError(
      'Skyway Reconnect Authority checkpoint hash is invalid.',
    );
  }
  return checkpoint;
}

export function assertSkywayReconnectAuthorityCheckpoint(checkpoint) {
  return assertCheckpoint(checkpoint);
}

function createAuthorityCheckpoint({
  sessionIncarnation,
  roundEpoch,
  admissionWindow,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  return createSkywayAuthorityCheckpoint({
    sessionIncarnation,
    roundEpoch,
    admissionWindow,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
}

function currentReconnectCheckpoint({
  sessionIncarnation,
  roundEpoch,
  admissionAckWatermark,
  leaseWindow,
  admissionWindow,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  const authorityCheckpoint = createAuthorityCheckpoint({
    sessionIncarnation,
    roundEpoch,
    admissionWindow,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
  return createSkywayReconnectAuthorityCheckpoint({
    authorityCheckpoint,
    leaseWindow,
    admissionAckWatermark,
  });
}

export function createSkywayReconnectAuthorityCheckpoint({
  authorityCheckpoint,
  leaseWindow,
  admissionAckWatermark,
}) {
  assertSkywayAuthorityCheckpoint(authorityCheckpoint);
  assertSkywayAdmissionAckRestore(admissionAckWatermark, {
    authorityCheckpoint,
  });
  const leaseWindowSnapshot =
    snapshotSkywayReconnectLeaseWindow(leaseWindow);
  const sessionIncarnation =
    authorityCheckpoint.sessionIncarnation;
  const sessionIncarnationHash =
    hashSkywaySnapshot(sessionIncarnation);
  if (
    leaseWindowSnapshot.sessionIncarnationHash !==
      sessionIncarnationHash ||
    leaseWindowSnapshot.roundEpoch !==
      authorityCheckpoint.roundEpoch ||
    leaseWindowSnapshot.rosterHash !== authorityCheckpoint.rosterHash
  ) {
    throw new RangeError(
      'Skyway Reconnect Authority checkpoint lifecycle is not aligned.',
    );
  }

  const payload = {
    version: SKYWAY_RECONNECT_AUTHORITY_CHECKPOINT_VERSION,
    kind: 'skyway-reconnect-authority-checkpoint',
    sessionIncarnation,
    sessionIncarnationHash,
    roundEpoch: authorityCheckpoint.roundEpoch,
    tick: authorityCheckpoint.tick,
    participantIds: [...authorityCheckpoint.participantIds],
    rosterHash: authorityCheckpoint.rosterHash,
    authorityCheckpointHash:
      authorityCheckpoint.authorityCheckpointHash,
    leaseWindowSnapshotHash:
      hashSkywaySnapshot(leaseWindowSnapshot),
    admissionAckWatermarkHash:
      admissionAckWatermark.watermarkHash,
    components: {
      authorityCheckpoint,
      leaseWindowSnapshot,
      admissionAckWatermark,
    },
  };
  return deepFreeze({
    ...payload,
    reconnectAuthorityCheckpointHash: hashSkywaySnapshot(payload),
  });
}

export function restoreSkywayReconnectAuthorityCheckpoint({
  checkpoint,
  expectedTargetReconnectAuthorityHash,
  admissionAckWatermark,
  leaseWindow,
  admissionWindow,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  assertCheckpoint(checkpoint);
  assertSkywayAdmissionAckWatermark(admissionAckWatermark);
  if (
    admissionAckWatermark.watermarkHash !==
      checkpoint.admissionAckWatermarkHash ||
    canonicalizeSkywaySnapshot(admissionAckWatermark) !==
      canonicalizeSkywaySnapshot(
        checkpoint.components.admissionAckWatermark,
      )
  ) {
    throw new RangeError(
      'Skyway Reconnect Authority checkpoint ACK watermark is stale.',
    );
  }
  const sessionIncarnation = checkpoint.sessionIncarnation;
  const roundEpoch = checkpoint.roundEpoch;
  const liveArguments = {
    sessionIncarnation,
    roundEpoch,
    admissionAckWatermark,
    leaseWindow,
    admissionWindow,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  };
  const abortCheckpoint = currentReconnectCheckpoint(liveArguments);
  if (
    typeof expectedTargetReconnectAuthorityHash !== 'string' ||
    abortCheckpoint.reconnectAuthorityCheckpointHash !==
      expectedTargetReconnectAuthorityHash
  ) {
    throw new RangeError(
      'Skyway Reconnect Authority checkpoint target revision is stale.',
    );
  }
  if (!sameOrder(
    abortCheckpoint.participantIds,
    checkpoint.participantIds,
  )) {
    throw new TypeError(
      'Skyway Reconnect Authority checkpoint roster is incompatible.',
    );
  }

  const scratch = cloneAuthorityStack(liveArguments);
  const scratchLease = structuredClone(leaseWindow);
  restoreSkywayAuthorityCheckpoint({
    ...scratch,
    sessionIncarnation,
    roundEpoch,
    checkpoint: checkpoint.components.authorityCheckpoint,
    expectedTargetAuthorityHash:
      abortCheckpoint.authorityCheckpointHash,
    admissionAckWatermark,
  });
  restoreSkywayReconnectLeaseWindow(
    scratchLease,
    checkpoint.components.leaseWindowSnapshot,
    {
      sessionIncarnation,
      roundEpoch,
      expectedTargetLeaseWindowHash:
        abortCheckpoint.leaseWindowSnapshotHash,
    },
  );
  const prepared = createSkywayReconnectAuthorityCheckpoint({
    authorityCheckpoint: createAuthorityCheckpoint({
      ...scratch,
      sessionIncarnation,
      roundEpoch,
    }),
    leaseWindow: scratchLease,
    admissionAckWatermark,
  });
  if (
    prepared.reconnectAuthorityCheckpointHash !==
      checkpoint.reconnectAuthorityCheckpointHash ||
    canonicalizeSkywaySnapshot(prepared) !==
      canonicalizeSkywaySnapshot(checkpoint)
  ) {
    throw new RangeError(
      'Skyway Reconnect Authority checkpoint prepared image is not canonical.',
    );
  }

  const commitTarget = currentReconnectCheckpoint(liveArguments);
  if (
    commitTarget.reconnectAuthorityCheckpointHash !==
      abortCheckpoint.reconnectAuthorityCheckpointHash
  ) {
    throw new RangeError(
      'Skyway Reconnect Authority checkpoint target changed during preparation.',
    );
  }

  const result = deepFreeze({
    version: SKYWAY_RECONNECT_AUTHORITY_CHECKPOINT_VERSION,
    kind: 'skyway-reconnect-authority-checkpoint-restore',
    sessionIncarnation,
    roundEpoch,
    tick: checkpoint.tick,
    previousTick: abortCheckpoint.tick,
    rosterHash: checkpoint.rosterHash,
    previousReconnectAuthorityCheckpointHash:
      abortCheckpoint.reconnectAuthorityCheckpointHash,
    reconnectAuthorityCheckpointHash:
      checkpoint.reconnectAuthorityCheckpointHash,
    previousAuthorityCheckpointHash:
      abortCheckpoint.authorityCheckpointHash,
    authorityCheckpointHash: checkpoint.authorityCheckpointHash,
    previousLeaseWindowSnapshotHash:
      abortCheckpoint.leaseWindowSnapshotHash,
    leaseWindowSnapshotHash: checkpoint.leaseWindowSnapshotHash,
    admissionAckWatermarkHash:
      checkpoint.admissionAckWatermarkHash,
    ackWatermarkAdvanced: false,
    ackWatermarkPublished: false,
  });

  let leaseCommitted = false;
  try {
    restoreSkywayReconnectLeaseWindow(
      leaseWindow,
      checkpoint.components.leaseWindowSnapshot,
      {
        sessionIncarnation,
        roundEpoch,
        expectedTargetLeaseWindowHash:
          abortCheckpoint.leaseWindowSnapshotHash,
      },
    );
    leaseCommitted = true;
    restoreSkywayAuthorityCheckpoint({
      sessionIncarnation,
      roundEpoch,
      checkpoint: checkpoint.components.authorityCheckpoint,
      expectedTargetAuthorityHash:
        abortCheckpoint.authorityCheckpointHash,
      admissionAckWatermark,
      admissionWindow,
      round,
      snapshotHistory,
      commandJournal,
      replayEventLedger,
    });
  } catch (error) {
    if (leaseCommitted) {
      restoreSkywayReconnectLeaseWindow(
        leaseWindow,
        abortCheckpoint.components.leaseWindowSnapshot,
        {
          sessionIncarnation,
          roundEpoch,
          expectedTargetLeaseWindowHash:
            checkpoint.leaseWindowSnapshotHash,
        },
      );
    }
    throw error;
  }

  return result;
}

export function resetSkywayReconnectAuthorityLifecycle({
  baseReconnectAuthorityCheckpoint,
  admissionAckWatermark,
  leaseWindow,
  admissionWindow,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  assertCheckpoint(baseReconnectAuthorityCheckpoint);
  if (
    admissionAckWatermark?.watermarkHash !==
      baseReconnectAuthorityCheckpoint.admissionAckWatermarkHash
  ) {
    throw new RangeError(
      'Skyway Reconnect Authority lifecycle ACK watermark is stale.',
    );
  }
  const sessionIncarnation =
    baseReconnectAuthorityCheckpoint.sessionIncarnation;
  const roundEpoch = baseReconnectAuthorityCheckpoint.roundEpoch;
  const liveArguments = {
    sessionIncarnation,
    roundEpoch,
    admissionAckWatermark,
    leaseWindow,
    admissionWindow,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  };
  const abortCheckpoint = currentReconnectCheckpoint(liveArguments);
  if (
    abortCheckpoint.reconnectAuthorityCheckpointHash !==
      baseReconnectAuthorityCheckpoint
        .reconnectAuthorityCheckpointHash ||
    canonicalizeSkywaySnapshot(abortCheckpoint) !==
      canonicalizeSkywaySnapshot(baseReconnectAuthorityCheckpoint)
  ) {
    throw new RangeError(
      'Skyway Reconnect Authority lifecycle revision is stale.',
    );
  }

  const scratch = cloneAuthorityStack(liveArguments);
  const scratchLease = structuredClone(leaseWindow);
  const authoritativeLifecycle =
    resetSkywayAuthoritativeLifecycle({
      ...scratch,
      sessionIncarnation,
      roundEpoch,
      baseCheckpointBundle:
        baseReconnectAuthorityCheckpoint.components
          .authorityCheckpoint.components.roundCheckpointBundle,
      baseAdmissionSnapshot:
        baseReconnectAuthorityCheckpoint.components
          .authorityCheckpoint.components.admissionSnapshot,
    });
  const nextRoundEpoch = authoritativeLifecycle.roundEpoch;
  const authorityCheckpoint = createAuthorityCheckpoint({
    ...scratch,
    sessionIncarnation,
    roundEpoch: nextRoundEpoch,
  });
  const nextAdmissionAckWatermark =
    createSkywayAdmissionAckWatermark({
      authorityCheckpoint,
    });
  const leaseReset = resetSkywayReconnectLeaseWindow(
    scratchLease,
    {
      sessionIncarnation,
      roundEpoch,
      baseLeaseWindowSnapshot:
        baseReconnectAuthorityCheckpoint.components.leaseWindowSnapshot,
      authorityCheckpoint,
      admissionAckWatermark: nextAdmissionAckWatermark,
    },
  );
  const checkpoint = createSkywayReconnectAuthorityCheckpoint({
    authorityCheckpoint,
    leaseWindow: scratchLease,
    admissionAckWatermark: nextAdmissionAckWatermark,
  });

  const commitTarget = currentReconnectCheckpoint(liveArguments);
  if (
    commitTarget.reconnectAuthorityCheckpointHash !==
      abortCheckpoint.reconnectAuthorityCheckpointHash
  ) {
    throw new RangeError(
      'Skyway Reconnect Authority lifecycle target changed during preparation.',
    );
  }

  const result = deepFreeze({
    version: SKYWAY_RECONNECT_AUTHORITY_CHECKPOINT_VERSION,
    kind: 'skyway-reconnect-authority-lifecycle-reset',
    sessionIncarnation,
    previousRoundEpoch: roundEpoch,
    roundEpoch: nextRoundEpoch,
    previousTick: abortCheckpoint.tick,
    tick: 0,
    previousReconnectAuthorityCheckpointHash:
      abortCheckpoint.reconnectAuthorityCheckpointHash,
    reconnectAuthorityCheckpointHash:
      checkpoint.reconnectAuthorityCheckpointHash,
    previousAuthorityCheckpointHash:
      abortCheckpoint.authorityCheckpointHash,
    authorityCheckpointHash: checkpoint.authorityCheckpointHash,
    previousLeaseWindowSnapshotHash:
      abortCheckpoint.leaseWindowSnapshotHash,
    leaseWindowSnapshotHash: checkpoint.leaseWindowSnapshotHash,
    previousAdmissionAckWatermarkHash:
      admissionAckWatermark.watermarkHash,
    admissionAckWatermarkHash:
      nextAdmissionAckWatermark.watermarkHash,
    clearedActiveLeaseCount: leaseReset.clearedActiveLeaseCount,
    clearedConsumedLeaseCount:
      leaseReset.clearedConsumedLeaseCount,
    ackWatermarkAdvanced: false,
    ackWatermarkPublished: false,
    priorAckFinalityCarriedForward: false,
    authorityCheckpoint,
    admissionAckWatermark: nextAdmissionAckWatermark,
    checkpoint,
    authoritativeLifecycle,
    leaseReset,
  });

  const leaseBackup =
    snapshotSkywayReconnectLeaseWindow(leaseWindow);
  try {
    resetSkywayReconnectLeaseWindow(leaseWindow, {
      sessionIncarnation,
      roundEpoch,
      baseLeaseWindowSnapshot:
        baseReconnectAuthorityCheckpoint.components.leaseWindowSnapshot,
      authorityCheckpoint,
      admissionAckWatermark: nextAdmissionAckWatermark,
    });
    resetSkywayAuthoritativeLifecycle({
      sessionIncarnation,
      roundEpoch,
      baseCheckpointBundle:
        baseReconnectAuthorityCheckpoint.components
          .authorityCheckpoint.components.roundCheckpointBundle,
      baseAdmissionSnapshot:
        baseReconnectAuthorityCheckpoint.components
          .authorityCheckpoint.components.admissionSnapshot,
      admissionWindow,
      round,
      snapshotHistory,
      commandJournal,
      replayEventLedger,
    });
  } catch (error) {
    restoreObjectState(leaseWindow, leaseBackup);
    throw error;
  }

  return result;
}
