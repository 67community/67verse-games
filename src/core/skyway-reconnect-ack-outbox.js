import {
  assertSkywayReconnectAckCommitResult,
  validateSkywayReconnectAckDeliveryIntent,
} from './skyway-reconnect-ack-commit.js';
import {
  assertSkywayReconnectAuthorityCheckpoint,
} from './skyway-reconnect-authority-checkpoint.js';
import {
  canonicalizeSkywaySnapshot,
  hashSkywaySnapshot,
} from './skyway-snapshot-history.js';

export const SKYWAY_RECONNECT_ACK_OUTBOX_VERSION = 1;
export const SKYWAY_RECONNECT_ACK_OUTBOX_DEFAULT_CAPACITY = 8;
export const SKYWAY_RECONNECT_ACK_OUTBOX_MAX_CAPACITY = 8;
export const SKYWAY_RECONNECT_ACK_OUTBOX_ENTRY_MAX_BYTES = 4_096;
export const SKYWAY_RECONNECT_ACK_OUTBOX_CLAIM_MAX_BYTES = 1_024;
export const SKYWAY_RECONNECT_ACK_OUTBOX_MAX_BYTES = 48 * 1_024;

const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;
const ADOPTION_KEYS = Object.freeze([
  'ackCommitTransactionHash',
  'ackDelivered',
  'ackSequence',
  'admissionAckWatermarkHash',
  'adoptedRevision',
  'adoptionHash',
  'authorityCheckpointHash',
  'correctionTransactionHash',
  'deliveryIntent',
  'deliveryIntentHash',
  'durablyAdopted',
  'eventsCommitted',
  'kind',
  'leaseHash',
  'leaseWindowSnapshotHash',
  'ownerId',
  'participantId',
  'postReconnectAuthorityCheckpointHash',
  'postWatermarkHash',
  'preReconnectAuthorityCheckpointHash',
  'preWatermarkHash',
  'receiptRecorded',
  'roundEpoch',
  'sessionIncarnationHash',
  'version',
]);
const CLAIM_KEYS = Object.freeze([
  'ackCommitTransactionHash',
  'claimHash',
  'claimRevision',
  'deliveryIntentHash',
  'kind',
  'ownerId',
  'postReconnectAuthorityCheckpointHash',
  'roundEpoch',
  'sessionIncarnationHash',
  'version',
]);
const JOURNAL_KEYS = Object.freeze([
  'adoptedAdmissionAckWatermarkHash',
  'adoptedReconnectAuthorityCheckpointHash',
  'capacity',
  'kind',
  'revision',
  'rosterHash',
  'roundEpoch',
  'sessionIncarnationHash',
  'slots',
  'version',
]);
const SLOT_KEYS = Object.freeze([
  'adoption',
  'claim',
  'consumedRevision',
  'status',
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

function byteLength(value) {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

function immutableClone(value) {
  return deepFreeze(structuredClone(value));
}

function adoptionPayload(adoption) {
  const { adoptionHash: ignoredAdoptionHash, ...payload } = adoption;
  return payload;
}

function assertAdoption(adoption) {
  if (
    !exactKeys(adoption, ADOPTION_KEYS) ||
    adoption.version !== SKYWAY_RECONNECT_ACK_OUTBOX_VERSION ||
    adoption.kind !== 'skyway-reconnect-ack-adoption' ||
    typeof adoption.ownerId !== 'string' ||
    typeof adoption.participantId !== 'string' ||
    !validHash(adoption.sessionIncarnationHash) ||
    !Number.isSafeInteger(adoption.roundEpoch) ||
    adoption.roundEpoch < 1 ||
    !Number.isInteger(adoption.ackSequence) ||
    adoption.ackSequence < 0 ||
    !validHash(adoption.correctionTransactionHash) ||
    !validHash(adoption.ackCommitTransactionHash) ||
    !validHash(adoption.leaseHash) ||
    !validHash(adoption.authorityCheckpointHash) ||
    !validHash(adoption.leaseWindowSnapshotHash) ||
    !validHash(adoption.preReconnectAuthorityCheckpointHash) ||
    !validHash(adoption.postReconnectAuthorityCheckpointHash) ||
    adoption.preReconnectAuthorityCheckpointHash ===
      adoption.postReconnectAuthorityCheckpointHash ||
    !validHash(adoption.preWatermarkHash) ||
    !validHash(adoption.postWatermarkHash) ||
    adoption.preWatermarkHash === adoption.postWatermarkHash ||
    !validHash(adoption.admissionAckWatermarkHash) ||
    adoption.admissionAckWatermarkHash !==
      adoption.postWatermarkHash ||
    !validHash(adoption.deliveryIntentHash) ||
    !Number.isSafeInteger(adoption.adoptedRevision) ||
    adoption.adoptedRevision < 1 ||
    adoption.durablyAdopted !== false ||
    adoption.ackDelivered !== false ||
    adoption.receiptRecorded !== false ||
    adoption.eventsCommitted !== false ||
    !validHash(adoption.adoptionHash)
  ) {
    throw new TypeError('Invalid Skyway reconnect ACK adoption.');
  }
  const intent = validateSkywayReconnectAckDeliveryIntent(
    adoption.deliveryIntent,
  );
  if (
    adoption.ownerId !== intent.ownerId ||
    adoption.participantId !== intent.participantId ||
    adoption.sessionIncarnationHash !==
      intent.sessionIncarnationHash ||
    adoption.roundEpoch !== intent.roundEpoch ||
    adoption.ackSequence !== intent.ackSequence ||
    adoption.correctionTransactionHash !==
      intent.correctionTransactionHash ||
    adoption.leaseHash !== intent.leaseHash ||
    adoption.authorityCheckpointHash !==
      intent.authorityCheckpointHash ||
    adoption.preReconnectAuthorityCheckpointHash !==
      intent.previousReconnectAuthorityCheckpointHash ||
    adoption.postReconnectAuthorityCheckpointHash !==
      intent.reconnectAuthorityCheckpointHash ||
    adoption.preWatermarkHash !==
      intent.previousAdmissionAckWatermarkHash ||
    adoption.postWatermarkHash !==
      intent.admissionAckWatermarkHash ||
    adoption.deliveryIntentHash !== intent.deliveryIntentHash ||
    hashSkywaySnapshot(adoptionPayload(adoption)) !==
      adoption.adoptionHash ||
    byteLength(adoption) >
      SKYWAY_RECONNECT_ACK_OUTBOX_ENTRY_MAX_BYTES
  ) {
    throw new RangeError(
      'Skyway reconnect ACK adoption binding is invalid.',
    );
  }
  return adoption;
}

function claimPayload(claim) {
  const { claimHash: ignoredClaimHash, ...payload } = claim;
  return payload;
}

export function validateSkywayReconnectAckDeliveryClaim(claim) {
  if (
    !exactKeys(claim, CLAIM_KEYS) ||
    claim.version !== SKYWAY_RECONNECT_ACK_OUTBOX_VERSION ||
    claim.kind !== 'skyway-reconnect-ack-delivery-claim' ||
    typeof claim.ownerId !== 'string' ||
    !validHash(claim.sessionIncarnationHash) ||
    !Number.isSafeInteger(claim.roundEpoch) ||
    claim.roundEpoch < 1 ||
    !validHash(claim.ackCommitTransactionHash) ||
    !validHash(claim.deliveryIntentHash) ||
    !validHash(claim.postReconnectAuthorityCheckpointHash) ||
    !Number.isSafeInteger(claim.claimRevision) ||
    claim.claimRevision < 1 ||
    !validHash(claim.claimHash)
  ) {
    throw new TypeError(
      'Invalid Skyway reconnect ACK delivery claim.',
    );
  }
  if (
    hashSkywaySnapshot(claimPayload(claim)) !== claim.claimHash ||
    byteLength(claim) > SKYWAY_RECONNECT_ACK_OUTBOX_CLAIM_MAX_BYTES
  ) {
    throw new RangeError(
      'Skyway reconnect ACK delivery claim binding is invalid.',
    );
  }
  return claim;
}

function assertSlot(slot, journal) {
  if (
    !exactKeys(slot, SLOT_KEYS) ||
    !['pending', 'claimed', 'consumed'].includes(slot.status)
  ) {
    throw new TypeError(
      'Invalid Skyway reconnect ACK outbox slot.',
    );
  }
  const adoption = assertAdoption(slot.adoption);
  if (
    adoption.sessionIncarnationHash !==
      journal.sessionIncarnationHash ||
    adoption.roundEpoch !== journal.roundEpoch ||
    adoption.adoptedRevision > journal.revision
  ) {
    throw new TypeError(
      'Invalid Skyway reconnect ACK outbox adoption binding.',
    );
  }
  if (slot.status === 'pending') {
    if (slot.claim !== null || slot.consumedRevision !== null) {
      throw new TypeError(
        'Invalid Skyway reconnect ACK pending slot.',
      );
    }
    return;
  }

  const claim = validateSkywayReconnectAckDeliveryClaim(slot.claim);
  if (
    claim.ownerId !== adoption.ownerId ||
    claim.sessionIncarnationHash !==
      adoption.sessionIncarnationHash ||
    claim.roundEpoch !== adoption.roundEpoch ||
    claim.ackCommitTransactionHash !==
      adoption.ackCommitTransactionHash ||
    claim.deliveryIntentHash !== adoption.deliveryIntentHash ||
    claim.postReconnectAuthorityCheckpointHash !==
      adoption.postReconnectAuthorityCheckpointHash ||
    claim.claimRevision <= adoption.adoptedRevision ||
    claim.claimRevision > journal.revision
  ) {
    throw new TypeError(
      'Invalid Skyway reconnect ACK outbox claim binding.',
    );
  }
  if (slot.status === 'claimed') {
    if (slot.consumedRevision !== null) {
      throw new TypeError(
        'Invalid Skyway reconnect ACK claimed slot.',
      );
    }
    return;
  }
  if (
    !Number.isSafeInteger(slot.consumedRevision) ||
    slot.consumedRevision <= claim.claimRevision ||
    slot.consumedRevision > journal.revision
  ) {
    throw new TypeError(
      'Invalid Skyway reconnect ACK consumed slot.',
    );
  }
}

function assertJournal(journal) {
  if (
    !exactKeys(journal, JOURNAL_KEYS) ||
    journal.version !== SKYWAY_RECONNECT_ACK_OUTBOX_VERSION ||
    journal.kind !== 'skyway-reconnect-ack-outbox' ||
    !validHash(journal.sessionIncarnationHash) ||
    !Number.isSafeInteger(journal.roundEpoch) ||
    journal.roundEpoch < 1 ||
    !validHash(journal.rosterHash) ||
    !Number.isInteger(journal.capacity) ||
    journal.capacity < 1 ||
    journal.capacity > SKYWAY_RECONNECT_ACK_OUTBOX_MAX_CAPACITY ||
    !Number.isSafeInteger(journal.revision) ||
    journal.revision < 0 ||
    !validHash(journal.adoptedReconnectAuthorityCheckpointHash) ||
    !validHash(journal.adoptedAdmissionAckWatermarkHash) ||
    !Array.isArray(journal.slots) ||
    journal.slots.length !== journal.capacity
  ) {
    throw new TypeError('Invalid Skyway reconnect ACK outbox.');
  }
  const transactions = new Set();
  const intents = new Set();
  let claimedCount = 0;
  for (const slot of journal.slots) {
    if (slot === null) continue;
    assertSlot(slot, journal);
    if (
      transactions.has(slot.adoption.ackCommitTransactionHash) ||
      intents.has(slot.adoption.deliveryIntentHash)
    ) {
      throw new TypeError(
        'Invalid duplicate Skyway reconnect ACK outbox slot.',
      );
    }
    transactions.add(slot.adoption.ackCommitTransactionHash);
    intents.add(slot.adoption.deliveryIntentHash);
    if (slot.status === 'claimed') claimedCount++;
  }
  if (
    claimedCount > 1 ||
    byteLength(journal) > SKYWAY_RECONNECT_ACK_OUTBOX_MAX_BYTES
  ) {
    throw new RangeError(
      'Skyway reconnect ACK outbox exceeds its bound.',
    );
  }
  return journal;
}

export function assertSkywayReconnectAckOutboxSnapshot(snapshot) {
  return assertJournal(snapshot);
}

function assertCas(journal, expectedRevision) {
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision !== journal.revision
  ) {
    throw new RangeError(
      'Skyway reconnect ACK outbox revision is stale.',
    );
  }
}

function assertRevisionCanAdvance(journal) {
  if (journal.revision >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError(
      'Skyway reconnect ACK outbox revision is exhausted.',
    );
  }
}

function adoptionFromCommit(commit, adoptedRevision) {
  const payload = {
    version: SKYWAY_RECONNECT_ACK_OUTBOX_VERSION,
    kind: 'skyway-reconnect-ack-adoption',
    ownerId: commit.ownerId,
    participantId: commit.participantId,
    sessionIncarnationHash: commit.sessionIncarnationHash,
    roundEpoch: commit.roundEpoch,
    ackSequence: commit.ackSequence,
    correctionTransactionHash: commit.correctionTransactionHash,
    ackCommitTransactionHash: commit.transactionHash,
    leaseHash: commit.leaseHash,
    authorityCheckpointHash: commit.authorityCheckpointHash,
    leaseWindowSnapshotHash: commit.leaseWindowSnapshotHash,
    preReconnectAuthorityCheckpointHash:
      commit.previousReconnectAuthorityCheckpointHash,
    postReconnectAuthorityCheckpointHash:
      commit.reconnectAuthorityCheckpointHash,
    preWatermarkHash: commit.previousAdmissionAckWatermarkHash,
    postWatermarkHash: commit.admissionAckWatermarkHash,
    admissionAckWatermarkHash: commit.admissionAckWatermarkHash,
    deliveryIntentHash: commit.deliveryIntentHash,
    adoptedRevision,
    durablyAdopted: false,
    ackDelivered: false,
    receiptRecorded: false,
    eventsCommitted: false,
    deliveryIntent: immutableClone(commit.deliveryIntent),
  };
  return deepFreeze({
    ...payload,
    adoptionHash: hashSkywaySnapshot(payload),
  });
}

function exactAdoptionRetry(adoption, commit) {
  return (
    adoption.ackCommitTransactionHash === commit.transactionHash &&
    adoption.postReconnectAuthorityCheckpointHash ===
      commit.reconnectAuthorityCheckpointHash &&
    adoption.deliveryIntentHash === commit.deliveryIntentHash &&
    canonicalizeSkywaySnapshot(adoption.deliveryIntent) ===
      canonicalizeSkywaySnapshot(commit.deliveryIntent)
  );
}

function reusableSlotIndex(journal) {
  const empty = journal.slots.indexOf(null);
  if (empty !== -1) return empty;
  let selected = -1;
  let oldestRevision = Number.MAX_SAFE_INTEGER;
  for (let index = 0; index < journal.slots.length; index++) {
    const slot = journal.slots[index];
    if (
      slot.status === 'consumed' &&
      slot.adoption.adoptedRevision < oldestRevision
    ) {
      selected = index;
      oldestRevision = slot.adoption.adoptedRevision;
    }
  }
  return selected;
}

function pendingSlot(journal) {
  let selected = null;
  for (const slot of journal.slots) {
    if (
      slot?.status === 'pending' &&
      (
        selected === null ||
        slot.adoption.adoptedRevision <
          selected.adoption.adoptedRevision
      )
    ) {
      selected = slot;
    }
  }
  return selected;
}

function claimedSlot(journal) {
  return journal.slots.find((slot) => slot?.status === 'claimed');
}

function claimResult(journal, slot) {
  return deepFreeze({
    version: SKYWAY_RECONNECT_ACK_OUTBOX_VERSION,
    kind: 'skyway-reconnect-ack-delivery-claim-result',
    claimed: true,
    outboxConsumed: false,
    ackDelivered: false,
    receiptRecorded: false,
    ownerId: slot.adoption.ownerId,
    roundEpoch: journal.roundEpoch,
    previousRevision: slot.claim.claimRevision - 1,
    revision: slot.claim.claimRevision,
    adoptedReconnectAuthorityCheckpointHash:
      slot.adoption.postReconnectAuthorityCheckpointHash,
    deliveryIntent: slot.adoption.deliveryIntent,
    claim: slot.claim,
  });
}

function consumeResult(journal, slot) {
  return deepFreeze({
    version: SKYWAY_RECONNECT_ACK_OUTBOX_VERSION,
    kind: 'skyway-reconnect-ack-delivery-consume',
    outboxConsumed: true,
    ackDelivered: false,
    receiptRecorded: false,
    ownerId: slot.adoption.ownerId,
    roundEpoch: journal.roundEpoch,
    deliveryIntentHash: slot.adoption.deliveryIntentHash,
    claimHash: slot.claim.claimHash,
    previousRevision: slot.consumedRevision - 1,
    revision: slot.consumedRevision,
    adoptedReconnectAuthorityCheckpointHash:
      slot.adoption.postReconnectAuthorityCheckpointHash,
  });
}

function prospectiveJournal(journal, {
  slotIndex,
  slot,
  revision,
  adoptedReconnectAuthorityCheckpointHash =
    journal.adoptedReconnectAuthorityCheckpointHash,
  adoptedAdmissionAckWatermarkHash =
    journal.adoptedAdmissionAckWatermarkHash,
}) {
  const candidate = structuredClone(journal);
  if (slotIndex !== undefined) candidate.slots[slotIndex] = slot;
  candidate.revision = revision;
  candidate.adoptedReconnectAuthorityCheckpointHash =
    adoptedReconnectAuthorityCheckpointHash;
  candidate.adoptedAdmissionAckWatermarkHash =
    adoptedAdmissionAckWatermarkHash;
  return assertJournal(candidate);
}

export function createSkywayReconnectAckOutbox({
  reconnectAuthorityCheckpoint,
  capacity = SKYWAY_RECONNECT_ACK_OUTBOX_DEFAULT_CAPACITY,
}) {
  const checkpoint = assertSkywayReconnectAuthorityCheckpoint(
    reconnectAuthorityCheckpoint,
  );
  if (
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    capacity > SKYWAY_RECONNECT_ACK_OUTBOX_MAX_CAPACITY
  ) {
    throw new TypeError(
      'Skyway reconnect ACK outbox capacity is invalid.',
    );
  }
  return assertJournal({
    version: SKYWAY_RECONNECT_ACK_OUTBOX_VERSION,
    kind: 'skyway-reconnect-ack-outbox',
    sessionIncarnationHash: checkpoint.sessionIncarnationHash,
    roundEpoch: checkpoint.roundEpoch,
    rosterHash: checkpoint.rosterHash,
    capacity,
    revision: 0,
    adoptedReconnectAuthorityCheckpointHash:
      checkpoint.reconnectAuthorityCheckpointHash,
    adoptedAdmissionAckWatermarkHash:
      checkpoint.admissionAckWatermarkHash,
    slots: Array(capacity).fill(null),
  });
}

export function recordSkywayReconnectAckAdoption(
  journal,
  {
    ackCommit,
    currentReconnectAuthorityCheckpoint,
    expectedRevision,
    expectedAdoptedReconnectAuthorityCheckpointHash,
  },
) {
  assertJournal(journal);
  const commit = assertSkywayReconnectAckCommitResult(ackCommit);
  const current = assertSkywayReconnectAuthorityCheckpoint(
    currentReconnectAuthorityCheckpoint,
  );
  assertCas(journal, expectedRevision);
  if (
    expectedAdoptedReconnectAuthorityCheckpointHash !==
      journal.adoptedReconnectAuthorityCheckpointHash
  ) {
    throw new RangeError(
      'Skyway reconnect ACK outbox checkpoint head is stale.',
    );
  }

  const existing = journal.slots.find((slot) => (
    slot?.adoption.ackCommitTransactionHash ===
      commit.transactionHash
  ));
  if (existing) {
    if (!exactAdoptionRetry(existing.adoption, commit)) {
      throw new RangeError(
        'Skyway reconnect ACK adoption retry conflicts.',
      );
    }
    return immutableClone(existing.adoption);
  }
  if (
    current.reconnectAuthorityCheckpointHash !==
      journal.adoptedReconnectAuthorityCheckpointHash ||
    current.reconnectAuthorityCheckpointHash !==
      commit.previousReconnectAuthorityCheckpointHash ||
    current.sessionIncarnationHash !==
      journal.sessionIncarnationHash ||
    current.roundEpoch !== journal.roundEpoch ||
    current.rosterHash !== journal.rosterHash ||
    commit.sessionIncarnationHash !==
      journal.sessionIncarnationHash ||
    commit.roundEpoch !== journal.roundEpoch ||
    commit.checkpoint.rosterHash !== journal.rosterHash ||
    commit.previousAdmissionAckWatermarkHash !==
      journal.adoptedAdmissionAckWatermarkHash ||
    commit.previousAdmissionAckWatermarkHash !==
      current.admissionAckWatermarkHash ||
    commit.authorityCheckpointHash !==
      current.authorityCheckpointHash ||
    commit.leaseWindowSnapshotHash !==
      current.leaseWindowSnapshotHash
  ) {
    throw new RangeError(
      'Skyway reconnect ACK adoption transition is stale.',
    );
  }
  assertRevisionCanAdvance(journal);
  const slotIndex = reusableSlotIndex(journal);
  if (slotIndex === -1) {
    throw new RangeError(
      'Skyway reconnect ACK outbox capacity is full.',
    );
  }
  const adoptedRevision = journal.revision + 1;
  const adoption = adoptionFromCommit(commit, adoptedRevision);
  assertAdoption(adoption);
  const slot = {
    status: 'pending',
    adoption,
    claim: null,
    consumedRevision: null,
  };
  prospectiveJournal(journal, {
    slotIndex,
    slot,
    revision: adoptedRevision,
    adoptedReconnectAuthorityCheckpointHash:
      commit.reconnectAuthorityCheckpointHash,
    adoptedAdmissionAckWatermarkHash:
      commit.admissionAckWatermarkHash,
  });

  journal.slots[slotIndex] = slot;
  journal.adoptedReconnectAuthorityCheckpointHash =
    commit.reconnectAuthorityCheckpointHash;
  journal.adoptedAdmissionAckWatermarkHash =
    commit.admissionAckWatermarkHash;
  journal.revision = adoptedRevision;
  return adoption;
}

export function claimNextSkywayReconnectAckDelivery(
  journal,
  { expectedRevision },
) {
  assertJournal(journal);
  assertCas(journal, expectedRevision);
  const alreadyClaimed = claimedSlot(journal);
  if (alreadyClaimed) {
    return claimResult(journal, alreadyClaimed);
  }
  const slot = pendingSlot(journal);
  if (!slot) {
    throw new RangeError(
      'Skyway reconnect ACK delivery outbox is empty.',
    );
  }
  assertRevisionCanAdvance(journal);
  const claimRevision = journal.revision + 1;
  const payload = {
    version: SKYWAY_RECONNECT_ACK_OUTBOX_VERSION,
    kind: 'skyway-reconnect-ack-delivery-claim',
    ownerId: slot.adoption.ownerId,
    sessionIncarnationHash: journal.sessionIncarnationHash,
    roundEpoch: journal.roundEpoch,
    ackCommitTransactionHash:
      slot.adoption.ackCommitTransactionHash,
    deliveryIntentHash: slot.adoption.deliveryIntentHash,
    postReconnectAuthorityCheckpointHash:
      slot.adoption.postReconnectAuthorityCheckpointHash,
    claimRevision,
  };
  const claim = deepFreeze({
    ...payload,
    claimHash: hashSkywaySnapshot(payload),
  });
  validateSkywayReconnectAckDeliveryClaim(claim);
  const preparedSlot = {
    ...slot,
    status: 'claimed',
    claim,
  };
  const slotIndex = journal.slots.indexOf(slot);
  prospectiveJournal(journal, {
    slotIndex,
    slot: preparedSlot,
    revision: claimRevision,
  });

  slot.status = 'claimed';
  slot.claim = claim;
  journal.revision = claimRevision;
  return claimResult(journal, slot);
}

export function consumeSkywayReconnectAckDeliveryClaim(
  journal,
  { claim, expectedRevision },
) {
  assertJournal(journal);
  const validatedClaim =
    validateSkywayReconnectAckDeliveryClaim(claim);
  assertCas(journal, expectedRevision);
  if (
    validatedClaim.sessionIncarnationHash !==
      journal.sessionIncarnationHash ||
    validatedClaim.roundEpoch !== journal.roundEpoch
  ) {
    throw new RangeError(
      'Skyway reconnect ACK delivery claim lifecycle is stale.',
    );
  }
  const slot = journal.slots.find((candidate) => (
    candidate?.adoption.deliveryIntentHash ===
      validatedClaim.deliveryIntentHash
  ));
  if (!slot) {
    throw new RangeError(
      'Skyway reconnect ACK delivery claim is unavailable.',
    );
  }
  if (
    canonicalizeSkywaySnapshot(slot.claim) !==
      canonicalizeSkywaySnapshot(validatedClaim)
  ) {
    throw new RangeError(
      'Skyway reconnect ACK delivery claim is stale.',
    );
  }
  if (slot.status === 'consumed') {
    return consumeResult(journal, slot);
  }
  if (slot.status !== 'claimed') {
    throw new RangeError(
      'Skyway reconnect ACK delivery claim was not issued.',
    );
  }
  assertRevisionCanAdvance(journal);
  const consumedRevision = journal.revision + 1;
  const preparedSlot = {
    ...slot,
    status: 'consumed',
    consumedRevision,
  };
  const slotIndex = journal.slots.indexOf(slot);
  prospectiveJournal(journal, {
    slotIndex,
    slot: preparedSlot,
    revision: consumedRevision,
  });

  slot.status = 'consumed';
  slot.consumedRevision = consumedRevision;
  journal.revision = consumedRevision;
  return consumeResult(journal, slot);
}

function assertFreshEpochCheckpoint(checkpoint) {
  const leaseWindow = checkpoint.components.leaseWindowSnapshot;
  const watermark = checkpoint.components.admissionAckWatermark;
  if (
    checkpoint.tick !== 0 ||
    leaseWindow.revision !== 0 ||
    !leaseWindow.slots.every((slot) => slot === null) ||
    watermark.admissionRevision !== 0 ||
    !watermark.acknowledgements.every((ack) => (
      ack.ackSequence === -1 &&
      ack.lastAcceptedCommandHash === null
    ))
  ) {
    throw new RangeError(
      'Skyway reconnect ACK outbox reset requires a fresh epoch checkpoint.',
    );
  }
}

export function resetSkywayReconnectAckOutbox(
  journal,
  {
    baseOutboxSnapshot,
    previousReconnectAuthorityCheckpoint,
    nextReconnectAuthorityCheckpoint,
  },
) {
  assertJournal(journal);
  const base = assertJournal(structuredClone(baseOutboxSnapshot));
  const previous = assertSkywayReconnectAuthorityCheckpoint(
    previousReconnectAuthorityCheckpoint,
  );
  const next = assertSkywayReconnectAuthorityCheckpoint(
    nextReconnectAuthorityCheckpoint,
  );
  if (
    canonicalizeSkywaySnapshot(base) !==
      canonicalizeSkywaySnapshot(journal) ||
    previous.reconnectAuthorityCheckpointHash !==
      journal.adoptedReconnectAuthorityCheckpointHash ||
    previous.admissionAckWatermarkHash !==
      journal.adoptedAdmissionAckWatermarkHash
  ) {
    throw new RangeError(
      'Skyway reconnect ACK outbox reset base is stale.',
    );
  }
  if (journal.roundEpoch >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError(
      'Skyway reconnect ACK outbox round epoch is exhausted.',
    );
  }
  if (
    previous.sessionIncarnationHash !==
      journal.sessionIncarnationHash ||
    previous.roundEpoch !== journal.roundEpoch ||
    previous.rosterHash !== journal.rosterHash ||
    next.sessionIncarnationHash !== journal.sessionIncarnationHash ||
    next.roundEpoch !== journal.roundEpoch + 1 ||
    next.rosterHash !== journal.rosterHash
  ) {
    throw new RangeError(
      'Skyway reconnect ACK outbox lifecycle reset is not aligned.',
    );
  }
  assertFreshEpochCheckpoint(next);
  const counts = {
    pending: journal.slots.filter((slot) => (
      slot?.status === 'pending'
    )).length,
    claimed: journal.slots.filter((slot) => (
      slot?.status === 'claimed'
    )).length,
    consumed: journal.slots.filter((slot) => (
      slot?.status === 'consumed'
    )).length,
  };
  const result = deepFreeze({
    version: SKYWAY_RECONNECT_ACK_OUTBOX_VERSION,
    kind: 'skyway-reconnect-ack-outbox-reset',
    sessionIncarnationHash: journal.sessionIncarnationHash,
    previousRoundEpoch: journal.roundEpoch,
    roundEpoch: next.roundEpoch,
    previousRevision: journal.revision,
    revision: 0,
    previousAdoptedReconnectAuthorityCheckpointHash:
      journal.adoptedReconnectAuthorityCheckpointHash,
    adoptedReconnectAuthorityCheckpointHash:
      next.reconnectAuthorityCheckpointHash,
    clearedPendingCount: counts.pending,
    clearedClaimedCount: counts.claimed,
    clearedConsumedCount: counts.consumed,
    pendingDeliveryFinalized: false,
    ackDeliveredCount: 0,
    receiptRecordedCount: 0,
  });
  const prepared = {
    ...journal,
    roundEpoch: next.roundEpoch,
    revision: 0,
    adoptedReconnectAuthorityCheckpointHash:
      next.reconnectAuthorityCheckpointHash,
    adoptedAdmissionAckWatermarkHash:
      next.admissionAckWatermarkHash,
    slots: Array(journal.capacity).fill(null),
  };
  assertJournal(prepared);

  journal.roundEpoch = prepared.roundEpoch;
  journal.revision = prepared.revision;
  journal.adoptedReconnectAuthorityCheckpointHash =
    prepared.adoptedReconnectAuthorityCheckpointHash;
  journal.adoptedAdmissionAckWatermarkHash =
    prepared.adoptedAdmissionAckWatermarkHash;
  journal.slots.fill(null);
  return result;
}

export function snapshotSkywayReconnectAckOutbox(journal) {
  assertJournal(journal);
  return immutableClone(journal);
}

export function restoreSkywayReconnectAckOutbox(
  journal,
  snapshot,
  { expectedTargetSnapshotHash },
) {
  assertJournal(journal);
  const source = assertJournal(structuredClone(snapshot));
  const targetSnapshot = snapshotSkywayReconnectAckOutbox(journal);
  const targetHash = hashSkywaySnapshot(targetSnapshot);
  if (
    typeof expectedTargetSnapshotHash !== 'string' ||
    expectedTargetSnapshotHash !== targetHash
  ) {
    throw new RangeError(
      'Skyway reconnect ACK outbox restore target is stale.',
    );
  }
  if (
    source.sessionIncarnationHash !==
      journal.sessionIncarnationHash ||
    source.roundEpoch !== journal.roundEpoch ||
    source.rosterHash !== journal.rosterHash ||
    source.capacity !== journal.capacity
  ) {
    throw new RangeError(
      'Skyway reconnect ACK outbox restore configuration is not aligned.',
    );
  }
  const sourceHash = hashSkywaySnapshot(source);
  if (sourceHash === targetHash) {
    return deepFreeze({
      version: SKYWAY_RECONNECT_ACK_OUTBOX_VERSION,
      kind: 'skyway-reconnect-ack-outbox-restore',
      sessionIncarnationHash: journal.sessionIncarnationHash,
      roundEpoch: journal.roundEpoch,
      previousRevision: journal.revision,
      revision: source.revision,
      previousSnapshotHash: targetHash,
      snapshotHash: sourceHash,
      previousAdoptedReconnectAuthorityCheckpointHash:
        journal.adoptedReconnectAuthorityCheckpointHash,
      adoptedReconnectAuthorityCheckpointHash:
        source.adoptedReconnectAuthorityCheckpointHash,
      changed: false,
      ackDelivered: false,
      receiptRecorded: false,
    });
  }

  const commitTargetHash = hashSkywaySnapshot(
    snapshotSkywayReconnectAckOutbox(journal),
  );
  if (commitTargetHash !== targetHash) {
    throw new RangeError(
      'Skyway reconnect ACK outbox restore target changed during preparation.',
    );
  }
  const result = deepFreeze({
    version: SKYWAY_RECONNECT_ACK_OUTBOX_VERSION,
    kind: 'skyway-reconnect-ack-outbox-restore',
    sessionIncarnationHash: journal.sessionIncarnationHash,
    roundEpoch: journal.roundEpoch,
    previousRevision: journal.revision,
    revision: source.revision,
    previousSnapshotHash: targetHash,
    snapshotHash: sourceHash,
    previousAdoptedReconnectAuthorityCheckpointHash:
      journal.adoptedReconnectAuthorityCheckpointHash,
    adoptedReconnectAuthorityCheckpointHash:
      source.adoptedReconnectAuthorityCheckpointHash,
    changed: true,
    ackDelivered: false,
    receiptRecorded: false,
  });
  for (const key of Object.keys(journal)) {
    if (!Object.hasOwn(source, key)) delete journal[key];
  }
  Object.assign(journal, structuredClone(source));
  return result;
}
