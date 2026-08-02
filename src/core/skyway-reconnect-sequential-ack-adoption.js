import {
  assertSkywayAuthoritativeReconnectCorrectionResult,
} from './skyway-authoritative-reconnect-correction.js';
import {
  assertSkywayReconnectAckCommitResult,
  commitSkywayReconnectAck,
} from './skyway-reconnect-ack-commit.js';
import {
  assertSkywayReconnectAckDeliveryFinalityRestore,
  assertSkywayReconnectAckDeliveryFinalityWatermark,
} from './skyway-reconnect-ack-delivery-finality.js';
import {
  adoptSkywayReconnectAckWithReceiptFinality,
} from './skyway-reconnect-ack-reclamation-adoption.js';
import {
  assertSkywayReconnectAckOutboxSnapshot,
  restoreSkywayReconnectAckOutbox,
  snapshotSkywayReconnectAckOutbox,
} from './skyway-reconnect-ack-outbox.js';
import {
  assertSkywayReconnectAuthorityCheckpoint,
} from './skyway-reconnect-authority-checkpoint.js';
import {
  assertSkywayReconnectFinalityCheckpoint,
  createSkywayReconnectFinalityCheckpoint,
} from './skyway-reconnect-finality-checkpoint.js';
import {
  canonicalizeSkywaySnapshot,
  hashSkywaySnapshot,
} from './skyway-snapshot-history.js';

export const SKYWAY_RECONNECT_SEQUENTIAL_ACK_ADOPTION_VERSION = 1;
export const SKYWAY_RECONNECT_SEQUENTIAL_ACK_ADOPTION_MAX_BYTES =
  800 * 1_024;

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
      'Skyway sequential Reconnect ACK Finality head is stale.',
    );
  }
  if (
    typeof expectedAckDeliveryFinalityWatermarkHash !== 'string' ||
    expectedAckDeliveryFinalityWatermarkHash !==
      watermark.watermarkHash
  ) {
    throw new RangeError(
      'Skyway sequential Reconnect ACK Delivery Finality head is stale.',
    );
  }
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
      'Skyway sequential Reconnect ACK Outbox head is stale.',
    );
  }
  return snapshot;
}

function assertTransition({
  base,
  correction,
  postCorrection,
  commit,
}) {
  const previous = base.components.reconnectAuthorityCheckpoint;
  if (
    correction.sessionIncarnationHash !==
      base.sessionIncarnationHash ||
    correction.roundEpoch !== base.roundEpoch ||
    correction.tick !== base.tick ||
    correction.previousAuthorityCheckpointHash !==
      previous.authorityCheckpointHash ||
    correction.previousAdmissionSnapshotHash !==
      previous.components.authorityCheckpoint
        .admissionSnapshotHash ||
    correction.previousLeaseWindowHash !==
      previous.leaseWindowSnapshotHash ||
    correction.admissionAckWatermarkHash !==
      previous.admissionAckWatermarkHash ||
    postCorrection.sessionIncarnationHash !==
      base.sessionIncarnationHash ||
    postCorrection.roundEpoch !== base.roundEpoch ||
    postCorrection.tick !== base.tick ||
    postCorrection.rosterHash !== base.rosterHash ||
    postCorrection.authorityCheckpointHash !==
      correction.authorityCheckpointHash ||
    postCorrection.leaseWindowSnapshotHash !==
      correction.leaseWindowHash ||
    postCorrection.admissionAckWatermarkHash !==
      correction.admissionAckWatermarkHash ||
    !canonicalEqual(
      postCorrection.components.authorityCheckpoint,
      correction.authorityCheckpoint,
    ) ||
    commit.correctionTransactionHash !==
      correction.transactionHash ||
    commit.previousReconnectAuthorityCheckpointHash !==
      postCorrection.reconnectAuthorityCheckpointHash ||
    commit.previousAdmissionAckWatermarkHash !==
      postCorrection.admissionAckWatermarkHash ||
    commit.authorityCheckpointHash !==
      postCorrection.authorityCheckpointHash ||
    commit.leaseWindowSnapshotHash !==
      postCorrection.leaseWindowSnapshotHash
  ) {
    throw new RangeError(
      'Skyway sequential Reconnect ACK Authority transition is stale.',
    );
  }
}

function bridgedOutboxSnapshot({
  baseSnapshot,
  previousReconnectAuthorityCheckpoint,
  postCorrectionReconnectAuthorityCheckpoint,
}) {
  if (
    baseSnapshot.revision >= Number.MAX_SAFE_INTEGER ||
    baseSnapshot.adoptedReconnectAuthorityCheckpointHash !==
      previousReconnectAuthorityCheckpoint
        .reconnectAuthorityCheckpointHash ||
    baseSnapshot.adoptedAdmissionAckWatermarkHash !==
      previousReconnectAuthorityCheckpoint
        .admissionAckWatermarkHash ||
    postCorrectionReconnectAuthorityCheckpoint
      .admissionAckWatermarkHash !==
      previousReconnectAuthorityCheckpoint
        .admissionAckWatermarkHash ||
    postCorrectionReconnectAuthorityCheckpoint
      .reconnectAuthorityCheckpointHash ===
      previousReconnectAuthorityCheckpoint
        .reconnectAuthorityCheckpointHash
  ) {
    throw new RangeError(
      'Skyway sequential Reconnect ACK Authority bridge is stale.',
    );
  }
  const candidate = structuredClone(baseSnapshot);
  candidate.revision += 1;
  candidate.adoptedReconnectAuthorityCheckpointHash =
    postCorrectionReconnectAuthorityCheckpoint
      .reconnectAuthorityCheckpointHash;
  candidate.adoptedAdmissionAckWatermarkHash =
    postCorrectionReconnectAuthorityCheckpoint
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

function restoreAbortOutbox(ackOutbox, abortSnapshot) {
  const current = snapshotSkywayReconnectAckOutbox(ackOutbox);
  if (canonicalEqual(current, abortSnapshot)) return;
  restoreOutbox(ackOutbox, abortSnapshot, current);
}

function prepareSequentialAdoption({
  base,
  postCorrection,
  watermark,
  commit,
  ackOutbox,
}) {
  const baseSnapshot = snapshotSkywayReconnectAckOutbox(
    ackOutbox,
  );
  const bridgeSnapshot = bridgedOutboxSnapshot({
    baseSnapshot,
    previousReconnectAuthorityCheckpoint:
      base.components.reconnectAuthorityCheckpoint,
    postCorrectionReconnectAuthorityCheckpoint:
      postCorrection,
  });
  const headBridge = restoreOutbox(
    ackOutbox,
    bridgeSnapshot,
    baseSnapshot,
  );
  const bridgeCheckpoint =
    createSkywayReconnectFinalityCheckpoint({
      reconnectAuthorityCheckpoint: postCorrection,
      ackOutbox,
    });
  assertSkywayReconnectAckDeliveryFinalityRestore(watermark, {
    reconnectFinalityCheckpoint: bridgeCheckpoint,
  });
  const receiptAwareAdoption =
    adoptSkywayReconnectAckWithReceiptFinality({
      baseCheckpoint: bridgeCheckpoint,
      expectedReconnectFinalityCheckpointHash:
        bridgeCheckpoint.reconnectFinalityCheckpointHash,
      ackDeliveryFinalityWatermark: watermark,
      expectedAckDeliveryFinalityWatermarkHash:
        watermark.watermarkHash,
      ackCommit: commit,
      ackOutbox,
    });
  return {
    headBridge,
    bridgeCheckpoint,
    receiptAwareAdoption,
  };
}

export function adoptSequentialSkywayReconnectAck({
  baseCheckpoint,
  expectedReconnectFinalityCheckpointHash,
  reconnectCorrection,
  postCorrectionReconnectAuthorityCheckpoint,
  ackCommit,
  ackDeliveryFinalityWatermark,
  expectedAckDeliveryFinalityWatermarkHash,
  ackOutbox,
}) {
  const base = assertSkywayReconnectFinalityCheckpoint(
    baseCheckpoint,
  );
  const correction =
    assertSkywayAuthoritativeReconnectCorrectionResult(
      reconnectCorrection,
    );
  const postCorrection =
    assertSkywayReconnectAuthorityCheckpoint(
      postCorrectionReconnectAuthorityCheckpoint,
    );
  const commit = assertSkywayReconnectAckCommitResult(ackCommit);
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
  assertTransition({
    base,
    correction,
    postCorrection,
    commit,
  });
  const canonicalCommit = commitSkywayReconnectAck({
    reconnectCorrection: correction,
    reconnectAuthorityCheckpoint: postCorrection,
    expectedReconnectAuthorityCheckpointHash:
      postCorrection.reconnectAuthorityCheckpointHash,
  });
  if (!canonicalEqual(canonicalCommit, commit)) {
    throw new RangeError(
      'Skyway sequential Reconnect ACK Commit is not canonical.',
    );
  }
  assertSkywayReconnectAckDeliveryFinalityRestore(watermark, {
    reconnectFinalityCheckpoint: base,
  });
  const abortSnapshot = assertLiveOutbox(base, ackOutbox);

  const scratchOutbox = structuredClone(ackOutbox);
  const prepared = prepareSequentialAdoption({
    base,
    postCorrection,
    watermark,
    commit,
    ackOutbox: scratchOutbox,
  });
  assertLiveOutbox(base, ackOutbox);

  let committed;
  try {
    committed = prepareSequentialAdoption({
      base,
      postCorrection,
      watermark,
      commit,
      ackOutbox,
    });
    if (!canonicalEqual(committed, prepared)) {
      throw new RangeError(
        'Skyway sequential Reconnect ACK commit diverged.',
      );
    }
  } catch (error) {
    restoreAbortOutbox(ackOutbox, abortSnapshot);
    throw error;
  }

  const adoption = committed.receiptAwareAdoption;
  const payload = {
    version: SKYWAY_RECONNECT_SEQUENTIAL_ACK_ADOPTION_VERSION,
    kind: 'skyway-reconnect-sequential-ack-adoption',
    sessionIncarnationHash: base.sessionIncarnationHash,
    roundEpoch: base.roundEpoch,
    tick: base.tick,
    previousReconnectFinalityCheckpointHash:
      base.reconnectFinalityCheckpointHash,
    bridgeReconnectFinalityCheckpointHash:
      committed.bridgeCheckpoint
        .reconnectFinalityCheckpointHash,
    reconnectFinalityCheckpointHash:
      adoption.reconnectFinalityCheckpointHash,
    previousReconnectAuthorityCheckpointHash:
      base.reconnectAuthorityCheckpointHash,
    postCorrectionReconnectAuthorityCheckpointHash:
      postCorrection.reconnectAuthorityCheckpointHash,
    reconnectAuthorityCheckpointHash:
      adoption.checkpoint.reconnectAuthorityCheckpointHash,
    ackDeliveryFinalityWatermarkHash: watermark.watermarkHash,
    previousAckOutboxSnapshotHash:
      base.ackOutboxSnapshotHash,
    bridgeAckOutboxSnapshotHash:
      committed.bridgeCheckpoint.ackOutboxSnapshotHash,
    ackOutboxSnapshotHash:
      adoption.checkpoint.ackOutboxSnapshotHash,
    previousAckOutboxRevision: base.ackOutboxRevision,
    bridgeAckOutboxRevision:
      committed.bridgeCheckpoint.ackOutboxRevision,
    ackOutboxRevision: adoption.checkpoint.ackOutboxRevision,
    correctionTransactionHash: correction.transactionHash,
    ackCommitTransactionHash: commit.transactionHash,
    adoptionHash: adoption.adoptionHash,
    adoptionMode: adoption.adoptionMode,
    reclaimed: adoption.reclaimed,
    reclaimedAdoptionHash: adoption.reclaimedAdoptionHash,
    authorityHeadBridged: true,
    correctionAppliedByTransaction: false,
    deliveryFinalityAdvanced: false,
    receiptFinalityAdvanced: false,
    storagePerformed: false,
    sendPerformed: false,
    receiptAcquired: false,
    suppressPresentation: true,
    headBridge: committed.headBridge,
    receiptAwareAdoption: adoption,
  };
  const result = deepFreeze({
    ...payload,
    transactionHash: hashSkywaySnapshot(payload),
  });
  if (
    byteLength(result) >
      SKYWAY_RECONNECT_SEQUENTIAL_ACK_ADOPTION_MAX_BYTES
  ) {
    restoreAbortOutbox(ackOutbox, abortSnapshot);
    throw new RangeError(
      'Skyway sequential Reconnect ACK adoption exceeds its bound.',
    );
  }
  return result;
}
