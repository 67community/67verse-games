import {
  assertSkywayReconnectAckCommitResult,
} from './skyway-reconnect-ack-commit.js';
import {
  assertSkywayReconnectAckDeliveryFinalityRestore,
} from './skyway-reconnect-ack-delivery-finality.js';
import {
  assertSkywayReconnectAckOutboxSnapshot,
  recordSkywayReconnectAckAdoption,
  resetSkywayReconnectAckOutbox,
  restoreSkywayReconnectAckOutbox,
  snapshotSkywayReconnectAckOutbox,
} from './skyway-reconnect-ack-outbox.js';
import {
  createSkywayAuthorityCheckpoint,
} from './skyway-authority-checkpoint.js';
import {
  assertSkywayReconnectAuthorityCheckpoint,
  createSkywayReconnectAuthorityCheckpoint,
  resetSkywayReconnectAuthorityLifecycle,
  restoreSkywayReconnectAuthorityCheckpoint,
} from './skyway-reconnect-authority-checkpoint.js';
import {
  canonicalizeSkywaySnapshot,
  hashSkywaySnapshot,
} from './skyway-snapshot-history.js';

export const SKYWAY_RECONNECT_FINALITY_CHECKPOINT_VERSION = 1;
export const SKYWAY_RECONNECT_FINALITY_CHECKPOINT_MAX_BYTES =
  512 * 1_024;

const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;
const CHECKPOINT_KEYS = Object.freeze([
  'ackOutboxCapacity',
  'ackOutboxRevision',
  'ackOutboxSnapshotHash',
  'components',
  'kind',
  'participantIds',
  'reconnectAuthorityCheckpointHash',
  'reconnectFinalityCheckpointHash',
  'rosterHash',
  'roundEpoch',
  'sessionIncarnation',
  'sessionIncarnationHash',
  'tick',
  'version',
]);
const COMPONENT_KEYS = Object.freeze([
  'ackOutboxSnapshot',
  'reconnectAuthorityCheckpoint',
]);
const encoder = new TextEncoder();

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
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

function immutableClone(value) {
  return deepFreeze(structuredClone(value));
}

function validHash(value) {
  return typeof value === 'string' && HASH_PATTERN.test(value);
}

function byteLength(value) {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

function sameOrder(first, second) {
  return Array.isArray(first) &&
    Array.isArray(second) &&
    first.length === second.length &&
    first.every((value, index) => value === second[index]);
}

function canonicalEqual(first, second) {
  return canonicalizeSkywaySnapshot(first) ===
    canonicalizeSkywaySnapshot(second);
}

function restoreObjectState(target, source) {
  for (const key of Object.keys(target)) {
    if (!Object.hasOwn(source, key)) delete target[key];
  }
  Object.assign(target, structuredClone(source));
}

function checkpointPayload(checkpoint) {
  const {
    reconnectFinalityCheckpointHash:
      ignoredReconnectFinalityCheckpointHash,
    ...payload
  } = checkpoint;
  return payload;
}

export function assertSkywayReconnectFinalityCheckpoint(
  checkpoint,
) {
  if (
    !exactKeys(checkpoint, CHECKPOINT_KEYS) ||
    checkpoint.version !==
      SKYWAY_RECONNECT_FINALITY_CHECKPOINT_VERSION ||
    checkpoint.kind !==
      'skyway-reconnect-finality-checkpoint' ||
    !exactKeys(checkpoint.components, COMPONENT_KEYS) ||
    typeof checkpoint.sessionIncarnation !== 'string' ||
    !validHash(checkpoint.sessionIncarnationHash) ||
    !Number.isSafeInteger(checkpoint.roundEpoch) ||
    checkpoint.roundEpoch < 1 ||
    !Number.isSafeInteger(checkpoint.tick) ||
    checkpoint.tick < 0 ||
    !Array.isArray(checkpoint.participantIds) ||
    !validHash(checkpoint.rosterHash) ||
    !validHash(checkpoint.reconnectAuthorityCheckpointHash) ||
    !validHash(checkpoint.ackOutboxSnapshotHash) ||
    !Number.isSafeInteger(checkpoint.ackOutboxRevision) ||
    checkpoint.ackOutboxRevision < 0 ||
    !Number.isInteger(checkpoint.ackOutboxCapacity) ||
    checkpoint.ackOutboxCapacity < 1 ||
    !validHash(checkpoint.reconnectFinalityCheckpointHash)
  ) {
    throw new TypeError(
      'Invalid Skyway Reconnect Finality checkpoint.',
    );
  }
  const reconnectAuthorityCheckpoint =
    assertSkywayReconnectAuthorityCheckpoint(
      checkpoint.components.reconnectAuthorityCheckpoint,
    );
  const ackOutboxSnapshot =
    assertSkywayReconnectAckOutboxSnapshot(
      checkpoint.components.ackOutboxSnapshot,
    );
  if (
    checkpoint.sessionIncarnation !==
      reconnectAuthorityCheckpoint.sessionIncarnation ||
    checkpoint.sessionIncarnationHash !==
      reconnectAuthorityCheckpoint.sessionIncarnationHash ||
    checkpoint.roundEpoch !==
      reconnectAuthorityCheckpoint.roundEpoch ||
    checkpoint.roundEpoch !== ackOutboxSnapshot.roundEpoch ||
    checkpoint.tick !== reconnectAuthorityCheckpoint.tick ||
    checkpoint.rosterHash !==
      reconnectAuthorityCheckpoint.rosterHash ||
    checkpoint.rosterHash !== ackOutboxSnapshot.rosterHash ||
    !sameOrder(
      checkpoint.participantIds,
      reconnectAuthorityCheckpoint.participantIds,
    ) ||
    ackOutboxSnapshot.sessionIncarnationHash !==
      checkpoint.sessionIncarnationHash ||
    checkpoint.reconnectAuthorityCheckpointHash !==
      reconnectAuthorityCheckpoint
        .reconnectAuthorityCheckpointHash ||
    ackOutboxSnapshot.adoptedReconnectAuthorityCheckpointHash !==
      checkpoint.reconnectAuthorityCheckpointHash ||
    ackOutboxSnapshot.adoptedAdmissionAckWatermarkHash !==
      reconnectAuthorityCheckpoint.admissionAckWatermarkHash ||
    checkpoint.ackOutboxRevision !== ackOutboxSnapshot.revision ||
    checkpoint.ackOutboxCapacity !== ackOutboxSnapshot.capacity ||
    checkpoint.ackOutboxSnapshotHash !==
      hashSkywaySnapshot(ackOutboxSnapshot)
  ) {
    throw new RangeError(
      'Skyway Reconnect Finality checkpoint binding is invalid.',
    );
  }
  if (
    checkpoint.reconnectFinalityCheckpointHash !==
      hashSkywaySnapshot(checkpointPayload(checkpoint))
  ) {
    throw new RangeError(
      'Skyway Reconnect Finality checkpoint hash is invalid.',
    );
  }
  if (
    byteLength(checkpoint) >
      SKYWAY_RECONNECT_FINALITY_CHECKPOINT_MAX_BYTES
  ) {
    throw new RangeError(
      'Skyway Reconnect Finality checkpoint exceeds its bound.',
    );
  }
  return checkpoint;
}

export function createSkywayReconnectFinalityCheckpoint({
  reconnectAuthorityCheckpoint,
  ackOutbox,
}) {
  const authority = assertSkywayReconnectAuthorityCheckpoint(
    reconnectAuthorityCheckpoint,
  );
  const ackOutboxSnapshot =
    snapshotSkywayReconnectAckOutbox(ackOutbox);
  const payload = {
    version: SKYWAY_RECONNECT_FINALITY_CHECKPOINT_VERSION,
    kind: 'skyway-reconnect-finality-checkpoint',
    sessionIncarnation: authority.sessionIncarnation,
    sessionIncarnationHash: authority.sessionIncarnationHash,
    roundEpoch: authority.roundEpoch,
    tick: authority.tick,
    participantIds: [...authority.participantIds],
    rosterHash: authority.rosterHash,
    reconnectAuthorityCheckpointHash:
      authority.reconnectAuthorityCheckpointHash,
    ackOutboxSnapshotHash:
      hashSkywaySnapshot(ackOutboxSnapshot),
    ackOutboxRevision: ackOutboxSnapshot.revision,
    ackOutboxCapacity: ackOutboxSnapshot.capacity,
    components: {
      reconnectAuthorityCheckpoint: immutableClone(authority),
      ackOutboxSnapshot,
    },
  };
  return assertSkywayReconnectFinalityCheckpoint(deepFreeze({
    ...payload,
    reconnectFinalityCheckpointHash:
      hashSkywaySnapshot(payload),
  }));
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

function liveReconnectAuthorityCheckpoint({
  referenceCheckpoint,
  leaseWindow,
  admissionWindow,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  const authorityCheckpoint = createSkywayAuthorityCheckpoint({
    sessionIncarnation: referenceCheckpoint.sessionIncarnation,
    roundEpoch: referenceCheckpoint.roundEpoch,
    admissionWindow,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
  return createSkywayReconnectAuthorityCheckpoint({
    authorityCheckpoint,
    leaseWindow,
    admissionAckWatermark:
      referenceCheckpoint.components.admissionAckWatermark,
  });
}

function assertLiveAggregate({
  checkpoint,
  ackOutbox,
  leaseWindow,
  admissionWindow,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  const currentOutbox =
    snapshotSkywayReconnectAckOutbox(ackOutbox);
  if (
    hashSkywaySnapshot(currentOutbox) !==
      checkpoint.ackOutboxSnapshotHash ||
    !canonicalEqual(
      currentOutbox,
      checkpoint.components.ackOutboxSnapshot,
    )
  ) {
    throw new RangeError(
      'Skyway Reconnect Finality outbox revision is stale.',
    );
  }
  const currentAuthority = liveReconnectAuthorityCheckpoint({
    referenceCheckpoint:
      checkpoint.components.reconnectAuthorityCheckpoint,
    leaseWindow,
    admissionWindow,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
  if (
    currentAuthority.reconnectAuthorityCheckpointHash !==
      checkpoint.reconnectAuthorityCheckpointHash ||
    !canonicalEqual(
      currentAuthority,
      checkpoint.components.reconnectAuthorityCheckpoint,
    )
  ) {
    throw new RangeError(
      'Skyway Reconnect Finality Authority revision is stale.',
    );
  }
  return {
    ackOutboxSnapshot: currentOutbox,
    reconnectAuthorityCheckpoint: currentAuthority,
  };
}

export function adoptSkywayReconnectFinalityAck({
  baseCheckpoint,
  ackCommit,
  ackOutbox,
}) {
  const base = assertSkywayReconnectFinalityCheckpoint(
    baseCheckpoint,
  );
  const commit = assertSkywayReconnectAckCommitResult(ackCommit);
  const currentOutbox =
    snapshotSkywayReconnectAckOutbox(ackOutbox);
  if (
    hashSkywaySnapshot(currentOutbox) !==
      base.ackOutboxSnapshotHash ||
    !canonicalEqual(
      currentOutbox,
      base.components.ackOutboxSnapshot,
    )
  ) {
    throw new RangeError(
      'Skyway Reconnect Finality adoption base is stale.',
    );
  }
  const baseAuthority =
    base.components.reconnectAuthorityCheckpoint;
  if (
    commit.sessionIncarnationHash !==
      base.sessionIncarnationHash ||
    commit.roundEpoch !== base.roundEpoch ||
    (
      commit.previousReconnectAuthorityCheckpointHash !==
        base.reconnectAuthorityCheckpointHash &&
      commit.reconnectAuthorityCheckpointHash !==
        base.reconnectAuthorityCheckpointHash
    )
  ) {
    throw new RangeError(
      'Skyway Reconnect Finality adoption transition is stale.',
    );
  }

  const scratchOutbox = structuredClone(ackOutbox);
  const adoption = recordSkywayReconnectAckAdoption(
    scratchOutbox,
    {
      ackCommit: commit,
      currentReconnectAuthorityCheckpoint: baseAuthority,
      expectedRevision: base.ackOutboxRevision,
      expectedAdoptedReconnectAuthorityCheckpointHash:
        base.reconnectAuthorityCheckpointHash,
    },
  );
  const preparedCheckpoint =
    createSkywayReconnectFinalityCheckpoint({
      reconnectAuthorityCheckpoint: commit.checkpoint,
      ackOutbox: scratchOutbox,
    });
  const commitTarget =
    snapshotSkywayReconnectAckOutbox(ackOutbox);
  if (
    hashSkywaySnapshot(commitTarget) !==
      base.ackOutboxSnapshotHash ||
    !canonicalEqual(
      commitTarget,
      base.components.ackOutboxSnapshot,
    )
  ) {
    throw new RangeError(
      'Skyway Reconnect Finality adoption target changed during preparation.',
    );
  }

  const liveAdoption = recordSkywayReconnectAckAdoption(
    ackOutbox,
    {
      ackCommit: commit,
      currentReconnectAuthorityCheckpoint: baseAuthority,
      expectedRevision: base.ackOutboxRevision,
      expectedAdoptedReconnectAuthorityCheckpointHash:
        base.reconnectAuthorityCheckpointHash,
    },
  );
  const checkpoint = createSkywayReconnectFinalityCheckpoint({
    reconnectAuthorityCheckpoint: commit.checkpoint,
    ackOutbox,
  });
  if (
    !canonicalEqual(liveAdoption, adoption) ||
    !canonicalEqual(checkpoint, preparedCheckpoint)
  ) {
    throw new RangeError(
      'Skyway Reconnect Finality adoption commit diverged.',
    );
  }
  const changed =
    checkpoint.reconnectFinalityCheckpointHash !==
      base.reconnectFinalityCheckpointHash;
  const payload = {
    version: SKYWAY_RECONNECT_FINALITY_CHECKPOINT_VERSION,
    kind: 'skyway-reconnect-finality-ack-adoption',
    sessionIncarnationHash: checkpoint.sessionIncarnationHash,
    roundEpoch: checkpoint.roundEpoch,
    tick: checkpoint.tick,
    previousReconnectFinalityCheckpointHash:
      base.reconnectFinalityCheckpointHash,
    reconnectFinalityCheckpointHash:
      checkpoint.reconnectFinalityCheckpointHash,
    previousReconnectAuthorityCheckpointHash:
      base.reconnectAuthorityCheckpointHash,
    reconnectAuthorityCheckpointHash:
      checkpoint.reconnectAuthorityCheckpointHash,
    previousAckOutboxSnapshotHash:
      base.ackOutboxSnapshotHash,
    ackOutboxSnapshotHash: checkpoint.ackOutboxSnapshotHash,
    previousAckOutboxRevision: base.ackOutboxRevision,
    ackOutboxRevision: checkpoint.ackOutboxRevision,
    ackCommitTransactionHash: commit.transactionHash,
    adoptionHash: adoption.adoptionHash,
    changed,
    durablyAdopted: false,
    ackDelivered: false,
    receiptRecorded: false,
    eventsCommitted: false,
    suppressPresentation: true,
    adoption,
    checkpoint,
  };
  return deepFreeze({
    ...payload,
    transactionHash: hashSkywaySnapshot(payload),
  });
}

function syntheticReconnectAuthorityHead({
  targetCheckpoint,
  leaseWindow,
  admissionWindow,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  return liveReconnectAuthorityCheckpoint({
    referenceCheckpoint: targetCheckpoint,
    leaseWindow,
    admissionWindow,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
}

function restoreAuthorityToTarget({
  targetCheckpoint,
  leaseWindow,
  admissionWindow,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  const syntheticHead = syntheticReconnectAuthorityHead({
    targetCheckpoint,
    leaseWindow,
    admissionWindow,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
  return restoreSkywayReconnectAuthorityCheckpoint({
    checkpoint: targetCheckpoint,
    expectedTargetReconnectAuthorityHash:
      syntheticHead.reconnectAuthorityCheckpointHash,
    admissionAckWatermark:
      targetCheckpoint.components.admissionAckWatermark,
    leaseWindow,
    admissionWindow,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
}

export function restoreSkywayReconnectFinalityCheckpoint({
  checkpoint,
  currentReconnectAuthorityCheckpoint,
  expectedTargetReconnectFinalityCheckpointHash,
  ackDeliveryFinalityWatermark = null,
  ackOutbox,
  leaseWindow,
  admissionWindow,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  const target = assertSkywayReconnectFinalityCheckpoint(checkpoint);
  const currentAuthority =
    assertSkywayReconnectAuthorityCheckpoint(
      currentReconnectAuthorityCheckpoint,
    );
  const current = createSkywayReconnectFinalityCheckpoint({
    reconnectAuthorityCheckpoint: currentAuthority,
    ackOutbox,
  });
  if (
    typeof expectedTargetReconnectFinalityCheckpointHash !==
      'string' ||
    current.reconnectFinalityCheckpointHash !==
      expectedTargetReconnectFinalityCheckpointHash
  ) {
    throw new RangeError(
      'Skyway Reconnect Finality restore target is stale.',
    );
  }
  if (
    target.sessionIncarnationHash !==
      current.sessionIncarnationHash ||
    target.roundEpoch !== current.roundEpoch ||
    target.rosterHash !== current.rosterHash ||
    target.ackOutboxCapacity !== current.ackOutboxCapacity
  ) {
    throw new RangeError(
      'Skyway Reconnect Finality restore configuration is not aligned.',
    );
  }
  assertLiveAggregate({
    checkpoint: current,
    ackOutbox,
    leaseWindow,
    admissionWindow,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
  if (ackDeliveryFinalityWatermark !== null) {
    assertSkywayReconnectAckDeliveryFinalityRestore(
      ackDeliveryFinalityWatermark,
      { reconnectFinalityCheckpoint: current },
    );
    assertSkywayReconnectAckDeliveryFinalityRestore(
      ackDeliveryFinalityWatermark,
      { reconnectFinalityCheckpoint: target },
    );
  }

  const scratch = cloneAuthorityStack({
    admissionWindow,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
  const scratchLease = structuredClone(leaseWindow);
  const scratchOutbox = structuredClone(ackOutbox);
  const outboxRestore = restoreSkywayReconnectAckOutbox(
    scratchOutbox,
    target.components.ackOutboxSnapshot,
    {
      expectedTargetSnapshotHash:
        current.ackOutboxSnapshotHash,
    },
  );
  const authorityRestore = restoreAuthorityToTarget({
    targetCheckpoint:
      target.components.reconnectAuthorityCheckpoint,
    leaseWindow: scratchLease,
    ...scratch,
  });
  const prepared = createSkywayReconnectFinalityCheckpoint({
    reconnectAuthorityCheckpoint:
      target.components.reconnectAuthorityCheckpoint,
    ackOutbox: scratchOutbox,
  });
  if (!canonicalEqual(prepared, target)) {
    throw new RangeError(
      'Skyway Reconnect Finality restore image is not canonical.',
    );
  }
  const commitTarget = createSkywayReconnectFinalityCheckpoint({
    reconnectAuthorityCheckpoint: currentAuthority,
    ackOutbox,
  });
  assertLiveAggregate({
    checkpoint: commitTarget,
    ackOutbox,
    leaseWindow,
    admissionWindow,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
  if (
    commitTarget.reconnectFinalityCheckpointHash !==
      current.reconnectFinalityCheckpointHash
  ) {
    throw new RangeError(
      'Skyway Reconnect Finality restore target changed during preparation.',
    );
  }

  const abortOutbox = snapshotSkywayReconnectAckOutbox(ackOutbox);
  let outboxCommitted = false;
  try {
    restoreSkywayReconnectAckOutbox(
      ackOutbox,
      target.components.ackOutboxSnapshot,
      {
        expectedTargetSnapshotHash:
          current.ackOutboxSnapshotHash,
      },
    );
    outboxCommitted = true;
    restoreAuthorityToTarget({
      targetCheckpoint:
        target.components.reconnectAuthorityCheckpoint,
      leaseWindow,
      admissionWindow,
      round,
      snapshotHistory,
      commandJournal,
      replayEventLedger,
    });
  } catch (error) {
    if (outboxCommitted) {
      restoreSkywayReconnectAckOutbox(
        ackOutbox,
        abortOutbox,
        {
          expectedTargetSnapshotHash:
            target.ackOutboxSnapshotHash,
        },
      );
    }
    throw error;
  }

  const resultPayload = {
    version: SKYWAY_RECONNECT_FINALITY_CHECKPOINT_VERSION,
    kind: 'skyway-reconnect-finality-checkpoint-restore',
    sessionIncarnationHash: target.sessionIncarnationHash,
    roundEpoch: target.roundEpoch,
    previousTick: current.tick,
    tick: target.tick,
    previousReconnectFinalityCheckpointHash:
      current.reconnectFinalityCheckpointHash,
    reconnectFinalityCheckpointHash:
      target.reconnectFinalityCheckpointHash,
    previousReconnectAuthorityCheckpointHash:
      current.reconnectAuthorityCheckpointHash,
    reconnectAuthorityCheckpointHash:
      target.reconnectAuthorityCheckpointHash,
    previousAckOutboxSnapshotHash:
      current.ackOutboxSnapshotHash,
    ackOutboxSnapshotHash: target.ackOutboxSnapshotHash,
    previousAckOutboxRevision: current.ackOutboxRevision,
    ackOutboxRevision: target.ackOutboxRevision,
    changed:
      current.reconnectFinalityCheckpointHash !==
        target.reconnectFinalityCheckpointHash,
    ackDelivered: false,
    receiptRecorded: false,
    suppressPresentation: true,
    outboxRestore,
    authorityRestore,
    checkpoint: target,
  };
  return deepFreeze({
    ...resultPayload,
    transactionHash: hashSkywaySnapshot(resultPayload),
  });
}

export function resetSkywayReconnectFinalityLifecycle({
  baseCheckpoint,
  ackOutbox,
  leaseWindow,
  admissionWindow,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  const base = assertSkywayReconnectFinalityCheckpoint(
    baseCheckpoint,
  );
  assertLiveAggregate({
    checkpoint: base,
    ackOutbox,
    leaseWindow,
    admissionWindow,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
  const baseAuthority =
    base.components.reconnectAuthorityCheckpoint;
  const scratch = cloneAuthorityStack({
    admissionWindow,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
  const scratchLease = structuredClone(leaseWindow);
  const scratchOutbox = structuredClone(ackOutbox);
  const authorityLifecycle =
    resetSkywayReconnectAuthorityLifecycle({
      baseReconnectAuthorityCheckpoint: baseAuthority,
      admissionAckWatermark:
        baseAuthority.components.admissionAckWatermark,
      leaseWindow: scratchLease,
      ...scratch,
    });
  const outboxReset = resetSkywayReconnectAckOutbox(
    scratchOutbox,
    {
      baseOutboxSnapshot:
        base.components.ackOutboxSnapshot,
      previousReconnectAuthorityCheckpoint: baseAuthority,
      nextReconnectAuthorityCheckpoint:
        authorityLifecycle.checkpoint,
    },
  );
  const prepared = createSkywayReconnectFinalityCheckpoint({
    reconnectAuthorityCheckpoint: authorityLifecycle.checkpoint,
    ackOutbox: scratchOutbox,
  });

  const commitTarget = createSkywayReconnectFinalityCheckpoint({
    reconnectAuthorityCheckpoint: baseAuthority,
    ackOutbox,
  });
  assertLiveAggregate({
    checkpoint: commitTarget,
    ackOutbox,
    leaseWindow,
    admissionWindow,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
  if (
    commitTarget.reconnectFinalityCheckpointHash !==
      base.reconnectFinalityCheckpointHash
  ) {
    throw new RangeError(
      'Skyway Reconnect Finality lifecycle target changed during preparation.',
    );
  }

  const abortOutbox = snapshotSkywayReconnectAckOutbox(ackOutbox);
  try {
    resetSkywayReconnectAckOutbox(ackOutbox, {
      baseOutboxSnapshot: abortOutbox,
      previousReconnectAuthorityCheckpoint: baseAuthority,
      nextReconnectAuthorityCheckpoint:
        authorityLifecycle.checkpoint,
    });
    resetSkywayReconnectAuthorityLifecycle({
      baseReconnectAuthorityCheckpoint: baseAuthority,
      admissionAckWatermark:
        baseAuthority.components.admissionAckWatermark,
      leaseWindow,
      admissionWindow,
      round,
      snapshotHistory,
      commandJournal,
      replayEventLedger,
    });
  } catch (error) {
    restoreObjectState(ackOutbox, abortOutbox);
    throw error;
  }

  const checkpoint = createSkywayReconnectFinalityCheckpoint({
    reconnectAuthorityCheckpoint: authorityLifecycle.checkpoint,
    ackOutbox,
  });
  if (!canonicalEqual(checkpoint, prepared)) {
    throw new RangeError(
      'Skyway Reconnect Finality lifecycle commit diverged.',
    );
  }
  const payload = {
    version: SKYWAY_RECONNECT_FINALITY_CHECKPOINT_VERSION,
    kind: 'skyway-reconnect-finality-lifecycle-reset',
    sessionIncarnationHash: checkpoint.sessionIncarnationHash,
    previousRoundEpoch: base.roundEpoch,
    roundEpoch: checkpoint.roundEpoch,
    previousTick: base.tick,
    tick: checkpoint.tick,
    previousReconnectFinalityCheckpointHash:
      base.reconnectFinalityCheckpointHash,
    reconnectFinalityCheckpointHash:
      checkpoint.reconnectFinalityCheckpointHash,
    previousReconnectAuthorityCheckpointHash:
      base.reconnectAuthorityCheckpointHash,
    reconnectAuthorityCheckpointHash:
      checkpoint.reconnectAuthorityCheckpointHash,
    previousAckOutboxSnapshotHash:
      base.ackOutboxSnapshotHash,
    ackOutboxSnapshotHash: checkpoint.ackOutboxSnapshotHash,
    previousAckOutboxRevision: base.ackOutboxRevision,
    ackOutboxRevision: checkpoint.ackOutboxRevision,
    pendingDeliveryFinalized: false,
    ackDelivered: false,
    receiptRecorded: false,
    suppressPresentation: true,
    authorityLifecycle,
    outboxReset,
    checkpoint,
  };
  return deepFreeze({
    ...payload,
    transactionHash: hashSkywaySnapshot(payload),
  });
}
