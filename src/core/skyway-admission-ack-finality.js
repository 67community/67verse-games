import {
  SKYWAY_INPUT_ADMISSION_MAX_SEQUENCE,
} from './skyway-input-admission.js';
import {
  hashSkywaySnapshot,
} from './skyway-snapshot-history.js';

export const SKYWAY_ADMISSION_ACK_WATERMARK_VERSION = 1;

const WATERMARK_KEYS = Object.freeze([
  'acknowledgements',
  'admissionRevision',
  'admissionSnapshotHash',
  'authorityCheckpointHash',
  'kind',
  'rosterHash',
  'roundEpoch',
  'sessionIncarnation',
  'tick',
  'version',
  'watermarkHash',
]);
const ACK_KEYS = Object.freeze([
  'ackSequence',
  'lastAcceptedCommandHash',
  'ownerId',
]);

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function boundedId(value, maxLength) {
  return typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= maxLength &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}

function sameAcknowledgements(first, second) {
  return first.length === second.length &&
    first.every((ack, index) => (
      ack.ownerId === second[index].ownerId &&
      ack.ackSequence === second[index].ackSequence &&
      ack.lastAcceptedCommandHash ===
        second[index].lastAcceptedCommandHash
    ));
}

function ownerOrder(ownership) {
  return [...new Set(ownership.map(({ ownerId }) => ownerId))];
}

function bindingFromAuthorityCheckpoint(authorityCheckpoint) {
  const admissionSnapshot =
    authorityCheckpoint?.components?.admissionSnapshot;
  const ownership = admissionSnapshot?.ownership;
  const owners = admissionSnapshot?.owners;
  const expectedOwnerOrder = Array.isArray(ownership)
    ? ownerOrder(ownership)
    : null;
  const {
    authorityCheckpointHash: ignoredAuthorityCheckpointHash,
    ...authorityCheckpointPayload
  } = authorityCheckpoint ?? {};
  if (
    authorityCheckpoint?.version !== 1 ||
    authorityCheckpoint?.kind !== 'skyway-authority-checkpoint' ||
    typeof authorityCheckpoint.authorityCheckpointHash !== 'string' ||
    !boundedId(authorityCheckpoint.sessionIncarnation, 128) ||
    !Number.isSafeInteger(authorityCheckpoint.roundEpoch) ||
    authorityCheckpoint.roundEpoch < 1 ||
    !Number.isSafeInteger(authorityCheckpoint.tick) ||
    authorityCheckpoint.tick < 0 ||
    typeof authorityCheckpoint.rosterHash !== 'string' ||
    typeof authorityCheckpoint.admissionSnapshotHash !== 'string' ||
    !Number.isSafeInteger(admissionSnapshot?.revision) ||
    admissionSnapshot.revision < 0 ||
    admissionSnapshot?.sessionIncarnation !==
      authorityCheckpoint.sessionIncarnation ||
    admissionSnapshot?.roundEpoch !== authorityCheckpoint.roundEpoch ||
    admissionSnapshot?.currentTick !== authorityCheckpoint.tick ||
    authorityCheckpoint.admissionSnapshotHash !==
      hashSkywaySnapshot(admissionSnapshot) ||
    authorityCheckpoint.rosterHash !== hashSkywaySnapshot({
      participantIds: authorityCheckpoint.participantIds,
      ownership,
    }) ||
    authorityCheckpoint.authorityCheckpointHash !==
      hashSkywaySnapshot(authorityCheckpointPayload) ||
    !Array.isArray(expectedOwnerOrder) ||
    !Array.isArray(owners) ||
    expectedOwnerOrder.length !== owners.length
  ) {
    throw new TypeError(
      'Skyway Admission ACK watermark requires an Authority checkpoint.',
    );
  }

  const acknowledgements = owners.map((owner, index) => {
    if (
      owner?.ownerId !== expectedOwnerOrder[index] ||
      !boundedId(owner.ownerId, 64) ||
      !Number.isInteger(owner.ackSequence) ||
      owner.ackSequence < -1 ||
      owner.ackSequence > SKYWAY_INPUT_ADMISSION_MAX_SEQUENCE
    ) {
      throw new TypeError(
        'Skyway Admission ACK watermark ownership is invalid.',
      );
    }
    return {
      ownerId: owner.ownerId,
      ackSequence: owner.ackSequence,
      lastAcceptedCommandHash: owner.ackSequence === -1
        ? null
        : hashSkywaySnapshot(owner.lastAcceptedCommand),
    };
  });
  return {
    sessionIncarnation: authorityCheckpoint.sessionIncarnation,
    roundEpoch: authorityCheckpoint.roundEpoch,
    tick: authorityCheckpoint.tick,
    rosterHash: authorityCheckpoint.rosterHash,
    authorityCheckpointHash:
      authorityCheckpoint.authorityCheckpointHash,
    admissionSnapshotHash: authorityCheckpoint.admissionSnapshotHash,
    admissionRevision: admissionSnapshot.revision,
    acknowledgements,
  };
}

function watermarkPayload({
  sessionIncarnation,
  roundEpoch,
  tick,
  rosterHash,
  authorityCheckpointHash,
  admissionSnapshotHash,
  admissionRevision,
  acknowledgements,
}) {
  return {
    version: SKYWAY_ADMISSION_ACK_WATERMARK_VERSION,
    kind: 'skyway-admission-ack-watermark',
    sessionIncarnation,
    roundEpoch,
    tick,
    rosterHash,
    authorityCheckpointHash,
    admissionSnapshotHash,
    admissionRevision,
    acknowledgements,
  };
}

export function assertSkywayAdmissionAckWatermark(watermark) {
  if (
    !exactKeys(watermark, WATERMARK_KEYS) ||
    watermark.version !== SKYWAY_ADMISSION_ACK_WATERMARK_VERSION ||
    watermark.kind !== 'skyway-admission-ack-watermark' ||
    !boundedId(watermark.sessionIncarnation, 128) ||
    !Number.isSafeInteger(watermark.roundEpoch) ||
    watermark.roundEpoch < 1 ||
    !Number.isSafeInteger(watermark.tick) ||
    watermark.tick < 0 ||
    typeof watermark.rosterHash !== 'string' ||
    typeof watermark.authorityCheckpointHash !== 'string' ||
    typeof watermark.admissionSnapshotHash !== 'string' ||
    !Number.isSafeInteger(watermark.admissionRevision) ||
    watermark.admissionRevision < 0 ||
    !Array.isArray(watermark.acknowledgements) ||
    watermark.acknowledgements.length < 1 ||
    typeof watermark.watermarkHash !== 'string'
  ) {
    throw new TypeError('Invalid Skyway Admission ACK watermark.');
  }
  const seenOwners = new Set();
  for (const acknowledgement of watermark.acknowledgements) {
    if (
      !exactKeys(acknowledgement, ACK_KEYS) ||
      !boundedId(acknowledgement.ownerId, 64) ||
      seenOwners.has(acknowledgement.ownerId) ||
      !Number.isInteger(acknowledgement.ackSequence) ||
      acknowledgement.ackSequence < -1 ||
      acknowledgement.ackSequence >
        SKYWAY_INPUT_ADMISSION_MAX_SEQUENCE ||
      (
        acknowledgement.ackSequence === -1
          ? acknowledgement.lastAcceptedCommandHash !== null
          : typeof acknowledgement.lastAcceptedCommandHash !== 'string'
      )
    ) {
      throw new TypeError('Invalid Skyway Admission ACK watermark.');
    }
    seenOwners.add(acknowledgement.ownerId);
  }
  if (
    hashSkywaySnapshot(watermarkPayload(watermark)) !==
      watermark.watermarkHash
  ) {
    throw new TypeError('Invalid Skyway Admission ACK watermark hash.');
  }
  return watermark;
}

export function createSkywayAdmissionAckWatermark({
  authorityCheckpoint,
}) {
  const binding = bindingFromAuthorityCheckpoint(authorityCheckpoint);
  const payload = watermarkPayload({
    ...binding,
  });
  return deepFreeze({
    ...payload,
    watermarkHash: hashSkywaySnapshot(payload),
  });
}

export function advanceSkywayAdmissionAckWatermark({
  watermark,
  authorityCheckpoint,
}) {
  assertSkywayAdmissionAckWatermark(watermark);
  const binding = bindingFromAuthorityCheckpoint(authorityCheckpoint);
  if (
    binding.sessionIncarnation !== watermark.sessionIncarnation ||
    binding.roundEpoch !== watermark.roundEpoch
  ) {
    throw new RangeError(
      'Skyway Admission ACK watermark lifecycle binding is stale.',
    );
  }
  if (
    binding.rosterHash !== watermark.rosterHash ||
    binding.acknowledgements.length !==
      watermark.acknowledgements.length
  ) {
    throw new TypeError(
      'Skyway Admission ACK watermark ownership is incompatible.',
    );
  }
  for (let index = 0; index < binding.acknowledgements.length; index++) {
    const current = binding.acknowledgements[index];
    const committed = watermark.acknowledgements[index];
    if (current.ownerId !== committed.ownerId) {
      throw new TypeError(
        'Skyway Admission ACK watermark ownership is incompatible.',
      );
    }
    if (current.ackSequence < committed.ackSequence) {
      throw new RangeError(
        'Skyway Admission ACK watermark cannot move backwards.',
      );
    }
    if (
      current.ackSequence === committed.ackSequence &&
      current.lastAcceptedCommandHash !==
        committed.lastAcceptedCommandHash
    ) {
      throw new RangeError(
        'Skyway Admission ACK watermark cannot fork an acknowledged command.',
      );
    }
  }
  if (sameAcknowledgements(
    binding.acknowledgements,
    watermark.acknowledgements,
  )) {
    return watermark;
  }

  const payload = watermarkPayload({
    ...binding,
  });
  return deepFreeze({
    ...payload,
    watermarkHash: hashSkywaySnapshot(payload),
  });
}

export function assertSkywayAdmissionAckRestore(
  watermark,
  { authorityCheckpoint },
) {
  assertSkywayAdmissionAckWatermark(watermark);
  const binding = bindingFromAuthorityCheckpoint(authorityCheckpoint);
  if (
    binding.sessionIncarnation !== watermark.sessionIncarnation ||
    binding.roundEpoch !== watermark.roundEpoch
  ) {
    throw new RangeError(
      'Skyway Admission ACK watermark lifecycle binding is stale.',
    );
  }
  if (
    binding.rosterHash !== watermark.rosterHash ||
    binding.acknowledgements.length !==
      watermark.acknowledgements.length
  ) {
    throw new TypeError(
      'Skyway Admission ACK watermark ownership is incompatible.',
    );
  }
  for (let index = 0; index < binding.acknowledgements.length; index++) {
    const candidate = binding.acknowledgements[index];
    const committed = watermark.acknowledgements[index];
    if (candidate.ownerId !== committed.ownerId) {
      throw new TypeError(
        'Skyway Admission ACK watermark ownership is incompatible.',
      );
    }
    if (candidate.ackSequence < committed.ackSequence) {
      throw new RangeError(
        `Skyway Admission ACK restore would rewind owner ${committed.ownerId}.`,
      );
    }
    if (
      candidate.ackSequence === committed.ackSequence &&
      candidate.lastAcceptedCommandHash !==
        committed.lastAcceptedCommandHash
    ) {
      throw new RangeError(
        `Skyway Admission ACK restore would fork owner ${committed.ownerId}.`,
      );
    }
  }
  return watermark;
}
