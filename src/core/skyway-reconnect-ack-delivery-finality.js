import {
  validateSkywayReconnectAckDeliveryIntent,
} from './skyway-reconnect-ack-commit.js';
import {
  validateSkywayReconnectAckDeliveryClaim,
} from './skyway-reconnect-ack-outbox.js';
import {
  assertSkywayReconnectFinalityCheckpoint,
} from './skyway-reconnect-finality-checkpoint.js';
import {
  canonicalizeSkywaySnapshot,
  hashSkywaySnapshot,
} from './skyway-snapshot-history.js';

export const SKYWAY_RECONNECT_ACK_DELIVERY_FINALITY_VERSION = 1;
export const SKYWAY_RECONNECT_ACK_DELIVERY_FINALITY_MAX_BYTES =
  16 * 1_024;

const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;
const WATERMARK_KEYS = Object.freeze([
  'ackOutboxRevision',
  'ackOutboxSnapshotHash',
  'kind',
  'owners',
  'reconnectAuthorityCheckpointHash',
  'reconnectFinalityCheckpointHash',
  'rosterHash',
  'roundEpoch',
  'sessionIncarnationHash',
  'tick',
  'version',
  'watermarkHash',
]);
const OWNER_KEYS = Object.freeze([
  'delivered',
  'ownerId',
  'receipt',
]);
const STAGE_KEYS = Object.freeze([
  'ackOutboxRevision',
  'ackOutboxSnapshotHash',
  'ackSequence',
  'adoptionHash',
  'claimHash',
  'consumeHash',
  'consumedRevision',
  'deliveryIntentHash',
  'lastAcceptedCommandHash',
  'ownerId',
  'participantId',
  'reconnectFinalityCheckpointHash',
  'stageHash',
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

function validHash(value) {
  return typeof value === 'string' && HASH_PATTERN.test(value);
}

function boundedId(value) {
  return typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 64 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value);
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

function ownerIds(checkpoint) {
  const ownership = checkpoint.components
    .reconnectAuthorityCheckpoint.components
    .authorityCheckpoint.components.admissionSnapshot.ownership;
  return [...new Set(ownership.map(({ ownerId }) => ownerId))];
}

function acknowledgementFor(checkpoint, ownerId) {
  return checkpoint.components
    .reconnectAuthorityCheckpoint.components
    .admissionAckWatermark.acknowledgements
    .find((acknowledgement) => (
      acknowledgement.ownerId === ownerId
    ));
}

function watermarkPayload(watermark) {
  const { watermarkHash: ignoredWatermarkHash, ...payload } =
    watermark;
  return payload;
}

function stagePayload(stage) {
  const { stageHash: ignoredStageHash, ...payload } = stage;
  return payload;
}

function assertStage(stage, ownerId) {
  if (
    !exactKeys(stage, STAGE_KEYS) ||
    stage.ownerId !== ownerId ||
    !boundedId(stage.ownerId) ||
    !boundedId(stage.participantId) ||
    !Number.isInteger(stage.ackSequence) ||
    stage.ackSequence < 0 ||
    !validHash(stage.lastAcceptedCommandHash) ||
    !validHash(stage.adoptionHash) ||
    !validHash(stage.deliveryIntentHash) ||
    !validHash(stage.claimHash) ||
    !validHash(stage.consumeHash) ||
    !Number.isSafeInteger(stage.consumedRevision) ||
    stage.consumedRevision < 1 ||
    !validHash(stage.reconnectFinalityCheckpointHash) ||
    !validHash(stage.ackOutboxSnapshotHash) ||
    !Number.isSafeInteger(stage.ackOutboxRevision) ||
    stage.ackOutboxRevision < stage.consumedRevision ||
    !validHash(stage.stageHash) ||
    hashSkywaySnapshot(stagePayload(stage)) !== stage.stageHash
  ) {
    throw new TypeError(
      'Invalid Skyway Reconnect ACK Delivery Finality stage.',
    );
  }
  return stage;
}

export function assertSkywayReconnectAckDeliveryFinalityWatermark(
  watermark,
) {
  if (
    !exactKeys(watermark, WATERMARK_KEYS) ||
    watermark.version !==
      SKYWAY_RECONNECT_ACK_DELIVERY_FINALITY_VERSION ||
    watermark.kind !==
      'skyway-reconnect-ack-delivery-finality-watermark' ||
    !validHash(watermark.sessionIncarnationHash) ||
    !Number.isSafeInteger(watermark.roundEpoch) ||
    watermark.roundEpoch < 1 ||
    !validHash(watermark.rosterHash) ||
    !Number.isSafeInteger(watermark.tick) ||
    watermark.tick < 0 ||
    !validHash(watermark.reconnectFinalityCheckpointHash) ||
    !validHash(watermark.reconnectAuthorityCheckpointHash) ||
    !validHash(watermark.ackOutboxSnapshotHash) ||
    !Number.isSafeInteger(watermark.ackOutboxRevision) ||
    watermark.ackOutboxRevision < 0 ||
    !Array.isArray(watermark.owners) ||
    watermark.owners.length < 1 ||
    watermark.owners.length > 8 ||
    !validHash(watermark.watermarkHash)
  ) {
    throw new TypeError(
      'Invalid Skyway Reconnect ACK Delivery Finality watermark.',
    );
  }
  const seenOwners = new Set();
  for (const owner of watermark.owners) {
    if (
      !exactKeys(owner, OWNER_KEYS) ||
      !boundedId(owner.ownerId) ||
      seenOwners.has(owner.ownerId)
    ) {
      throw new TypeError(
        'Invalid Skyway Reconnect ACK Delivery Finality owner.',
      );
    }
    seenOwners.add(owner.ownerId);
    if (owner.delivered !== null) {
      assertStage(owner.delivered, owner.ownerId);
    }
    if (owner.receipt !== null) {
      assertStage(owner.receipt, owner.ownerId);
      if (
        owner.delivered === null ||
        owner.receipt.ackSequence >
          owner.delivered.ackSequence
      ) {
        throw new RangeError(
          'Skyway Reconnect ACK Receipt Finality exceeds delivery.',
        );
      }
    }
  }
  if (
    hashSkywaySnapshot(watermarkPayload(watermark)) !==
      watermark.watermarkHash ||
    byteLength(watermark) >
      SKYWAY_RECONNECT_ACK_DELIVERY_FINALITY_MAX_BYTES
  ) {
    throw new RangeError(
      'Skyway Reconnect ACK Delivery Finality watermark binding is invalid.',
    );
  }
  return watermark;
}

function buildWatermark(payload) {
  return assertSkywayReconnectAckDeliveryFinalityWatermark(
    deepFreeze({
      ...payload,
      watermarkHash: hashSkywaySnapshot(payload),
    }),
  );
}

function assertLifecycle(watermark, checkpoint) {
  const candidateOwnerIds = ownerIds(checkpoint);
  if (
    checkpoint.sessionIncarnationHash !==
      watermark.sessionIncarnationHash ||
    checkpoint.roundEpoch !== watermark.roundEpoch ||
    checkpoint.rosterHash !== watermark.rosterHash
  ) {
    throw new RangeError(
      'Skyway Reconnect ACK Delivery Finality lifecycle is stale.',
    );
  }
  if (!sameOrder(
    candidateOwnerIds,
    watermark.owners.map(({ ownerId }) => ownerId),
  )) {
    throw new TypeError(
      'Skyway Reconnect ACK Delivery Finality ownership is incompatible.',
    );
  }
}

function assertCheckpointHead(watermark, checkpoint) {
  if (checkpoint.ackOutboxRevision < watermark.ackOutboxRevision) {
    throw new RangeError(
      'Skyway Reconnect ACK Delivery Finality would rewind the Outbox head.',
    );
  }
  if (
    checkpoint.ackOutboxRevision ===
      watermark.ackOutboxRevision &&
    (
      checkpoint.ackOutboxSnapshotHash !==
        watermark.ackOutboxSnapshotHash ||
      checkpoint.reconnectFinalityCheckpointHash !==
        watermark.reconnectFinalityCheckpointHash
    )
  ) {
    throw new RangeError(
      'Skyway Reconnect ACK Delivery Finality would fork the Outbox head.',
    );
  }
}

export function createSkywayReconnectAckDeliveryFinalityWatermark({
  reconnectFinalityCheckpoint,
}) {
  const checkpoint = assertSkywayReconnectFinalityCheckpoint(
    reconnectFinalityCheckpoint,
  );
  return buildWatermark({
    version: SKYWAY_RECONNECT_ACK_DELIVERY_FINALITY_VERSION,
    kind: 'skyway-reconnect-ack-delivery-finality-watermark',
    sessionIncarnationHash: checkpoint.sessionIncarnationHash,
    roundEpoch: checkpoint.roundEpoch,
    tick: checkpoint.tick,
    rosterHash: checkpoint.rosterHash,
    reconnectFinalityCheckpointHash:
      checkpoint.reconnectFinalityCheckpointHash,
    reconnectAuthorityCheckpointHash:
      checkpoint.reconnectAuthorityCheckpointHash,
    ackOutboxSnapshotHash: checkpoint.ackOutboxSnapshotHash,
    ackOutboxRevision: checkpoint.ackOutboxRevision,
    owners: ownerIds(checkpoint).map((ownerId) => ({
      ownerId,
      delivered: null,
      receipt: null,
    })),
  });
}

function consumePayload(slot) {
  return {
    ackCommitTransactionHash:
      slot.adoption.ackCommitTransactionHash,
    adoptionHash: slot.adoption.adoptionHash,
    adoptedRevision: slot.adoption.adoptedRevision,
    deliveryIntentHash: slot.adoption.deliveryIntentHash,
    claimHash: slot.claim.claimHash,
    claimRevision: slot.claim.claimRevision,
    consumedRevision: slot.consumedRevision,
  };
}

function stageFrom({
  authenticatedOwnerId,
  checkpoint,
  deliveryIntent,
  claim,
}) {
  if (!boundedId(authenticatedOwnerId)) {
    throw new TypeError(
      'Skyway Reconnect ACK Delivery Finality owner is invalid.',
    );
  }
  const intent = validateSkywayReconnectAckDeliveryIntent(
    deliveryIntent,
  );
  const validatedClaim =
    validateSkywayReconnectAckDeliveryClaim(claim);
  const slot = checkpoint.components.ackOutboxSnapshot.slots
    .find((candidate) => (
      candidate?.claim?.claimHash === validatedClaim.claimHash
    ));
  if (
    !slot ||
    slot.status !== 'consumed' ||
    slot.adoption.ownerId !== authenticatedOwnerId ||
    intent.ownerId !== authenticatedOwnerId ||
    validatedClaim.ownerId !== authenticatedOwnerId ||
    !canonicalEqual(slot.adoption.deliveryIntent, intent) ||
    !canonicalEqual(slot.claim, validatedClaim) ||
    slot.adoption.deliveryIntentHash !== intent.deliveryIntentHash ||
    slot.adoption.ackSequence !== intent.ackSequence ||
    slot.adoption.participantId !== intent.participantId ||
    slot.consumedRevision > checkpoint.ackOutboxRevision
  ) {
    throw new RangeError(
      'Skyway Reconnect ACK Delivery Finality evidence is stale.',
    );
  }
  const acknowledgement = acknowledgementFor(
    checkpoint,
    authenticatedOwnerId,
  );
  if (
    !acknowledgement ||
    acknowledgement.ackSequence < intent.ackSequence ||
    (
      acknowledgement.ackSequence === intent.ackSequence &&
      acknowledgement.lastAcceptedCommandHash !==
        intent.lastAcceptedCommandHash
    )
  ) {
    throw new RangeError(
      'Skyway Reconnect ACK Delivery Finality ACK floor is stale.',
    );
  }
  const payload = {
    ownerId: authenticatedOwnerId,
    participantId: intent.participantId,
    ackSequence: intent.ackSequence,
    lastAcceptedCommandHash: intent.lastAcceptedCommandHash,
    adoptionHash: slot.adoption.adoptionHash,
    deliveryIntentHash: intent.deliveryIntentHash,
    claimHash: validatedClaim.claimHash,
    consumeHash: hashSkywaySnapshot(consumePayload(slot)),
    consumedRevision: slot.consumedRevision,
    reconnectFinalityCheckpointHash:
      checkpoint.reconnectFinalityCheckpointHash,
    ackOutboxSnapshotHash: checkpoint.ackOutboxSnapshotHash,
    ackOutboxRevision: checkpoint.ackOutboxRevision,
  };
  return deepFreeze({
    ...payload,
    stageHash: hashSkywaySnapshot(payload),
  });
}

function sameCoreEvidence(first, second) {
  return (
    first.ownerId === second.ownerId &&
    first.participantId === second.participantId &&
    first.ackSequence === second.ackSequence &&
    first.lastAcceptedCommandHash ===
      second.lastAcceptedCommandHash &&
    first.adoptionHash === second.adoptionHash &&
    first.deliveryIntentHash === second.deliveryIntentHash &&
    first.claimHash === second.claimHash &&
    first.consumeHash === second.consumeHash &&
    first.consumedRevision === second.consumedRevision
  );
}

function nextWatermark(watermark, checkpoint, owners) {
  return buildWatermark({
    ...watermarkPayload(watermark),
    tick: checkpoint.tick,
    reconnectFinalityCheckpointHash:
      checkpoint.reconnectFinalityCheckpointHash,
    reconnectAuthorityCheckpointHash:
      checkpoint.reconnectAuthorityCheckpointHash,
    ackOutboxSnapshotHash: checkpoint.ackOutboxSnapshotHash,
    ackOutboxRevision: checkpoint.ackOutboxRevision,
    owners,
  });
}

function prepareAdvance({
  watermark,
  authenticatedOwnerId,
  reconnectFinalityCheckpoint,
  deliveryIntent,
  claim,
}) {
  const current =
    assertSkywayReconnectAckDeliveryFinalityWatermark(watermark);
  const checkpoint = assertSkywayReconnectFinalityCheckpoint(
    reconnectFinalityCheckpoint,
  );
  assertLifecycle(current, checkpoint);
  assertCheckpointHead(current, checkpoint);
  const ownerIndex = current.owners.findIndex(({ ownerId }) => (
    ownerId === authenticatedOwnerId
  ));
  if (ownerIndex === -1) {
    throw new RangeError(
      'Skyway Reconnect ACK Delivery Finality owner is unauthorized.',
    );
  }
  const stage = stageFrom({
    authenticatedOwnerId,
    checkpoint,
    deliveryIntent,
    claim,
  });
  return {
    current,
    checkpoint,
    ownerIndex,
    stage,
  };
}

export function advanceSkywayReconnectAckDeliveryFinality({
  watermark,
  authenticatedOwnerId,
  reconnectFinalityCheckpoint,
  deliveryIntent,
  claim,
}) {
  const {
    current,
    checkpoint,
    ownerIndex,
    stage,
  } = prepareAdvance({
    watermark,
    authenticatedOwnerId,
    reconnectFinalityCheckpoint,
    deliveryIntent,
    claim,
  });
  const committed = current.owners[ownerIndex].delivered;
  if (committed !== null) {
    if (stage.ackSequence < committed.ackSequence) {
      throw new RangeError(
        'Skyway Reconnect ACK Delivery Finality cannot move backwards.',
      );
    }
    if (stage.ackSequence === committed.ackSequence) {
      if (!sameCoreEvidence(stage, committed)) {
        throw new RangeError(
          'Skyway Reconnect ACK Delivery Finality cannot fork a delivered ACK.',
        );
      }
      return current;
    }
  }
  const owners = structuredClone(current.owners);
  owners[ownerIndex].delivered = stage;
  return nextWatermark(current, checkpoint, owners);
}

export function advanceSkywayReconnectAckReceiptFinality({
  watermark,
  authenticatedOwnerId,
  reconnectFinalityCheckpoint,
  deliveryIntent,
  claim,
}) {
  const {
    current,
    checkpoint,
    ownerIndex,
    stage,
  } = prepareAdvance({
    watermark,
    authenticatedOwnerId,
    reconnectFinalityCheckpoint,
    deliveryIntent,
    claim,
  });
  const delivered = current.owners[ownerIndex].delivered;
  const receipt = current.owners[ownerIndex].receipt;
  if (
    delivered === null ||
    !sameCoreEvidence(stage, delivered)
  ) {
    throw new RangeError(
      'Skyway Reconnect ACK Receipt Finality requires the exact current delivered frontier.',
    );
  }
  if (receipt !== null) {
    if (stage.ackSequence < receipt.ackSequence) {
      throw new RangeError(
        'Skyway Reconnect ACK Receipt Finality cannot move backwards.',
      );
    }
    if (stage.ackSequence === receipt.ackSequence) {
      if (!sameCoreEvidence(stage, receipt)) {
        throw new RangeError(
          'Skyway Reconnect ACK Receipt Finality cannot fork a receipt.',
        );
      }
      return current;
    }
  }
  const owners = structuredClone(current.owners);
  owners[ownerIndex].receipt = stage;
  return nextWatermark(current, checkpoint, owners);
}

function retainedStageMatches(checkpoint, stage) {
  const slot = checkpoint.components.ackOutboxSnapshot.slots
    .find((candidate) => (
      candidate?.claim?.claimHash === stage.claimHash
    ));
  if (!slot) return null;
  return (
    slot.status === 'consumed' &&
    slot.adoption.ownerId === stage.ownerId &&
    slot.adoption.participantId === stage.participantId &&
    slot.adoption.ackSequence === stage.ackSequence &&
    slot.adoption.adoptionHash === stage.adoptionHash &&
    slot.adoption.deliveryIntentHash === stage.deliveryIntentHash &&
    slot.consumedRevision === stage.consumedRevision &&
    hashSkywaySnapshot(consumePayload(slot)) === stage.consumeHash
  );
}

function assertStageRestore(checkpoint, stage, label) {
  if (stage === null) return;
  const acknowledgement = acknowledgementFor(
    checkpoint,
    stage.ownerId,
  );
  if (
    !acknowledgement ||
    acknowledgement.ackSequence < stage.ackSequence ||
    (
      acknowledgement.ackSequence === stage.ackSequence &&
      acknowledgement.lastAcceptedCommandHash !==
        stage.lastAcceptedCommandHash
    ) ||
    checkpoint.ackOutboxRevision < stage.ackOutboxRevision
  ) {
    throw new RangeError(
      `Skyway Reconnect ACK ${label} restore would rewind owner ${stage.ownerId}.`,
    );
  }
  const retainedMatch = retainedStageMatches(checkpoint, stage);
  if (retainedMatch === false) {
    throw new RangeError(
      `Skyway Reconnect ACK ${label} restore would fork owner ${stage.ownerId}.`,
    );
  }
  if (
    retainedMatch === null &&
    checkpoint.ackOutboxRevision === stage.ackOutboxRevision &&
    (
      checkpoint.ackOutboxSnapshotHash !==
        stage.ackOutboxSnapshotHash ||
      checkpoint.reconnectFinalityCheckpointHash !==
        stage.reconnectFinalityCheckpointHash
    )
  ) {
    throw new RangeError(
      `Skyway Reconnect ACK ${label} restore lost current evidence for owner ${stage.ownerId}.`,
    );
  }
}

export function assertSkywayReconnectAckDeliveryFinalityRestore(
  watermark,
  { reconnectFinalityCheckpoint },
) {
  const current =
    assertSkywayReconnectAckDeliveryFinalityWatermark(watermark);
  const checkpoint = assertSkywayReconnectFinalityCheckpoint(
    reconnectFinalityCheckpoint,
  );
  assertLifecycle(current, checkpoint);
  assertCheckpointHead(current, checkpoint);
  for (const owner of current.owners) {
    assertStageRestore(checkpoint, owner.delivered, 'delivery');
    assertStageRestore(checkpoint, owner.receipt, 'receipt');
  }
  return current;
}

export function assertSkywayReconnectAckReceiptFinalityForReclamation(
  watermark,
  {
    reconnectFinalityCheckpoint,
    adoptionHash,
  },
) {
  const current =
    assertSkywayReconnectAckDeliveryFinalityWatermark(watermark);
  const checkpoint = assertSkywayReconnectFinalityCheckpoint(
    reconnectFinalityCheckpoint,
  );
  if (!validHash(adoptionHash)) {
    throw new TypeError(
      'Skyway Reconnect ACK reclamation adoption hash is invalid.',
    );
  }
  assertSkywayReconnectAckDeliveryFinalityRestore(current, {
    reconnectFinalityCheckpoint: checkpoint,
  });
  const slot = checkpoint.components.ackOutboxSnapshot.slots
    .find((candidate) => (
      candidate?.adoption?.adoptionHash === adoptionHash
    ));
  if (!slot || slot.status !== 'consumed') {
    throw new RangeError(
      'Skyway Reconnect ACK reclamation tombstone is unavailable.',
    );
  }
  const owner = current.owners.find(({ ownerId }) => (
    ownerId === slot.adoption.ownerId
  ));
  const receipt = owner?.receipt ?? null;
  if (
    receipt === null ||
    receipt.ownerId !== slot.adoption.ownerId ||
    receipt.participantId !== slot.adoption.participantId ||
    receipt.ackSequence !== slot.adoption.ackSequence ||
    receipt.lastAcceptedCommandHash !==
      slot.adoption.deliveryIntent.lastAcceptedCommandHash ||
    receipt.adoptionHash !== slot.adoption.adoptionHash ||
    receipt.deliveryIntentHash !==
      slot.adoption.deliveryIntentHash ||
    receipt.claimHash !== slot.claim.claimHash ||
    receipt.consumeHash !==
      hashSkywaySnapshot(consumePayload(slot)) ||
    receipt.consumedRevision !== slot.consumedRevision ||
    retainedStageMatches(checkpoint, receipt) !== true
  ) {
    throw new RangeError(
      'Skyway Reconnect ACK reclamation requires exact receipt finality.',
    );
  }
  return receipt;
}

export function resetSkywayReconnectAckDeliveryFinality({
  watermark,
  previousReconnectFinalityCheckpoint,
  nextReconnectFinalityCheckpoint,
}) {
  const current =
    assertSkywayReconnectAckDeliveryFinalityWatermark(watermark);
  const previous = assertSkywayReconnectFinalityCheckpoint(
    previousReconnectFinalityCheckpoint,
  );
  const next = assertSkywayReconnectFinalityCheckpoint(
    nextReconnectFinalityCheckpoint,
  );
  assertSkywayReconnectAckDeliveryFinalityRestore(current, {
    reconnectFinalityCheckpoint: previous,
  });
  const nextAdmissionAckWatermark = next.components
    .reconnectAuthorityCheckpoint.components.admissionAckWatermark;
  if (
    next.sessionIncarnationHash !==
      current.sessionIncarnationHash ||
    next.roundEpoch !== current.roundEpoch + 1 ||
    next.rosterHash !== current.rosterHash ||
    !sameOrder(
      ownerIds(next),
      current.owners.map(({ ownerId }) => ownerId),
    ) ||
    next.tick !== 0 ||
    next.ackOutboxRevision !== 0 ||
    !next.components.ackOutboxSnapshot.slots.every(
      (slot) => slot === null,
    ) ||
    !nextAdmissionAckWatermark.acknowledgements.every(
      (acknowledgement) => (
        acknowledgement.ackSequence === -1 &&
        acknowledgement.lastAcceptedCommandHash === null
      ),
    )
  ) {
    throw new RangeError(
      'Skyway Reconnect ACK Delivery Finality reset is not aligned.',
    );
  }
  const nextWatermark =
    createSkywayReconnectAckDeliveryFinalityWatermark({
      reconnectFinalityCheckpoint: next,
    });
  const payload = {
    version: SKYWAY_RECONNECT_ACK_DELIVERY_FINALITY_VERSION,
    kind: 'skyway-reconnect-ack-delivery-finality-reset',
    sessionIncarnationHash: current.sessionIncarnationHash,
    previousRoundEpoch: current.roundEpoch,
    roundEpoch: next.roundEpoch,
    previousWatermarkHash: current.watermarkHash,
    watermarkHash: nextWatermark.watermarkHash,
    previousReconnectFinalityCheckpointHash:
      previous.reconnectFinalityCheckpointHash,
    reconnectFinalityCheckpointHash:
      next.reconnectFinalityCheckpointHash,
    clearedDeliveredOwnerCount: current.owners.filter(
      ({ delivered }) => delivered !== null,
    ).length,
    clearedReceiptOwnerCount: current.owners.filter(
      ({ receipt }) => receipt !== null,
    ).length,
    priorDeliveryFinalityCarriedForward: false,
    priorReceiptFinalityCarriedForward: false,
    sendPerformed: false,
    receiptAcquired: false,
    watermark: nextWatermark,
  };
  return deepFreeze({
    ...payload,
    transactionHash: hashSkywaySnapshot(payload),
  });
}
