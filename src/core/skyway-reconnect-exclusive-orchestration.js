import {
  commitSkywayReconnectAck,
} from './skyway-reconnect-ack-commit.js';
import {
  assertSkywayReconnectAckDeliveryFinalityWatermark,
} from './skyway-reconnect-ack-delivery-finality.js';
import {
  restoreSkywayReconnectAckOutbox,
} from './skyway-reconnect-ack-outbox.js';
import {
  createSkywayReconnectAuthorityCheckpoint,
  restoreSkywayReconnectAuthorityCheckpoint,
} from './skyway-reconnect-authority-checkpoint.js';
import {
  createSkywayAuthorityCheckpoint,
} from './skyway-authority-checkpoint.js';
import {
  applySkywayAuthoritativeReconnectCorrection,
} from './skyway-authoritative-reconnect-correction.js';
import {
  assertSkywayReconnectFinalityCheckpoint,
  createSkywayReconnectFinalityCheckpoint,
} from './skyway-reconnect-finality-checkpoint.js';
import {
  reserveSkywayReconnectLeaseFinality,
} from './skyway-reconnect-lease-finality-reservation.js';
import {
  adoptSequentialSkywayReconnectAck,
} from './skyway-reconnect-sequential-ack-adoption.js';
import {
  canonicalizeSkywaySnapshot,
  hashSkywaySnapshot,
} from './skyway-snapshot-history.js';

export const SKYWAY_RECONNECT_EXCLUSIVE_ORCHESTRATION_VERSION = 1;
export const SKYWAY_RECONNECT_EXCLUSIVE_ORCHESTRATION_MAX_BYTES =
  640 * 1_024;

const encoder = new TextEncoder();

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function canonicalEqual(first, second) {
  return canonicalizeSkywaySnapshot(first) ===
    canonicalizeSkywaySnapshot(second);
}

function byteLength(value) {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

function cloneTargets({
  leaseWindow,
  admissionWindow,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
  ackOutbox,
}) {
  return {
    leaseWindow: structuredClone(leaseWindow),
    admissionWindow: structuredClone(admissionWindow),
    round: structuredClone(round),
    snapshotHistory: structuredClone(snapshotHistory),
    commandJournal: structuredClone(commandJournal),
    replayEventLedger: structuredClone(replayEventLedger),
    ackOutbox: structuredClone(ackOutbox),
  };
}

function prepareOrchestration({
  base,
  watermark,
  authenticatedOwnerId,
  directive,
  resyncSnapshot,
  command,
  environmentForRound,
  targets,
}) {
  const reservation = reserveSkywayReconnectLeaseFinality({
    baseCheckpoint: base,
    expectedReconnectFinalityCheckpointHash:
      base.reconnectFinalityCheckpointHash,
    ackDeliveryFinalityWatermark: watermark,
    expectedAckDeliveryFinalityWatermarkHash:
      watermark.watermarkHash,
    authenticatedOwnerId,
    directive,
    resyncSnapshot,
    leaseWindow: targets.leaseWindow,
    ackOutbox: targets.ackOutbox,
  });
  const reservationAuthority =
    reservation.checkpoint.components
      .reconnectAuthorityCheckpoint;
  const authorityCheckpoint =
    reservationAuthority.components.authorityCheckpoint;
  const admissionAckWatermark =
    reservationAuthority.components.admissionAckWatermark;
  const correction = applySkywayAuthoritativeReconnectCorrection({
    authenticatedOwnerId,
    lease: reservation.lease,
    command,
    authorityCheckpoint,
    admissionAckWatermark,
    baseLeaseWindowSnapshot:
      reservationAuthority.components.leaseWindowSnapshot,
    baseAdmissionSnapshot:
      authorityCheckpoint.components.admissionSnapshot,
    environmentForRound,
    leaseWindow: targets.leaseWindow,
    admissionWindow: targets.admissionWindow,
    round: targets.round,
    snapshotHistory: targets.snapshotHistory,
    commandJournal: targets.commandJournal,
    replayEventLedger: targets.replayEventLedger,
  });
  const postCorrection =
    createSkywayReconnectAuthorityCheckpoint({
      authorityCheckpoint: correction.authorityCheckpoint,
      leaseWindow: targets.leaseWindow,
      admissionAckWatermark,
    });
  const ackCommit = commitSkywayReconnectAck({
    reconnectCorrection: correction,
    reconnectAuthorityCheckpoint: postCorrection,
    expectedReconnectAuthorityCheckpointHash:
      postCorrection.reconnectAuthorityCheckpointHash,
  });
  const sequentialAdoption = adoptSequentialSkywayReconnectAck({
    baseCheckpoint: reservation.checkpoint,
    expectedReconnectFinalityCheckpointHash:
      reservation.reconnectFinalityCheckpointHash,
    reconnectCorrection: correction,
    postCorrectionReconnectAuthorityCheckpoint:
      postCorrection,
    ackCommit,
    ackDeliveryFinalityWatermark: watermark,
    expectedAckDeliveryFinalityWatermarkHash:
      watermark.watermarkHash,
    ackOutbox: targets.ackOutbox,
  });
  const checkpoint =
    sequentialAdoption.receiptAwareAdoption.checkpoint;
  return {
    reservation,
    correction,
    postCorrection,
    ackCommit,
    sequentialAdoption,
    checkpoint,
  };
}

function restoreAuthority({
  checkpoint,
  expectedTargetReconnectAuthorityHash,
  targets,
}) {
  return restoreSkywayReconnectAuthorityCheckpoint({
    checkpoint,
    expectedTargetReconnectAuthorityHash,
    admissionAckWatermark:
      checkpoint.components.admissionAckWatermark,
    leaseWindow: targets.leaseWindow,
    admissionWindow: targets.admissionWindow,
    round: targets.round,
    snapshotHistory: targets.snapshotHistory,
    commandJournal: targets.commandJournal,
    replayEventLedger: targets.replayEventLedger,
  });
}

function restoreOutbox({
  snapshot,
  expectedTargetSnapshotHash,
  targets,
}) {
  return restoreSkywayReconnectAckOutbox(
    targets.ackOutbox,
    snapshot,
    { expectedTargetSnapshotHash },
  );
}

function liveFinality(base, admissionAckWatermark, targets) {
  const authorityCheckpoint = createSkywayAuthorityCheckpoint({
    sessionIncarnation: base.sessionIncarnation,
    roundEpoch: base.roundEpoch,
    admissionWindow: targets.admissionWindow,
    round: targets.round,
    snapshotHistory: targets.snapshotHistory,
    commandJournal: targets.commandJournal,
    replayEventLedger: targets.replayEventLedger,
  });
  const reconnectAuthorityCheckpoint =
    createSkywayReconnectAuthorityCheckpoint({
      authorityCheckpoint,
      leaseWindow: targets.leaseWindow,
      admissionAckWatermark,
    });
  return createSkywayReconnectFinalityCheckpoint({
    reconnectAuthorityCheckpoint,
    ackOutbox: targets.ackOutbox,
  });
}

function assertLiveFinality({
  expected,
  admissionAckWatermark,
  targets,
  label,
}) {
  const current = liveFinality(
    expected,
    admissionAckWatermark,
    targets,
  );
  if (!canonicalEqual(current, expected)) {
    throw new RangeError(
      `Skyway exclusive Reconnect orchestration ${label} image is stale.`,
    );
  }
  return current;
}

function restorePreparedImages({
  base,
  prepared,
  targets,
}) {
  const authorityRestore = restoreAuthority({
    checkpoint: prepared.postCorrection,
    expectedTargetReconnectAuthorityHash:
      base.reconnectAuthorityCheckpointHash,
    targets,
  });
  let outboxRestore;
  try {
    outboxRestore = restoreOutbox({
      snapshot:
        prepared.checkpoint.components.ackOutboxSnapshot,
      expectedTargetSnapshotHash: base.ackOutboxSnapshotHash,
      targets,
    });
  } catch (error) {
    restoreAuthority({
      checkpoint:
        base.components.reconnectAuthorityCheckpoint,
      expectedTargetReconnectAuthorityHash:
        prepared.postCorrection
          .reconnectAuthorityCheckpointHash,
      targets,
    });
    throw error;
  }
  return { authorityRestore, outboxRestore };
}

function restoreAbortImages({
  base,
  prepared,
  targets,
}) {
  restoreOutbox({
    snapshot: base.components.ackOutboxSnapshot,
    expectedTargetSnapshotHash:
      prepared.checkpoint.ackOutboxSnapshotHash,
    targets,
  });
  restoreAuthority({
    checkpoint:
      base.components.reconnectAuthorityCheckpoint,
    expectedTargetReconnectAuthorityHash:
      prepared.postCorrection.reconnectAuthorityCheckpointHash,
    targets,
  });
}

export function applySkywayExclusiveReconnectOrchestration({
  baseCheckpoint,
  expectedReconnectFinalityCheckpointHash,
  ackDeliveryFinalityWatermark,
  expectedAckDeliveryFinalityWatermarkHash,
  authenticatedOwnerId,
  directive,
  resyncSnapshot,
  command,
  environmentForRound,
  leaseWindow,
  admissionWindow,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
  ackOutbox,
}) {
  const base = assertSkywayReconnectFinalityCheckpoint(
    baseCheckpoint,
  );
  const watermark =
    assertSkywayReconnectAckDeliveryFinalityWatermark(
      ackDeliveryFinalityWatermark,
    );
  if (
    expectedReconnectFinalityCheckpointHash !==
      base.reconnectFinalityCheckpointHash
  ) {
    throw new RangeError(
      'Skyway exclusive Reconnect orchestration Finality head is stale.',
    );
  }
  if (
    expectedAckDeliveryFinalityWatermarkHash !==
      watermark.watermarkHash
  ) {
    throw new RangeError(
      'Skyway exclusive Reconnect orchestration Delivery Finality head is stale.',
    );
  }

  const targets = {
    leaseWindow,
    admissionWindow,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
    ackOutbox,
  };
  const scratch = cloneTargets(targets);
  const prepared = prepareOrchestration({
    base,
    watermark,
    authenticatedOwnerId,
    directive,
    resyncSnapshot,
    command,
    environmentForRound,
    targets: scratch,
  });

  // Prove both the forward commit and reverse abort across the existing
  // Authority and Outbox restore Seams before any live target is changed.
  const proofTargets = cloneTargets(targets);
  assertLiveFinality({
    expected: base,
    admissionAckWatermark:
      base.components.reconnectAuthorityCheckpoint
        .components.admissionAckWatermark,
    targets: proofTargets,
    label: 'proof base',
  });
  const preparedRestores = restorePreparedImages({
    base,
    prepared,
    targets: proofTargets,
  });
  assertLiveFinality({
    expected: prepared.checkpoint,
    admissionAckWatermark:
      prepared.ackCommit.admissionAckWatermark,
    targets: proofTargets,
    label: 'proof final',
  });
  restoreAbortImages({
    base,
    prepared,
    targets: proofTargets,
  });
  assertLiveFinality({
    expected: base,
    admissionAckWatermark:
      base.components.reconnectAuthorityCheckpoint
        .components.admissionAckWatermark,
    targets: proofTargets,
    label: 'proof abort',
  });

  const finalAuthority =
    prepared.checkpoint.components.reconnectAuthorityCheckpoint;
  const payload = {
    version: SKYWAY_RECONNECT_EXCLUSIVE_ORCHESTRATION_VERSION,
    kind: 'skyway-reconnect-exclusive-orchestration',
    sessionIncarnationHash: base.sessionIncarnationHash,
    roundEpoch: base.roundEpoch,
    tick: base.tick,
    ownerId: prepared.reservation.ownerId,
    directiveHash: prepared.reservation.directiveHash,
    resyncSnapshotHash:
      prepared.reservation.resyncSnapshotHash,
    leaseHash: prepared.reservation.leaseHash,
    previousReconnectFinalityCheckpointHash:
      base.reconnectFinalityCheckpointHash,
    reservationReconnectFinalityCheckpointHash:
      prepared.reservation
        .reconnectFinalityCheckpointHash,
    reconnectFinalityCheckpointHash:
      prepared.checkpoint.reconnectFinalityCheckpointHash,
    previousReconnectAuthorityCheckpointHash:
      base.reconnectAuthorityCheckpointHash,
    reservationReconnectAuthorityCheckpointHash:
      prepared.reservation.reconnectAuthorityCheckpointHash,
    postCorrectionReconnectAuthorityCheckpointHash:
      prepared.postCorrection.reconnectAuthorityCheckpointHash,
    reconnectAuthorityCheckpointHash:
      finalAuthority.reconnectAuthorityCheckpointHash,
    previousAdmissionAckWatermarkHash:
      base.components.reconnectAuthorityCheckpoint
        .admissionAckWatermarkHash,
    admissionAckWatermarkHash:
      finalAuthority.admissionAckWatermarkHash,
    ackDeliveryFinalityWatermarkHash: watermark.watermarkHash,
    previousLeaseRevision:
      prepared.reservation.previousLeaseRevision,
    reservedLeaseRevision:
      prepared.reservation.leaseRevision,
    leaseRevision:
      finalAuthority.components.leaseWindowSnapshot.revision,
    previousAckOutboxRevision: base.ackOutboxRevision,
    reservationAckOutboxRevision:
      prepared.reservation.ackOutboxRevision,
    bridgeAckOutboxRevision:
      prepared.sequentialAdoption.bridgeAckOutboxRevision,
    ackOutboxRevision: prepared.checkpoint.ackOutboxRevision,
    reservationTransactionHash:
      prepared.reservation.transactionHash,
    correctionTransactionHash:
      prepared.correction.transactionHash,
    ackCommitTransactionHash:
      prepared.ackCommit.transactionHash,
    sequentialAdoptionTransactionHash:
      prepared.sequentialAdoption.transactionHash,
    authorityRestoreHash:
      hashSkywaySnapshot(preparedRestores.authorityRestore),
    outboxRestoreHash:
      hashSkywaySnapshot(preparedRestores.outboxRestore),
    admissionBatchHash: prepared.correction.admissionBatchHash,
    adoptionHash: prepared.sequentialAdoption.adoptionHash,
    reservationApplied:
      prepared.reservation.reservationChanged,
    correctionApplied: true,
    ackCommitCreatedByTransaction: true,
    ackCommitted: true,
    ackAdopted: true,
    authorityAndOutboxAdopted: true,
    deliveryFinalityAdvanced: false,
    receiptFinalityAdvanced: false,
    eventsCommitted: false,
    storagePerformed: false,
    sendPerformed: false,
    receiptAcquired: false,
    suppressPresentation: true,
    checkpoint: prepared.checkpoint,
  };
  const result = deepFreeze({
    ...payload,
    transactionHash: hashSkywaySnapshot(payload),
  });
  if (
    byteLength(result) >
      SKYWAY_RECONNECT_EXCLUSIVE_ORCHESTRATION_MAX_BYTES
  ) {
    throw new RangeError(
      'Skyway exclusive Reconnect orchestration exceeds its bound.',
    );
  }

  assertLiveFinality({
    expected: base,
    admissionAckWatermark:
      base.components.reconnectAuthorityCheckpoint
        .components.admissionAckWatermark,
    targets,
    label: 'commit base',
  });
  let committedImages = false;
  try {
    const committedRestores = restorePreparedImages({
      base,
      prepared,
      targets,
    });
    committedImages = true;
    if (!canonicalEqual(
      committedRestores,
      preparedRestores,
    )) {
      throw new RangeError(
        'Skyway exclusive Reconnect orchestration restore diverged.',
      );
    }
    assertLiveFinality({
      expected: prepared.checkpoint,
      admissionAckWatermark:
        prepared.ackCommit.admissionAckWatermark,
      targets,
      label: 'committed final',
    });
  } catch (error) {
    if (committedImages) {
      restoreAbortImages({
        base,
        prepared,
        targets,
      });
    }
    throw error;
  }
  return result;
}
