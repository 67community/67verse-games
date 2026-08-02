import {
  assertSkywayAdmissionAckRestore,
  assertSkywayAdmissionAckWatermark,
} from './skyway-admission-ack-finality.js';
import {
  SKYWAY_INPUT_ADMISSION_MAX_SEQUENCE,
} from './skyway-input-admission.js';
import {
  hashSkywaySnapshot,
} from './skyway-snapshot-history.js';

export const SKYWAY_RECONNECT_PLANNER_VERSION = 1;
export const SKYWAY_OWNER_RESUME_CLAIM_MAX_BYTES = 512;
export const SKYWAY_OWNER_RESYNC_DIRECTIVE_MAX_BYTES = 2_048;

const CLAIM_KEYS = Object.freeze([
  'ackSequence',
  'admissionAckWatermarkHash',
  'authorityCheckpointHash',
  'claimHash',
  'kind',
  'lastAcceptedCommandHash',
  'ownerId',
  'roundEpoch',
  'sessionIncarnationHash',
  'version',
]);
const DIRECTIVE_KEYS = Object.freeze([
  'action',
  'admissionAckWatermarkHash',
  'authorityCheckpointHash',
  'directiveHash',
  'kind',
  'lastAcceptedCommandHash',
  'nextClientSequence',
  'ownedParticipantIds',
  'ownerId',
  'reason',
  'requiresAuthoritySnapshot',
  'rosterHash',
  'roundEpoch',
  'serverAckSequence',
  'sessionIncarnationHash',
  'tick',
  'version',
]);
const FULL_RESYNC_REASONS = Object.freeze([
  'ack-diverged',
  'authority-changed',
  'lifecycle-changed',
  'sequence-exhausted',
  'watermark-changed',
]);
const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;
const encoder = new TextEncoder();

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function boundedId(value, maxLength) {
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

function claimPayload({
  ownerId,
  sessionIncarnationHash,
  roundEpoch,
  authorityCheckpointHash,
  admissionAckWatermarkHash,
  ackSequence,
  lastAcceptedCommandHash,
}) {
  return {
    version: SKYWAY_RECONNECT_PLANNER_VERSION,
    kind: 'skyway-owner-resume-claim',
    ownerId,
    sessionIncarnationHash,
    roundEpoch,
    authorityCheckpointHash,
    admissionAckWatermarkHash,
    ackSequence,
    lastAcceptedCommandHash,
  };
}

function acknowledgementFor(watermark, ownerId) {
  return watermark.acknowledgements.find((acknowledgement) => (
    acknowledgement.ownerId === ownerId
  )) ?? null;
}

function ownerState(authorityCheckpoint, ownerId) {
  const admissionSnapshot =
    authorityCheckpoint.components.admissionSnapshot;
  const owner = admissionSnapshot.owners.find((entry) => (
    entry.ownerId === ownerId
  ));
  if (!owner) return null;
  return {
    ackSequence: owner.ackSequence,
    lastAcceptedCommandHash: owner.ackSequence === -1
      ? null
      : hashSkywaySnapshot(owner.lastAcceptedCommand),
    participantIds: admissionSnapshot.ownership
      .filter((entry) => entry.ownerId === ownerId)
      .map((entry) => entry.participantId),
  };
}

function directive({
  action,
  reason,
  ownerId,
  owner,
  authorityCheckpoint,
  admissionAckWatermark,
}) {
  const payload = {
    version: SKYWAY_RECONNECT_PLANNER_VERSION,
    kind: 'skyway-owner-resync-directive',
    action,
    reason,
    ownerId,
    ownedParticipantIds: Object.freeze([...owner.participantIds]),
    sessionIncarnationHash: hashSkywaySnapshot(
      authorityCheckpoint.sessionIncarnation,
    ),
    roundEpoch: authorityCheckpoint.roundEpoch,
    tick: authorityCheckpoint.tick,
    rosterHash: authorityCheckpoint.rosterHash,
    authorityCheckpointHash:
      authorityCheckpoint.authorityCheckpointHash,
    admissionAckWatermarkHash:
      admissionAckWatermark.watermarkHash,
    serverAckSequence: owner.ackSequence,
    lastAcceptedCommandHash: owner.lastAcceptedCommandHash,
    nextClientSequence: action === 'resume'
      ? owner.ackSequence + 1
      : null,
    requiresAuthoritySnapshot: action === 'full-resync',
  };
  const result = Object.freeze({
    ...payload,
    directiveHash: hashSkywaySnapshot(payload),
  });
  validateSkywayOwnerResyncDirective(result);
  return result;
}

export function validateSkywayOwnerResumeClaim(claim) {
  if (
    !exactKeys(claim, CLAIM_KEYS) ||
    claim.version !== SKYWAY_RECONNECT_PLANNER_VERSION ||
    claim.kind !== 'skyway-owner-resume-claim' ||
    !boundedId(claim.ownerId, 64) ||
    !validHash(claim.sessionIncarnationHash) ||
    !Number.isSafeInteger(claim.roundEpoch) ||
    claim.roundEpoch < 1 ||
    !validHash(claim.authorityCheckpointHash) ||
    !validHash(claim.admissionAckWatermarkHash) ||
    !Number.isInteger(claim.ackSequence) ||
    claim.ackSequence < -1 ||
    claim.ackSequence > SKYWAY_INPUT_ADMISSION_MAX_SEQUENCE ||
    (
      claim.ackSequence === -1
        ? claim.lastAcceptedCommandHash !== null
        : !validHash(claim.lastAcceptedCommandHash)
    ) ||
    !validHash(claim.claimHash) ||
    byteLength(claim) > SKYWAY_OWNER_RESUME_CLAIM_MAX_BYTES
  ) {
    throw new TypeError('Invalid Skyway owner resume claim.');
  }
  if (hashSkywaySnapshot(claimPayload(claim)) !== claim.claimHash) {
    throw new TypeError('Invalid Skyway owner resume claim hash.');
  }
  return claim;
}

export function createSkywayOwnerResumeClaim({
  admissionAckWatermark,
  ownerId,
}) {
  assertSkywayAdmissionAckWatermark(admissionAckWatermark);
  if (!boundedId(ownerId, 64)) {
    throw new TypeError('Invalid Skyway owner resume claim owner.');
  }
  const acknowledgement =
    acknowledgementFor(admissionAckWatermark, ownerId);
  if (!acknowledgement) {
    throw new TypeError(
      'Skyway owner resume claim owner is not in the watermark.',
    );
  }
  const payload = claimPayload({
    ownerId,
    sessionIncarnationHash: hashSkywaySnapshot(
      admissionAckWatermark.sessionIncarnation,
    ),
    roundEpoch: admissionAckWatermark.roundEpoch,
    authorityCheckpointHash:
      admissionAckWatermark.authorityCheckpointHash,
    admissionAckWatermarkHash:
      admissionAckWatermark.watermarkHash,
    ackSequence: acknowledgement.ackSequence,
    lastAcceptedCommandHash:
      acknowledgement.lastAcceptedCommandHash,
  });
  const claim = Object.freeze({
    ...payload,
    claimHash: hashSkywaySnapshot(payload),
  });
  validateSkywayOwnerResumeClaim(claim);
  return claim;
}

export function validateSkywayOwnerResyncDirective(directive) {
  const resume = directive?.action === 'resume';
  const fullResync = directive?.action === 'full-resync';
  if (
    !exactKeys(directive, DIRECTIVE_KEYS) ||
    directive.version !== SKYWAY_RECONNECT_PLANNER_VERSION ||
    directive.kind !== 'skyway-owner-resync-directive' ||
    (!resume && !fullResync) ||
    (
      resume
        ? directive.reason !== 'exact-match'
        : !FULL_RESYNC_REASONS.includes(directive.reason)
    ) ||
    !boundedId(directive.ownerId, 64) ||
    !Array.isArray(directive.ownedParticipantIds) ||
    directive.ownedParticipantIds.length < 1 ||
    directive.ownedParticipantIds.length > 8 ||
    directive.ownedParticipantIds.some((id) => !boundedId(id, 64)) ||
    new Set(directive.ownedParticipantIds).size !==
      directive.ownedParticipantIds.length ||
    !validHash(directive.sessionIncarnationHash) ||
    !Number.isSafeInteger(directive.roundEpoch) ||
    directive.roundEpoch < 1 ||
    !Number.isSafeInteger(directive.tick) ||
    directive.tick < 0 ||
    !validHash(directive.rosterHash) ||
    !validHash(directive.authorityCheckpointHash) ||
    !validHash(directive.admissionAckWatermarkHash) ||
    !Number.isInteger(directive.serverAckSequence) ||
    directive.serverAckSequence < -1 ||
    directive.serverAckSequence > SKYWAY_INPUT_ADMISSION_MAX_SEQUENCE ||
    (
      directive.serverAckSequence === -1
        ? directive.lastAcceptedCommandHash !== null
        : !validHash(directive.lastAcceptedCommandHash)
    ) ||
    (
      resume
        ? (
            directive.nextClientSequence !==
              directive.serverAckSequence + 1 ||
            directive.requiresAuthoritySnapshot !== false ||
            directive.serverAckSequence >=
              SKYWAY_INPUT_ADMISSION_MAX_SEQUENCE
          )
        : (
            directive.nextClientSequence !== null ||
            directive.requiresAuthoritySnapshot !== true
          )
    ) ||
    !validHash(directive.directiveHash)
  ) {
    throw new TypeError('Invalid Skyway owner resync directive.');
  }
  const {
    directiveHash: ignoredDirectiveHash,
    ...payload
  } = directive;
  if (hashSkywaySnapshot(payload) !== directive.directiveHash) {
    throw new TypeError('Invalid Skyway owner resync directive hash.');
  }
  if (byteLength(directive) > SKYWAY_OWNER_RESYNC_DIRECTIVE_MAX_BYTES) {
    throw new RangeError('Skyway owner resync directive exceeds its bound.');
  }
  return directive;
}

export function planSkywayOwnerResync({
  authenticatedOwnerId,
  claim,
  authorityCheckpoint,
  admissionAckWatermark,
}) {
  validateSkywayOwnerResumeClaim(claim);
  if (
    !boundedId(authenticatedOwnerId, 64) ||
    authenticatedOwnerId !== claim.ownerId
  ) {
    throw new RangeError('Skyway reconnect owner is not authorized.');
  }
  assertSkywayAdmissionAckRestore(admissionAckWatermark, {
    authorityCheckpoint,
  });
  const owner = ownerState(authorityCheckpoint, authenticatedOwnerId);
  const committed = acknowledgementFor(
    admissionAckWatermark,
    authenticatedOwnerId,
  );
  if (!owner || !committed || owner.participantIds.length < 1) {
    throw new RangeError('Skyway reconnect owner is not authorized.');
  }

  let action = 'full-resync';
  let reason = 'ack-diverged';
  if (
    claim.sessionIncarnationHash !== hashSkywaySnapshot(
      authorityCheckpoint.sessionIncarnation,
    ) ||
    claim.roundEpoch !== authorityCheckpoint.roundEpoch
  ) {
    reason = 'lifecycle-changed';
  } else if (
    claim.authorityCheckpointHash !==
      authorityCheckpoint.authorityCheckpointHash
  ) {
    reason = 'authority-changed';
  } else if (
    claim.admissionAckWatermarkHash !==
      admissionAckWatermark.watermarkHash
  ) {
    reason = 'watermark-changed';
  } else if (
    claim.ackSequence !== owner.ackSequence ||
    claim.lastAcceptedCommandHash !==
      owner.lastAcceptedCommandHash ||
    committed.ackSequence !== owner.ackSequence ||
    committed.lastAcceptedCommandHash !==
      owner.lastAcceptedCommandHash
  ) {
    reason = 'ack-diverged';
  } else if (
    owner.ackSequence >= SKYWAY_INPUT_ADMISSION_MAX_SEQUENCE
  ) {
    reason = 'sequence-exhausted';
  } else {
    action = 'resume';
    reason = 'exact-match';
  }

  return directive({
    action,
    reason,
    ownerId: authenticatedOwnerId,
    owner,
    authorityCheckpoint,
    admissionAckWatermark,
  });
}
