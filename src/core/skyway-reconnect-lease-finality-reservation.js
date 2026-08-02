import {
  assertSkywayReconnectAckDeliveryFinalityRestore,
  assertSkywayReconnectAckDeliveryFinalityWatermark,
} from './skyway-reconnect-ack-delivery-finality.js';
import {
  assertSkywayReconnectAckOutboxSnapshot,
  restoreSkywayReconnectAckOutbox,
  snapshotSkywayReconnectAckOutbox,
} from './skyway-reconnect-ack-outbox.js';
import {
  createSkywayReconnectAuthorityCheckpoint,
} from './skyway-reconnect-authority-checkpoint.js';
import {
  assertSkywayReconnectFinalityCheckpoint,
  createSkywayReconnectFinalityCheckpoint,
} from './skyway-reconnect-finality-checkpoint.js';
import {
  reserveSkywayReconnectLease,
  restoreSkywayReconnectLeaseWindow,
  snapshotSkywayReconnectLeaseWindow,
} from './skyway-reconnect-lease.js';
import {
  canonicalizeSkywaySnapshot,
  hashSkywaySnapshot,
} from './skyway-snapshot-history.js';

export const SKYWAY_RECONNECT_LEASE_FINALITY_RESERVATION_VERSION = 1;
export const SKYWAY_RECONNECT_LEASE_FINALITY_RESERVATION_MAX_BYTES =
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

function assertExactCas({
  base,
  watermark,
  expectedReconnectFinalityCheckpointHash,
  expectedAckDeliveryFinalityWatermarkHash,
}) {
  if (
    typeof expectedReconnectFinalityCheckpointHash !== 'string' ||
    expectedReconnectFinalityCheckpointHash !==
      base.reconnectFinalityCheckpointHash
  ) {
    throw new RangeError(
      'Skyway Reconnect Lease Finality head is stale.',
    );
  }
  if (
    typeof expectedAckDeliveryFinalityWatermarkHash !== 'string' ||
    expectedAckDeliveryFinalityWatermarkHash !==
      watermark.watermarkHash
  ) {
    throw new RangeError(
      'Skyway Reconnect Lease Delivery Finality head is stale.',
    );
  }
}

function assertLiveLease(baseAuthority, leaseWindow) {
  const snapshot = snapshotSkywayReconnectLeaseWindow(leaseWindow);
  if (
    hashSkywaySnapshot(snapshot) !==
      baseAuthority.leaseWindowSnapshotHash ||
    !canonicalEqual(
      snapshot,
      baseAuthority.components.leaseWindowSnapshot,
    )
  ) {
    throw new RangeError(
      'Skyway Reconnect Lease Finality Lease head is stale.',
    );
  }
  return snapshot;
}

function assertLiveOutbox(base, ackOutbox) {
  const snapshot = snapshotSkywayReconnectAckOutbox(ackOutbox);
  if (
    hashSkywaySnapshot(snapshot) !== base.ackOutboxSnapshotHash ||
    !canonicalEqual(
      snapshot,
      base.components.ackOutboxSnapshot,
    )
  ) {
    throw new RangeError(
      'Skyway Reconnect Lease Finality Outbox head is stale.',
    );
  }
  return snapshot;
}

function promotedOutboxSnapshot({
  baseSnapshot,
  previousReconnectAuthorityCheckpoint,
  reservedReconnectAuthorityCheckpoint,
}) {
  if (
    baseSnapshot.revision >= Number.MAX_SAFE_INTEGER ||
    baseSnapshot.adoptedReconnectAuthorityCheckpointHash !==
      previousReconnectAuthorityCheckpoint
        .reconnectAuthorityCheckpointHash ||
    baseSnapshot.adoptedAdmissionAckWatermarkHash !==
      previousReconnectAuthorityCheckpoint
        .admissionAckWatermarkHash ||
    reservedReconnectAuthorityCheckpoint
      .admissionAckWatermarkHash !==
      previousReconnectAuthorityCheckpoint
        .admissionAckWatermarkHash ||
    reservedReconnectAuthorityCheckpoint
      .authorityCheckpointHash !==
      previousReconnectAuthorityCheckpoint
        .authorityCheckpointHash ||
    reservedReconnectAuthorityCheckpoint
      .reconnectAuthorityCheckpointHash ===
      previousReconnectAuthorityCheckpoint
        .reconnectAuthorityCheckpointHash
  ) {
    throw new RangeError(
      'Skyway Reconnect Lease Outbox Authority promotion is stale.',
    );
  }
  const candidate = structuredClone(baseSnapshot);
  candidate.revision += 1;
  candidate.adoptedReconnectAuthorityCheckpointHash =
    reservedReconnectAuthorityCheckpoint
      .reconnectAuthorityCheckpointHash;
  candidate.adoptedAdmissionAckWatermarkHash =
    reservedReconnectAuthorityCheckpoint
      .admissionAckWatermarkHash;
  return assertSkywayReconnectAckOutboxSnapshot(candidate);
}

function restoreOutbox(ackOutbox, snapshot, targetSnapshot) {
  return restoreSkywayReconnectAckOutbox(
    ackOutbox,
    snapshot,
    {
      expectedTargetSnapshotHash:
        hashSkywaySnapshot(targetSnapshot),
    },
  );
}

function prepareReservation({
  base,
  watermark,
  authenticatedOwnerId,
  directive,
  resyncSnapshot,
  leaseWindow,
  ackOutbox,
}) {
  const previousAuthority =
    base.components.reconnectAuthorityCheckpoint;
  const authorityCheckpoint =
    previousAuthority.components.authorityCheckpoint;
  const admissionAckWatermark =
    previousAuthority.components.admissionAckWatermark;
  const previousLease =
    snapshotSkywayReconnectLeaseWindow(leaseWindow);
  const previousOutbox =
    snapshotSkywayReconnectAckOutbox(ackOutbox);
  const lease = reserveSkywayReconnectLease(
    leaseWindow,
    {
      authenticatedOwnerId,
      directive,
      resyncSnapshot,
      authorityCheckpoint,
      admissionAckWatermark,
      expectedRevision: previousLease.revision,
    },
  );
  const reservedLease =
    snapshotSkywayReconnectLeaseWindow(leaseWindow);
  const reservationChanged =
    !canonicalEqual(previousLease, reservedLease);
  const reservedAuthority =
    createSkywayReconnectAuthorityCheckpoint({
      authorityCheckpoint,
      leaseWindow,
      admissionAckWatermark,
    });

  let headPromotion = null;
  if (reservationChanged) {
    const promotedOutbox = promotedOutboxSnapshot({
      baseSnapshot: previousOutbox,
      previousReconnectAuthorityCheckpoint:
        previousAuthority,
      reservedReconnectAuthorityCheckpoint:
        reservedAuthority,
    });
    headPromotion = restoreOutbox(
      ackOutbox,
      promotedOutbox,
      previousOutbox,
    );
  } else if (
    reservedAuthority.reconnectAuthorityCheckpointHash !==
      previousAuthority.reconnectAuthorityCheckpointHash
  ) {
    throw new RangeError(
      'Skyway Reconnect Lease retry changed the Authority head.',
    );
  }

  const checkpoint = createSkywayReconnectFinalityCheckpoint({
    reconnectAuthorityCheckpoint: reservedAuthority,
    ackOutbox,
  });
  assertSkywayReconnectAckDeliveryFinalityRestore(watermark, {
    reconnectFinalityCheckpoint: checkpoint,
  });
  if (
    !reservationChanged &&
    !canonicalEqual(checkpoint, base)
  ) {
    throw new RangeError(
      'Skyway Reconnect Lease retry changed the Finality head.',
    );
  }
  return {
    lease,
    previousLease,
    reservedLease,
    reservationChanged,
    reservedAuthority,
    headPromotion,
    checkpoint,
  };
}

function restoreAbortTargets({
  base,
  abortLease,
  abortOutbox,
  leaseWindow,
  ackOutbox,
}) {
  const currentOutbox =
    snapshotSkywayReconnectAckOutbox(ackOutbox);
  if (!canonicalEqual(currentOutbox, abortOutbox)) {
    restoreOutbox(ackOutbox, abortOutbox, currentOutbox);
  }
  const currentLease =
    snapshotSkywayReconnectLeaseWindow(leaseWindow);
  if (!canonicalEqual(currentLease, abortLease)) {
    restoreSkywayReconnectLeaseWindow(
      leaseWindow,
      abortLease,
      {
        sessionIncarnation: base.sessionIncarnation,
        roundEpoch: base.roundEpoch,
        expectedTargetLeaseWindowHash:
          hashSkywaySnapshot(currentLease),
      },
    );
  }
}

export function reserveSkywayReconnectLeaseFinality({
  baseCheckpoint,
  expectedReconnectFinalityCheckpointHash,
  ackDeliveryFinalityWatermark,
  expectedAckDeliveryFinalityWatermarkHash,
  authenticatedOwnerId,
  directive,
  resyncSnapshot,
  leaseWindow,
  ackOutbox,
}) {
  const base = assertSkywayReconnectFinalityCheckpoint(
    baseCheckpoint,
  );
  const watermark =
    assertSkywayReconnectAckDeliveryFinalityWatermark(
      ackDeliveryFinalityWatermark,
    );
  assertExactCas({
    base,
    watermark,
    expectedReconnectFinalityCheckpointHash,
    expectedAckDeliveryFinalityWatermarkHash,
  });
  assertSkywayReconnectAckDeliveryFinalityRestore(watermark, {
    reconnectFinalityCheckpoint: base,
  });
  const baseAuthority =
    base.components.reconnectAuthorityCheckpoint;
  const abortLease = assertLiveLease(
    baseAuthority,
    leaseWindow,
  );
  const abortOutbox = assertLiveOutbox(base, ackOutbox);

  const scratchLease = structuredClone(leaseWindow);
  const scratchOutbox = structuredClone(ackOutbox);
  const prepared = prepareReservation({
    base,
    watermark,
    authenticatedOwnerId,
    directive,
    resyncSnapshot,
    leaseWindow: scratchLease,
    ackOutbox: scratchOutbox,
  });
  assertLiveLease(baseAuthority, leaseWindow);
  assertLiveOutbox(base, ackOutbox);

  let committed;
  try {
    committed = prepareReservation({
      base,
      watermark,
      authenticatedOwnerId,
      directive,
      resyncSnapshot,
      leaseWindow,
      ackOutbox,
    });
    if (!canonicalEqual(committed, prepared)) {
      throw new RangeError(
        'Skyway Reconnect Lease Finality commit diverged.',
      );
    }
  } catch (error) {
    restoreAbortTargets({
      base,
      abortLease,
      abortOutbox,
      leaseWindow,
      ackOutbox,
    });
    throw error;
  }

  const payload = {
    version: SKYWAY_RECONNECT_LEASE_FINALITY_RESERVATION_VERSION,
    kind: 'skyway-reconnect-lease-finality-reservation',
    sessionIncarnationHash: base.sessionIncarnationHash,
    roundEpoch: base.roundEpoch,
    tick: base.tick,
    ownerId: committed.lease.ownerId,
    directiveHash: committed.lease.directiveHash,
    resyncSnapshotHash: committed.lease.resyncSnapshotHash,
    leaseHash: committed.lease.leaseHash,
    previousReconnectFinalityCheckpointHash:
      base.reconnectFinalityCheckpointHash,
    reconnectFinalityCheckpointHash:
      committed.checkpoint.reconnectFinalityCheckpointHash,
    previousReconnectAuthorityCheckpointHash:
      base.reconnectAuthorityCheckpointHash,
    reconnectAuthorityCheckpointHash:
      committed.reservedAuthority
        .reconnectAuthorityCheckpointHash,
    ackDeliveryFinalityWatermarkHash: watermark.watermarkHash,
    previousLeaseWindowSnapshotHash:
      baseAuthority.leaseWindowSnapshotHash,
    leaseWindowSnapshotHash:
      committed.reservedAuthority.leaseWindowSnapshotHash,
    previousLeaseRevision: committed.previousLease.revision,
    leaseRevision: committed.reservedLease.revision,
    previousAckOutboxSnapshotHash:
      base.ackOutboxSnapshotHash,
    ackOutboxSnapshotHash:
      committed.checkpoint.ackOutboxSnapshotHash,
    previousAckOutboxRevision: base.ackOutboxRevision,
    ackOutboxRevision: committed.checkpoint.ackOutboxRevision,
    leaseReserved: committed.reservationChanged,
    reservationChanged: committed.reservationChanged,
    authorityHeadPromoted: committed.reservationChanged,
    correctionApplied: false,
    deliveryFinalityAdvanced: false,
    receiptFinalityAdvanced: false,
    storagePerformed: false,
    sendPerformed: false,
    receiptAcquired: false,
    suppressPresentation: true,
    headPromotion: committed.headPromotion,
    lease: committed.lease,
    checkpoint: committed.checkpoint,
    ackDeliveryFinalityWatermark: watermark,
  };
  const result = deepFreeze({
    ...payload,
    transactionHash: hashSkywaySnapshot(payload),
  });
  if (
    byteLength(result) >
      SKYWAY_RECONNECT_LEASE_FINALITY_RESERVATION_MAX_BYTES
  ) {
    restoreAbortTargets({
      base,
      abortLease,
      abortOutbox,
      leaseWindow,
      ackOutbox,
    });
    throw new RangeError(
      'Skyway Reconnect Lease Finality reservation exceeds its bound.',
    );
  }
  return result;
}
