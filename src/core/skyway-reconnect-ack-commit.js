import {
  advanceSkywayAdmissionAckWatermark,
} from './skyway-admission-ack-finality.js';
import {
  assertSkywayAuthoritativeReconnectCorrectionResult,
} from './skyway-authoritative-reconnect-correction.js';
import {
  assertSkywayReconnectAuthorityCheckpoint,
  createSkywayReconnectAuthorityCheckpoint,
} from './skyway-reconnect-authority-checkpoint.js';
import {
  canonicalizeSkywaySnapshot,
  hashSkywaySnapshot,
} from './skyway-snapshot-history.js';

export const SKYWAY_RECONNECT_ACK_COMMIT_VERSION = 1;
export const SKYWAY_RECONNECT_ACK_DELIVERY_INTENT_MAX_BYTES = 2_048;

const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;
const DELIVERY_INTENT_KEYS = Object.freeze([
  'ackDelivered',
  'ackSequence',
  'admissionAckWatermarkHash',
  'authoritativeTick',
  'authorityCheckpointHash',
  'correctionTransactionHash',
  'deliveryIntentHash',
  'directiveHash',
  'durablyAdopted',
  'kind',
  'lastAcceptedCommandHash',
  'leaseHash',
  'ownerId',
  'participantId',
  'previousAdmissionAckWatermarkHash',
  'previousReconnectAuthorityCheckpointHash',
  'reconnectAuthorityCheckpointHash',
  'requiresDurableWatermarkAdoption',
  'resyncSnapshotHash',
  'roundEpoch',
  'scope',
  'sessionIncarnationHash',
  'version',
]);
const RESULT_KEYS = Object.freeze([
  'ackDelivered',
  'ackSequence',
  'ackWatermarkAdopted',
  'ackWatermarkAdvanced',
  'ackWatermarkPublished',
  'admissionAckWatermark',
  'admissionAckWatermarkHash',
  'authorityCheckpointHash',
  'checkpoint',
  'correctionTransactionHash',
  'deliveryIntent',
  'deliveryIntentHash',
  'eventsCommitted',
  'kind',
  'leaseHash',
  'leaseWindowSnapshotHash',
  'ownerId',
  'participantId',
  'previousAdmissionAckWatermarkHash',
  'previousReconnectAuthorityCheckpointHash',
  'reconnectAuthorityCheckpointHash',
  'requiresDurableWatermarkAdoption',
  'roundEpoch',
  'sessionIncarnationHash',
  'suppressPresentation',
  'tick',
  'transactionHash',
  'version',
]);
const encoder = new TextEncoder();

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

function boundedId(value, maxLength = 64) {
  return typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= maxLength &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}

function validHash(value) {
  return typeof value === 'string' && HASH_PATTERN.test(value);
}

function byteLength(value) {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

function deliveryIntentPayload(intent) {
  return {
    version: intent.version,
    kind: intent.kind,
    ownerId: intent.ownerId,
    participantId: intent.participantId,
    sessionIncarnationHash: intent.sessionIncarnationHash,
    roundEpoch: intent.roundEpoch,
    authoritativeTick: intent.authoritativeTick,
    ackSequence: intent.ackSequence,
    lastAcceptedCommandHash: intent.lastAcceptedCommandHash,
    leaseHash: intent.leaseHash,
    directiveHash: intent.directiveHash,
    resyncSnapshotHash: intent.resyncSnapshotHash,
    correctionTransactionHash: intent.correctionTransactionHash,
    previousReconnectAuthorityCheckpointHash:
      intent.previousReconnectAuthorityCheckpointHash,
    reconnectAuthorityCheckpointHash:
      intent.reconnectAuthorityCheckpointHash,
    authorityCheckpointHash: intent.authorityCheckpointHash,
    previousAdmissionAckWatermarkHash:
      intent.previousAdmissionAckWatermarkHash,
    admissionAckWatermarkHash: intent.admissionAckWatermarkHash,
    scope: intent.scope,
    requiresDurableWatermarkAdoption:
      intent.requiresDurableWatermarkAdoption,
    durablyAdopted: intent.durablyAdopted,
    ackDelivered: intent.ackDelivered,
  };
}

export function validateSkywayReconnectAckDeliveryIntent(intent) {
  if (
    !exactKeys(intent, DELIVERY_INTENT_KEYS) ||
    intent.version !== SKYWAY_RECONNECT_ACK_COMMIT_VERSION ||
    intent.kind !== 'skyway-reconnect-ack-delivery-intent' ||
    !boundedId(intent.ownerId) ||
    !boundedId(intent.participantId) ||
    !validHash(intent.sessionIncarnationHash) ||
    !Number.isSafeInteger(intent.roundEpoch) ||
    intent.roundEpoch < 1 ||
    !Number.isSafeInteger(intent.authoritativeTick) ||
    intent.authoritativeTick < 0 ||
    !Number.isInteger(intent.ackSequence) ||
    intent.ackSequence < 0 ||
    !validHash(intent.lastAcceptedCommandHash) ||
    !validHash(intent.leaseHash) ||
    !validHash(intent.directiveHash) ||
    !validHash(intent.resyncSnapshotHash) ||
    !validHash(intent.correctionTransactionHash) ||
    !validHash(intent.previousReconnectAuthorityCheckpointHash) ||
    !validHash(intent.reconnectAuthorityCheckpointHash) ||
    !validHash(intent.authorityCheckpointHash) ||
    !validHash(intent.previousAdmissionAckWatermarkHash) ||
    !validHash(intent.admissionAckWatermarkHash) ||
    intent.scope !== 'input-admission' ||
    intent.requiresDurableWatermarkAdoption !== true ||
    intent.durablyAdopted !== false ||
    intent.ackDelivered !== false ||
    !validHash(intent.deliveryIntentHash)
  ) {
    throw new TypeError(
      'Invalid Skyway reconnect ACK delivery intent.',
    );
  }
  if (
    hashSkywaySnapshot(deliveryIntentPayload(intent)) !==
      intent.deliveryIntentHash
  ) {
    throw new RangeError(
      'Skyway reconnect ACK delivery intent hash is invalid.',
    );
  }
  if (byteLength(intent) > SKYWAY_RECONNECT_ACK_DELIVERY_INTENT_MAX_BYTES) {
    throw new RangeError(
      'Skyway reconnect ACK delivery intent exceeds its bound.',
    );
  }
  return intent;
}

export function assertSkywayReconnectAckCommitResult(result) {
  if (
    !exactKeys(result, RESULT_KEYS) ||
    result.version !== SKYWAY_RECONNECT_ACK_COMMIT_VERSION ||
    result.kind !== 'skyway-reconnect-ack-commit' ||
    !boundedId(result.ownerId) ||
    !boundedId(result.participantId) ||
    !validHash(result.sessionIncarnationHash) ||
    !Number.isSafeInteger(result.roundEpoch) ||
    result.roundEpoch < 1 ||
    !Number.isSafeInteger(result.tick) ||
    result.tick < 0 ||
    !Number.isInteger(result.ackSequence) ||
    result.ackSequence < 0 ||
    !validHash(result.correctionTransactionHash) ||
    !validHash(result.leaseHash) ||
    !validHash(result.authorityCheckpointHash) ||
    !validHash(result.leaseWindowSnapshotHash) ||
    !validHash(result.previousReconnectAuthorityCheckpointHash) ||
    !validHash(result.reconnectAuthorityCheckpointHash) ||
    !validHash(result.previousAdmissionAckWatermarkHash) ||
    !validHash(result.admissionAckWatermarkHash) ||
    !validHash(result.deliveryIntentHash) ||
    result.ackWatermarkAdvanced !== true ||
    result.ackWatermarkAdopted !== false ||
    result.ackWatermarkPublished !== false ||
    result.ackDelivered !== false ||
    result.eventsCommitted !== false ||
    result.suppressPresentation !== true ||
    result.requiresDurableWatermarkAdoption !== true ||
    !validHash(result.transactionHash)
  ) {
    throw new TypeError(
      'Invalid Skyway reconnect ACK commit result.',
    );
  }
  const checkpoint = assertSkywayReconnectAuthorityCheckpoint(
    result.checkpoint,
  );
  const intent = validateSkywayReconnectAckDeliveryIntent(
    result.deliveryIntent,
  );
  if (
    result.ownerId !== intent.ownerId ||
    result.participantId !== intent.participantId ||
    result.sessionIncarnationHash !==
      checkpoint.sessionIncarnationHash ||
    result.sessionIncarnationHash !==
      intent.sessionIncarnationHash ||
    result.roundEpoch !== checkpoint.roundEpoch ||
    result.roundEpoch !== intent.roundEpoch ||
    result.tick !== checkpoint.tick ||
    result.tick !== intent.authoritativeTick ||
    result.ackSequence !== intent.ackSequence ||
    result.correctionTransactionHash !==
      intent.correctionTransactionHash ||
    result.leaseHash !== intent.leaseHash ||
    result.authorityCheckpointHash !==
      checkpoint.authorityCheckpointHash ||
    result.authorityCheckpointHash !==
      intent.authorityCheckpointHash ||
    result.leaseWindowSnapshotHash !==
      checkpoint.leaseWindowSnapshotHash ||
    result.previousReconnectAuthorityCheckpointHash !==
      intent.previousReconnectAuthorityCheckpointHash ||
    result.reconnectAuthorityCheckpointHash !==
      checkpoint.reconnectAuthorityCheckpointHash ||
    result.reconnectAuthorityCheckpointHash !==
      intent.reconnectAuthorityCheckpointHash ||
    result.previousAdmissionAckWatermarkHash !==
      intent.previousAdmissionAckWatermarkHash ||
    result.admissionAckWatermarkHash !==
      checkpoint.admissionAckWatermarkHash ||
    result.admissionAckWatermarkHash !==
      result.admissionAckWatermark?.watermarkHash ||
    result.admissionAckWatermarkHash !==
      intent.admissionAckWatermarkHash ||
    canonicalizeSkywaySnapshot(result.admissionAckWatermark) !==
      canonicalizeSkywaySnapshot(
        checkpoint.components.admissionAckWatermark,
      ) ||
    result.deliveryIntentHash !== intent.deliveryIntentHash
  ) {
    throw new RangeError(
      'Skyway reconnect ACK commit result binding is invalid.',
    );
  }
  const {
    transactionHash: ignoredTransactionHash,
    ...payload
  } = result;
  if (hashSkywaySnapshot(payload) !== result.transactionHash) {
    throw new RangeError(
      'Skyway reconnect ACK commit result hash is invalid.',
    );
  }
  return result;
}

function changedAcknowledgement({
  correction,
  previousWatermark,
  admissionAckWatermark,
}) {
  const previous = previousWatermark.acknowledgements;
  const next = admissionAckWatermark.acknowledgements;
  if (previous.length !== next.length) {
    throw new TypeError(
      'Skyway reconnect ACK ownership is incompatible.',
    );
  }
  const changed = [];
  for (let index = 0; index < next.length; index++) {
    if (previous[index].ownerId !== next[index].ownerId) {
      throw new TypeError(
        'Skyway reconnect ACK ownership is incompatible.',
      );
    }
    if (
      previous[index].ackSequence !== next[index].ackSequence ||
      previous[index].lastAcceptedCommandHash !==
        next[index].lastAcceptedCommandHash
    ) {
      changed.push({
        previous: previous[index],
        next: next[index],
      });
    }
  }

  const decision = correction.admissionBatch.decisions[0];
  const ownerAdvance = changed[0];
  if (
    changed.length !== 1 ||
    ownerAdvance.previous.ownerId !== correction.ownerId ||
    ownerAdvance.next.ownerId !== correction.ownerId ||
    ownerAdvance.previous.ackSequence + 1 !==
      decision.clientSequence ||
    ownerAdvance.next.ackSequence !== decision.clientSequence ||
    !validHash(ownerAdvance.next.lastAcceptedCommandHash)
  ) {
    throw new RangeError(
      'Skyway reconnect ACK commit requires exactly one resumed-owner frontier advance.',
    );
  }
  return {
    decision,
    acknowledgement: ownerAdvance.next,
  };
}

function assertCorrectionBinding(correction, checkpoint) {
  const authorityCheckpoint =
    checkpoint.components.authorityCheckpoint;
  const leaseWindowSnapshot =
    checkpoint.components.leaseWindowSnapshot;
  const admissionAckWatermark =
    checkpoint.components.admissionAckWatermark;
  const consumedSlot = leaseWindowSnapshot.slots.find((slot) => (
    slot?.token?.leaseHash === correction.leaseHash
  ));
  const decision = correction.admissionBatch.decisions[0];
  if (
    correction.sessionIncarnationHash !==
      checkpoint.sessionIncarnationHash ||
    correction.roundEpoch !== checkpoint.roundEpoch ||
    correction.tick !== checkpoint.tick ||
    correction.authorityCheckpointHash !==
      checkpoint.authorityCheckpointHash ||
    correction.authorityCheckpointHash !==
      authorityCheckpoint.authorityCheckpointHash ||
    canonicalizeSkywaySnapshot(correction.authorityCheckpoint) !==
      canonicalizeSkywaySnapshot(authorityCheckpoint) ||
    correction.leaseWindowHash !==
      checkpoint.leaseWindowSnapshotHash ||
    correction.leaseWindowHash !==
      hashSkywaySnapshot(leaseWindowSnapshot) ||
    correction.admissionAckWatermarkHash !==
      checkpoint.admissionAckWatermarkHash ||
    correction.admissionAckWatermarkHash !==
      admissionAckWatermark.watermarkHash ||
    correction.admissionSnapshotHash !==
      authorityCheckpoint.admissionSnapshotHash ||
    consumedSlot?.status !== 'consumed' ||
    consumedSlot.token.ownerId !== correction.ownerId ||
    consumedSlot.token.leaseHash !== correction.leaseHash ||
    consumedSlot.token.directiveHash !== correction.directiveHash ||
    consumedSlot.token.resyncSnapshotHash !==
      correction.resyncSnapshotHash ||
    consumedSlot.token.authorityCheckpointHash !==
      correction.previousAuthorityCheckpointHash ||
    consumedSlot.token.admissionAckWatermarkHash !==
      correction.admissionAckWatermarkHash ||
    consumedSlot.token.nextClientSequence !==
      decision.clientSequence ||
    correction.reconnectIntake?.authorityCheckpointHash !==
      correction.previousAuthorityCheckpointHash ||
    correction.reconnectIntake?.admissionAckWatermarkHash !==
      correction.admissionAckWatermarkHash ||
    correction.reconnectIntake?.previousLeaseWindowHash !==
      correction.previousLeaseWindowHash ||
    correction.reconnectIntake?.leaseWindowHash !==
      correction.leaseWindowHash ||
    correction.reconnectIntake?.leaseRevision !==
      consumedSlot.consumedRevision ||
    correction.reconnectIntake?.leaseConsume?.revision !==
      consumedSlot.consumedRevision ||
    correction.reconnectIntake?.leaseConsume?.tick !==
      consumedSlot.consumedAtTick ||
    correction.reconnectIntake?.admission?.ownerId !==
      decision.ownerId ||
    correction.reconnectIntake?.admission?.participantId !==
      decision.participantId ||
    correction.reconnectIntake?.admission?.clientSequence !==
      decision.clientSequence ||
    correction.reconnectIntake?.admission?.tick !== decision.tick
  ) {
    throw new RangeError(
      'Skyway reconnect ACK correction, Lease, or Authority binding is invalid.',
    );
  }
}

function createDeliveryIntent({
  correction,
  previousCheckpoint,
  checkpoint,
  admissionAckWatermark,
  decision,
  acknowledgement,
}) {
  const payload = {
    version: SKYWAY_RECONNECT_ACK_COMMIT_VERSION,
    kind: 'skyway-reconnect-ack-delivery-intent',
    ownerId: correction.ownerId,
    participantId: decision.participantId,
    sessionIncarnationHash: correction.sessionIncarnationHash,
    roundEpoch: correction.roundEpoch,
    authoritativeTick: correction.tick,
    ackSequence: acknowledgement.ackSequence,
    lastAcceptedCommandHash:
      acknowledgement.lastAcceptedCommandHash,
    leaseHash: correction.leaseHash,
    directiveHash: correction.directiveHash,
    resyncSnapshotHash: correction.resyncSnapshotHash,
    correctionTransactionHash: correction.transactionHash,
    previousReconnectAuthorityCheckpointHash:
      previousCheckpoint.reconnectAuthorityCheckpointHash,
    reconnectAuthorityCheckpointHash:
      checkpoint.reconnectAuthorityCheckpointHash,
    authorityCheckpointHash:
      checkpoint.authorityCheckpointHash,
    previousAdmissionAckWatermarkHash:
      previousCheckpoint.admissionAckWatermarkHash,
    admissionAckWatermarkHash:
      admissionAckWatermark.watermarkHash,
    scope: 'input-admission',
    requiresDurableWatermarkAdoption: true,
    durablyAdopted: false,
    ackDelivered: false,
  };
  const intent = deepFreeze({
    ...payload,
    deliveryIntentHash: hashSkywaySnapshot(payload),
  });
  validateSkywayReconnectAckDeliveryIntent(intent);
  return intent;
}

export function commitSkywayReconnectAck({
  reconnectCorrection,
  reconnectAuthorityCheckpoint,
  expectedReconnectAuthorityCheckpointHash,
}) {
  const correction =
    assertSkywayAuthoritativeReconnectCorrectionResult(
      reconnectCorrection,
    );
  const previousCheckpoint =
    assertSkywayReconnectAuthorityCheckpoint(
      reconnectAuthorityCheckpoint,
    );
  if (
    typeof expectedReconnectAuthorityCheckpointHash !== 'string' ||
    previousCheckpoint.reconnectAuthorityCheckpointHash !==
      expectedReconnectAuthorityCheckpointHash
  ) {
    throw new RangeError(
      'Skyway reconnect ACK checkpoint revision is stale.',
    );
  }
  assertCorrectionBinding(correction, previousCheckpoint);

  const previousWatermark =
    previousCheckpoint.components.admissionAckWatermark;
  const authorityCheckpoint =
    previousCheckpoint.components.authorityCheckpoint;
  const admissionAckWatermark =
    advanceSkywayAdmissionAckWatermark({
      watermark: previousWatermark,
      authorityCheckpoint,
    });
  if (
    admissionAckWatermark === previousWatermark ||
    admissionAckWatermark.watermarkHash ===
      previousWatermark.watermarkHash
  ) {
    throw new RangeError(
      'Skyway reconnect ACK watermark was already current.',
    );
  }
  const {
    decision,
    acknowledgement,
  } = changedAcknowledgement({
    correction,
    previousWatermark,
    admissionAckWatermark,
  });
  const checkpoint = createSkywayReconnectAuthorityCheckpoint({
    authorityCheckpoint,
    leaseWindow:
      previousCheckpoint.components.leaseWindowSnapshot,
    admissionAckWatermark,
  });
  if (
    checkpoint.authorityCheckpointHash !==
      previousCheckpoint.authorityCheckpointHash ||
    checkpoint.leaseWindowSnapshotHash !==
      previousCheckpoint.leaseWindowSnapshotHash ||
    checkpoint.admissionAckWatermarkHash !==
      admissionAckWatermark.watermarkHash ||
    checkpoint.reconnectAuthorityCheckpointHash ===
      previousCheckpoint.reconnectAuthorityCheckpointHash
  ) {
    throw new RangeError(
      'Skyway reconnect ACK checkpoint advance is invalid.',
    );
  }

  const deliveryIntent = createDeliveryIntent({
    correction,
    previousCheckpoint,
    checkpoint,
    admissionAckWatermark,
    decision,
    acknowledgement,
  });
  const payload = {
    version: SKYWAY_RECONNECT_ACK_COMMIT_VERSION,
    kind: 'skyway-reconnect-ack-commit',
    ownerId: correction.ownerId,
    participantId: decision.participantId,
    sessionIncarnationHash: correction.sessionIncarnationHash,
    roundEpoch: correction.roundEpoch,
    tick: correction.tick,
    ackSequence: acknowledgement.ackSequence,
    correctionTransactionHash: correction.transactionHash,
    leaseHash: correction.leaseHash,
    authorityCheckpointHash:
      checkpoint.authorityCheckpointHash,
    leaseWindowSnapshotHash:
      checkpoint.leaseWindowSnapshotHash,
    previousReconnectAuthorityCheckpointHash:
      previousCheckpoint.reconnectAuthorityCheckpointHash,
    reconnectAuthorityCheckpointHash:
      checkpoint.reconnectAuthorityCheckpointHash,
    previousAdmissionAckWatermarkHash:
      previousCheckpoint.admissionAckWatermarkHash,
    admissionAckWatermarkHash:
      admissionAckWatermark.watermarkHash,
    deliveryIntentHash: deliveryIntent.deliveryIntentHash,
    ackWatermarkAdvanced: true,
    ackWatermarkAdopted: false,
    ackWatermarkPublished: false,
    ackDelivered: false,
    eventsCommitted: false,
    suppressPresentation: true,
    requiresDurableWatermarkAdoption: true,
    admissionAckWatermark,
    checkpoint,
    deliveryIntent,
  };
  return deepFreeze({
    ...payload,
    transactionHash: hashSkywaySnapshot(payload),
  });
}
