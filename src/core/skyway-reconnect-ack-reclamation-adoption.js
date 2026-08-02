import {
  assertSkywayReconnectAckCommitResult,
} from './skyway-reconnect-ack-commit.js';
import {
  assertSkywayReconnectAckDeliveryFinalityRestore,
  assertSkywayReconnectAckDeliveryFinalityWatermark,
  assertSkywayReconnectAckReceiptFinalityForReclamation,
} from './skyway-reconnect-ack-delivery-finality.js';
import {
  restoreSkywayReconnectAckOutbox,
  snapshotSkywayReconnectAckOutbox,
} from './skyway-reconnect-ack-outbox.js';
import {
  adoptSkywayReconnectFinalityAck,
  assertSkywayReconnectFinalityCheckpoint,
} from './skyway-reconnect-finality-checkpoint.js';
import {
  canonicalizeSkywaySnapshot,
  hashSkywaySnapshot,
} from './skyway-snapshot-history.js';

export const SKYWAY_RECONNECT_ACK_RECLAMATION_ADOPTION_VERSION = 1;
export const SKYWAY_RECONNECT_ACK_RECLAMATION_ADOPTION_MAX_BYTES =
  768 * 1_024;

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
  checkpoint,
  watermark,
  expectedReconnectFinalityCheckpointHash,
  expectedAckDeliveryFinalityWatermarkHash,
}) {
  if (
    typeof expectedReconnectFinalityCheckpointHash !== 'string' ||
    checkpoint.reconnectFinalityCheckpointHash !==
      expectedReconnectFinalityCheckpointHash
  ) {
    throw new RangeError(
      'Skyway Reconnect ACK reclamation Finality head is stale.',
    );
  }
  if (
    typeof expectedAckDeliveryFinalityWatermarkHash !== 'string' ||
    watermark.watermarkHash !==
      expectedAckDeliveryFinalityWatermarkHash
  ) {
    throw new RangeError(
      'Skyway Reconnect ACK reclamation Delivery Finality head is stale.',
    );
  }
}

function assertLiveOutbox(baseCheckpoint, ackOutbox) {
  const snapshot = snapshotSkywayReconnectAckOutbox(ackOutbox);
  if (
    hashSkywaySnapshot(snapshot) !==
      baseCheckpoint.ackOutboxSnapshotHash ||
    !canonicalEqual(
      snapshot,
      baseCheckpoint.components.ackOutboxSnapshot,
    )
  ) {
    throw new RangeError(
      'Skyway Reconnect ACK reclamation Outbox head is stale.',
    );
  }
  return snapshot;
}

function adoptionPlan(snapshot, commit) {
  const retained = snapshot.slots.find((slot) => (
    slot?.adoption.ackCommitTransactionHash ===
      commit.transactionHash
  ));
  if (retained) {
    return {
      kind: 'retained-retry',
      reclaimedSlot: null,
    };
  }
  if (snapshot.slots.includes(null)) {
    return {
      kind: 'empty-slot',
      reclaimedSlot: null,
    };
  }
  let reclaimedSlot = null;
  for (const slot of snapshot.slots) {
    if (
      slot.status === 'consumed' &&
      (
        reclaimedSlot === null ||
        slot.adoption.adoptedRevision <
          reclaimedSlot.adoption.adoptedRevision
      )
    ) {
      reclaimedSlot = slot;
    }
  }
  if (reclaimedSlot === null) {
    throw new RangeError(
      'Skyway Reconnect ACK reclamation Outbox capacity is full.',
    );
  }
  return {
    kind: 'receipt-finalized-reclamation',
    reclaimedSlot,
  };
}

function restoreAbortOutbox(ackOutbox, abortSnapshot) {
  const current = snapshotSkywayReconnectAckOutbox(ackOutbox);
  if (canonicalEqual(current, abortSnapshot)) return;
  restoreSkywayReconnectAckOutbox(
    ackOutbox,
    abortSnapshot,
    {
      expectedTargetSnapshotHash:
        hashSkywaySnapshot(current),
    },
  );
}

export function adoptSkywayReconnectAckWithReceiptFinality({
  baseCheckpoint,
  expectedReconnectFinalityCheckpointHash,
  ackDeliveryFinalityWatermark,
  expectedAckDeliveryFinalityWatermarkHash,
  ackCommit,
  ackOutbox,
}) {
  const base = assertSkywayReconnectFinalityCheckpoint(
    baseCheckpoint,
  );
  const watermark =
    assertSkywayReconnectAckDeliveryFinalityWatermark(
      ackDeliveryFinalityWatermark,
    );
  const commit = assertSkywayReconnectAckCommitResult(ackCommit);
  assertExactCas({
    checkpoint: base,
    watermark,
    expectedReconnectFinalityCheckpointHash,
    expectedAckDeliveryFinalityWatermarkHash,
  });
  assertSkywayReconnectAckDeliveryFinalityRestore(watermark, {
    reconnectFinalityCheckpoint: base,
  });
  const abortSnapshot = assertLiveOutbox(base, ackOutbox);
  const plan = adoptionPlan(abortSnapshot, commit);
  const reclaimedReceipt = plan.reclaimedSlot === null
    ? null
    : assertSkywayReconnectAckReceiptFinalityForReclamation(
        watermark,
        {
          reconnectFinalityCheckpoint: base,
          adoptionHash:
            plan.reclaimedSlot.adoption.adoptionHash,
        },
      );

  const scratchOutbox = structuredClone(ackOutbox);
  const prepared = adoptSkywayReconnectFinalityAck({
    baseCheckpoint: base,
    ackCommit: commit,
    ackOutbox: scratchOutbox,
  });
  assertSkywayReconnectAckDeliveryFinalityRestore(watermark, {
    reconnectFinalityCheckpoint: prepared.checkpoint,
  });
  assertLiveOutbox(base, ackOutbox);

  let adopted;
  try {
    adopted = adoptSkywayReconnectFinalityAck({
      baseCheckpoint: base,
      ackCommit: commit,
      ackOutbox,
    });
    if (!canonicalEqual(adopted, prepared)) {
      throw new RangeError(
        'Skyway Reconnect ACK reclamation commit diverged.',
      );
    }
  } catch (error) {
    restoreAbortOutbox(ackOutbox, abortSnapshot);
    throw error;
  }

  const reclaimed = plan.reclaimedSlot !== null &&
    adopted.changed;
  const payload = {
    version: SKYWAY_RECONNECT_ACK_RECLAMATION_ADOPTION_VERSION,
    kind: 'skyway-reconnect-ack-reclamation-adoption',
    sessionIncarnationHash: base.sessionIncarnationHash,
    roundEpoch: base.roundEpoch,
    tick: adopted.checkpoint.tick,
    previousReconnectFinalityCheckpointHash:
      base.reconnectFinalityCheckpointHash,
    reconnectFinalityCheckpointHash:
      adopted.checkpoint.reconnectFinalityCheckpointHash,
    ackDeliveryFinalityWatermarkHash: watermark.watermarkHash,
    watermarkReconnectFinalityCheckpointHash:
      watermark.reconnectFinalityCheckpointHash,
    previousAckOutboxSnapshotHash:
      base.ackOutboxSnapshotHash,
    ackOutboxSnapshotHash:
      adopted.checkpoint.ackOutboxSnapshotHash,
    previousAckOutboxRevision: base.ackOutboxRevision,
    ackOutboxRevision: adopted.checkpoint.ackOutboxRevision,
    ackCommitTransactionHash: commit.transactionHash,
    adoptionHash: adopted.adoption.adoptionHash,
    adoptionMode: plan.kind,
    reclaimed,
    reclaimedOwnerId: reclaimed
      ? plan.reclaimedSlot.adoption.ownerId
      : null,
    reclaimedAckSequence: reclaimed
      ? plan.reclaimedSlot.adoption.ackSequence
      : null,
    reclaimedAdoptionHash: reclaimed
      ? plan.reclaimedSlot.adoption.adoptionHash
      : null,
    reclaimedReceiptStageHash: reclaimed
      ? reclaimedReceipt.stageHash
      : null,
    deliveryFinalityAdvanced: false,
    receiptFinalityAdvanced: false,
    storagePerformed: false,
    sendPerformed: false,
    receiptAcquired: false,
    suppressPresentation: true,
    adoption: adopted.adoption,
    checkpoint: adopted.checkpoint,
    ackDeliveryFinalityWatermark: watermark,
  };
  const result = deepFreeze({
    ...payload,
    transactionHash: hashSkywaySnapshot(payload),
  });
  if (
    byteLength(result) >
      SKYWAY_RECONNECT_ACK_RECLAMATION_ADOPTION_MAX_BYTES
  ) {
    restoreAbortOutbox(ackOutbox, abortSnapshot);
    throw new RangeError(
      'Skyway Reconnect ACK reclamation adoption exceeds its bound.',
    );
  }
  return result;
}
