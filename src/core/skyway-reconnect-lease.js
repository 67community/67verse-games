import {
  assertSkywayAdmissionAckRestore,
} from './skyway-admission-ack-finality.js';
import {
  SKYWAY_INPUT_ADMISSION_MAX_SEQUENCE,
} from './skyway-input-admission.js';
import {
  projectSkywayOwnerFullResyncSnapshot,
  SKYWAY_OWNER_RESYNC_SNAPSHOT_MAX_BYTES,
} from './skyway-owner-resync-snapshot.js';
import {
  canonicalizeSkywaySnapshot,
  hashSkywaySnapshot,
} from './skyway-snapshot-history.js';

export const SKYWAY_RECONNECT_LEASE_VERSION = 1;
export const SKYWAY_RECONNECT_LEASE_DEFAULT_CAPACITY = 8;
export const SKYWAY_RECONNECT_LEASE_MAX_CAPACITY = 8;
export const SKYWAY_RECONNECT_LEASE_DEFAULT_DURATION_TICKS = 2;
export const SKYWAY_RECONNECT_LEASE_MAX_DURATION_TICKS = 120;
export const SKYWAY_RECONNECT_LEASE_MAX_BYTES = 1_024;
export const SKYWAY_RECONNECT_LEASE_WINDOW_MAX_BYTES = 12 * 1_024;

const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/u;
const TOKEN_KEYS = Object.freeze([
  'admissionAckWatermarkHash',
  'authorityCheckpointHash',
  'directiveHash',
  'expiresAtTick',
  'issuedAtTick',
  'kind',
  'leaseHash',
  'nextClientSequence',
  'ownerId',
  'reservationRevision',
  'resyncSnapshotHash',
  'roundEpoch',
  'sessionIncarnationHash',
  'version',
]);
const SLOT_KEYS = Object.freeze([
  'consumedAtTick',
  'consumedRevision',
  'status',
  'token',
]);
const encoder = new TextEncoder();

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
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

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function restoreObjectState(target, source) {
  for (const key of Object.keys(target)) {
    if (!Object.hasOwn(source, key)) delete target[key];
  }
  Object.assign(target, structuredClone(source));
}

function tokenPayload(token) {
  return {
    version: token.version,
    kind: token.kind,
    ownerId: token.ownerId,
    sessionIncarnationHash: token.sessionIncarnationHash,
    roundEpoch: token.roundEpoch,
    issuedAtTick: token.issuedAtTick,
    expiresAtTick: token.expiresAtTick,
    directiveHash: token.directiveHash,
    resyncSnapshotHash: token.resyncSnapshotHash,
    authorityCheckpointHash: token.authorityCheckpointHash,
    admissionAckWatermarkHash: token.admissionAckWatermarkHash,
    nextClientSequence: token.nextClientSequence,
    reservationRevision: token.reservationRevision,
  };
}

export function validateSkywayReconnectLease(token) {
  if (
    !exactKeys(token, TOKEN_KEYS) ||
    token.version !== SKYWAY_RECONNECT_LEASE_VERSION ||
    token.kind !== 'skyway-reconnect-lease' ||
    !boundedId(token.ownerId) ||
    !validHash(token.sessionIncarnationHash) ||
    !Number.isSafeInteger(token.roundEpoch) ||
    token.roundEpoch < 1 ||
    !Number.isSafeInteger(token.issuedAtTick) ||
    token.issuedAtTick < 0 ||
    !Number.isSafeInteger(token.expiresAtTick) ||
    token.expiresAtTick <= token.issuedAtTick ||
    !validHash(token.directiveHash) ||
    !validHash(token.resyncSnapshotHash) ||
    !validHash(token.authorityCheckpointHash) ||
    !validHash(token.admissionAckWatermarkHash) ||
    !Number.isInteger(token.nextClientSequence) ||
    token.nextClientSequence < 0 ||
    token.nextClientSequence > SKYWAY_INPUT_ADMISSION_MAX_SEQUENCE ||
    !Number.isSafeInteger(token.reservationRevision) ||
    token.reservationRevision < 1 ||
    !validHash(token.leaseHash)
  ) {
    throw new TypeError('Invalid Skyway reconnect lease.');
  }
  if (hashSkywaySnapshot(tokenPayload(token)) !== token.leaseHash) {
    throw new TypeError('Invalid Skyway reconnect lease hash.');
  }
  if (byteLength(token) > SKYWAY_RECONNECT_LEASE_MAX_BYTES) {
    throw new RangeError('Skyway reconnect lease exceeds its bound.');
  }
  return token;
}

function assertWindow(window) {
  if (
    !window ||
    window.version !== SKYWAY_RECONNECT_LEASE_VERSION ||
    window.kind !== 'skyway-reconnect-lease-window' ||
    !validHash(window.sessionIncarnationHash) ||
    !validHash(window.rosterHash) ||
    !Number.isSafeInteger(window.roundEpoch) ||
    window.roundEpoch < 1 ||
    !Number.isInteger(window.capacity) ||
    window.capacity < 1 ||
    window.capacity > SKYWAY_RECONNECT_LEASE_MAX_CAPACITY ||
    !Number.isInteger(window.leaseDurationTicks) ||
    window.leaseDurationTicks < 1 ||
    window.leaseDurationTicks >
      SKYWAY_RECONNECT_LEASE_MAX_DURATION_TICKS ||
    !Number.isSafeInteger(window.revision) ||
    window.revision < 0 ||
    !Array.isArray(window.slots) ||
    window.slots.length !== window.capacity ||
    byteLength(window) > SKYWAY_RECONNECT_LEASE_WINDOW_MAX_BYTES
  ) {
    throw new TypeError('Invalid Skyway reconnect lease window.');
  }
  const activeOwners = new Set();
  const leaseHashes = new Set();
  for (const slot of window.slots) {
    if (slot === null) continue;
    if (
      !exactKeys(slot, SLOT_KEYS) ||
      !['active', 'consumed'].includes(slot.status)
    ) {
      throw new TypeError('Invalid Skyway reconnect lease slot.');
    }
    validateSkywayReconnectLease(slot.token);
    if (
      slot.token.sessionIncarnationHash !==
        window.sessionIncarnationHash ||
      slot.token.roundEpoch !== window.roundEpoch ||
      slot.token.expiresAtTick - slot.token.issuedAtTick !==
        window.leaseDurationTicks ||
      slot.token.reservationRevision > window.revision ||
      leaseHashes.has(slot.token.leaseHash) ||
      (
        slot.status === 'active'
          ? (
              slot.consumedAtTick !== null ||
              slot.consumedRevision !== null ||
              activeOwners.has(slot.token.ownerId)
            )
          : (
              !Number.isSafeInteger(slot.consumedAtTick) ||
              slot.consumedAtTick < slot.token.issuedAtTick ||
              slot.consumedAtTick >= slot.token.expiresAtTick ||
              !Number.isSafeInteger(slot.consumedRevision) ||
              slot.consumedRevision <= slot.token.reservationRevision ||
              slot.consumedRevision > window.revision
            )
      )
    ) {
      throw new TypeError('Invalid Skyway reconnect lease slot binding.');
    }
    leaseHashes.add(slot.token.leaseHash);
    if (slot.status === 'active') activeOwners.add(slot.token.ownerId);
  }
  return window;
}

function assertRevision(window, expectedRevision) {
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision !== window.revision
  ) {
    throw new RangeError('Skyway reconnect lease revision is stale.');
  }
}

function assertCurrentLifecycle(
  window,
  authorityCheckpoint,
  admissionAckWatermark,
) {
  assertSkywayAdmissionAckRestore(admissionAckWatermark, {
    authorityCheckpoint,
  });
  if (
    hashSkywaySnapshot(authorityCheckpoint.sessionIncarnation) !==
      window.sessionIncarnationHash ||
    authorityCheckpoint.roundEpoch !== window.roundEpoch ||
    authorityCheckpoint.rosterHash !== window.rosterHash
  ) {
    throw new RangeError('Skyway reconnect lease lifecycle is stale.');
  }
}

function assertProjection({
  authenticatedOwnerId,
  directive,
  resyncSnapshot,
  authorityCheckpoint,
  admissionAckWatermark,
}) {
  if (
    !resyncSnapshot ||
    byteLength(resyncSnapshot) >
      SKYWAY_OWNER_RESYNC_SNAPSHOT_MAX_BYTES
  ) {
    throw new RangeError('Skyway reconnect lease resync snapshot is invalid.');
  }
  const projected = projectSkywayOwnerFullResyncSnapshot({
    authenticatedOwnerId,
    directive,
    authorityCheckpoint,
    admissionAckWatermark,
  });
  if (
    projected.snapshotHash !== resyncSnapshot.snapshotHash ||
    canonicalizeSkywaySnapshot(projected) !==
      canonicalizeSkywaySnapshot(resyncSnapshot)
  ) {
    throw new RangeError('Skyway reconnect lease resync snapshot is stale.');
  }
  return projected;
}

function activeOwnerSlot(window, ownerId, authoritativeTick) {
  return window.slots.find((slot) => (
    slot?.status === 'active' &&
    slot.token.ownerId === ownerId &&
    authoritativeTick < slot.token.expiresAtTick
  )) ?? null;
}

function reusableSlotIndex(window, authoritativeTick) {
  const empty = window.slots.indexOf(null);
  if (empty !== -1) return empty;
  return window.slots.findIndex((slot) => (
    slot.token.expiresAtTick <= authoritativeTick
  ));
}

function createToken({
  window,
  ownerId,
  directive,
  resyncSnapshot,
  authorityCheckpoint,
  admissionAckWatermark,
}) {
  const nextClientSequence =
    resyncSnapshot.admission.owner.admittedAckSequence + 1;
  if (
    nextClientSequence < 0 ||
    nextClientSequence > SKYWAY_INPUT_ADMISSION_MAX_SEQUENCE
  ) {
    throw new RangeError(
      'Skyway reconnect lease client sequence is exhausted.',
    );
  }
  if (
    authorityCheckpoint.tick >
      Number.MAX_SAFE_INTEGER - window.leaseDurationTicks
  ) {
    throw new RangeError('Skyway reconnect lease tick is exhausted.');
  }
  const payload = {
    version: SKYWAY_RECONNECT_LEASE_VERSION,
    kind: 'skyway-reconnect-lease',
    ownerId,
    sessionIncarnationHash: window.sessionIncarnationHash,
    roundEpoch: window.roundEpoch,
    issuedAtTick: authorityCheckpoint.tick,
    expiresAtTick:
      authorityCheckpoint.tick + window.leaseDurationTicks,
    directiveHash: directive.directiveHash,
    resyncSnapshotHash: resyncSnapshot.snapshotHash,
    authorityCheckpointHash:
      authorityCheckpoint.authorityCheckpointHash,
    admissionAckWatermarkHash:
      admissionAckWatermark.watermarkHash,
    nextClientSequence,
    reservationRevision: window.revision + 1,
  };
  const token = deepFreeze({
    ...payload,
    leaseHash: hashSkywaySnapshot(payload),
  });
  validateSkywayReconnectLease(token);
  return token;
}

export function createSkywayReconnectLeaseWindow({
  authorityCheckpoint,
  admissionAckWatermark,
  capacity = SKYWAY_RECONNECT_LEASE_DEFAULT_CAPACITY,
  leaseDurationTicks =
    SKYWAY_RECONNECT_LEASE_DEFAULT_DURATION_TICKS,
}) {
  assertSkywayAdmissionAckRestore(admissionAckWatermark, {
    authorityCheckpoint,
  });
  if (
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    capacity > SKYWAY_RECONNECT_LEASE_MAX_CAPACITY ||
    !Number.isInteger(leaseDurationTicks) ||
    leaseDurationTicks < 1 ||
    leaseDurationTicks >
      SKYWAY_RECONNECT_LEASE_MAX_DURATION_TICKS
  ) {
    throw new TypeError(
      'Skyway reconnect lease window configuration is invalid.',
    );
  }
  return {
    version: SKYWAY_RECONNECT_LEASE_VERSION,
    kind: 'skyway-reconnect-lease-window',
    sessionIncarnationHash: hashSkywaySnapshot(
      authorityCheckpoint.sessionIncarnation,
    ),
    rosterHash: authorityCheckpoint.rosterHash,
    roundEpoch: authorityCheckpoint.roundEpoch,
    capacity,
    leaseDurationTicks,
    revision: 0,
    slots: Array(capacity).fill(null),
  };
}

export function reserveSkywayReconnectLease(
  window,
  {
    authenticatedOwnerId,
    directive,
    resyncSnapshot,
    authorityCheckpoint,
    admissionAckWatermark,
    expectedRevision,
  },
) {
  assertWindow(window);
  assertRevision(window, expectedRevision);
  assertCurrentLifecycle(
    window,
    authorityCheckpoint,
    admissionAckWatermark,
  );
  const projected = assertProjection({
    authenticatedOwnerId,
    directive,
    resyncSnapshot,
    authorityCheckpoint,
    admissionAckWatermark,
  });
  const active = activeOwnerSlot(
    window,
    authenticatedOwnerId,
    authorityCheckpoint.tick,
  );
  if (active) {
    if (
      active.token.directiveHash === directive.directiveHash &&
      active.token.resyncSnapshotHash === projected.snapshotHash &&
      active.token.authorityCheckpointHash ===
        authorityCheckpoint.authorityCheckpointHash &&
      active.token.admissionAckWatermarkHash ===
        admissionAckWatermark.watermarkHash
    ) {
      return active.token;
    }
    throw new RangeError(
      'Skyway reconnect owner already has an active lease.',
    );
  }

  const slotIndex = reusableSlotIndex(
    window,
    authorityCheckpoint.tick,
  );
  if (slotIndex === -1) {
    throw new RangeError('Skyway reconnect lease capacity is full.');
  }
  const token = createToken({
    window,
    ownerId: authenticatedOwnerId,
    directive,
    resyncSnapshot: projected,
    authorityCheckpoint,
    admissionAckWatermark,
  });
  window.slots[slotIndex] = {
    status: 'active',
    token,
    consumedAtTick: null,
    consumedRevision: null,
  };
  window.revision = token.reservationRevision;
  return token;
}

export function consumeSkywayReconnectLease(
  window,
  {
    authenticatedOwnerId,
    lease,
    authorityCheckpoint,
    admissionAckWatermark,
    expectedRevision,
  },
) {
  assertWindow(window);
  assertRevision(window, expectedRevision);
  validateSkywayReconnectLease(lease);
  if (
    !boundedId(authenticatedOwnerId) ||
    authenticatedOwnerId !== lease.ownerId
  ) {
    throw new RangeError('Skyway reconnect lease owner is not authorized.');
  }
  if (
    lease.sessionIncarnationHash !==
      window.sessionIncarnationHash ||
    lease.roundEpoch !== window.roundEpoch
  ) {
    throw new RangeError('Skyway reconnect lease lifecycle is stale.');
  }
  assertCurrentLifecycle(
    window,
    authorityCheckpoint,
    admissionAckWatermark,
  );
  if (authorityCheckpoint.tick >= lease.expiresAtTick) {
    throw new RangeError('Skyway reconnect lease has expired.');
  }

  const slot = window.slots.find((candidate) => (
    candidate?.token?.leaseHash === lease.leaseHash
  ));
  if (!slot) {
    throw new RangeError('Skyway reconnect lease is stale.');
  }
  if (slot.status === 'consumed') {
    throw new RangeError('Skyway reconnect lease was already consumed.');
  }
  if (
    canonicalizeSkywaySnapshot(slot.token) !==
      canonicalizeSkywaySnapshot(lease) ||
    lease.authorityCheckpointHash !==
      authorityCheckpoint.authorityCheckpointHash ||
    lease.admissionAckWatermarkHash !==
      admissionAckWatermark.watermarkHash ||
    lease.issuedAtTick !== authorityCheckpoint.tick
  ) {
    throw new RangeError('Skyway reconnect lease head is stale.');
  }

  const previousRevision = window.revision;
  window.revision += 1;
  slot.status = 'consumed';
  slot.consumedAtTick = authorityCheckpoint.tick;
  slot.consumedRevision = window.revision;
  return deepFreeze({
    version: SKYWAY_RECONNECT_LEASE_VERSION,
    kind: 'skyway-reconnect-lease-consume',
    consumed: true,
    ownerId: authenticatedOwnerId,
    roundEpoch: window.roundEpoch,
    tick: authorityCheckpoint.tick,
    leaseHash: lease.leaseHash,
    directiveHash: lease.directiveHash,
    resyncSnapshotHash: lease.resyncSnapshotHash,
    authorityCheckpointHash: lease.authorityCheckpointHash,
    admissionAckWatermarkHash:
      lease.admissionAckWatermarkHash,
    nextClientSequence: lease.nextClientSequence,
    previousRevision,
    revision: window.revision,
  });
}

export function snapshotSkywayReconnectLeaseWindow(window) {
  assertWindow(window);
  return deepFreeze(structuredClone(window));
}

export function restoreSkywayReconnectLeaseWindow(
  window,
  snapshot,
  {
    sessionIncarnation,
    roundEpoch,
    expectedTargetLeaseWindowHash,
  },
) {
  const targetSnapshot = snapshotSkywayReconnectLeaseWindow(window);
  const sourceSnapshot = snapshotSkywayReconnectLeaseWindow(
    structuredClone(snapshot),
  );
  const sessionIncarnationHash = hashSkywaySnapshot(sessionIncarnation);
  if (
    targetSnapshot.sessionIncarnationHash !== sessionIncarnationHash ||
    sourceSnapshot.sessionIncarnationHash !== sessionIncarnationHash ||
    targetSnapshot.roundEpoch !== roundEpoch ||
    sourceSnapshot.roundEpoch !== roundEpoch
  ) {
    throw new RangeError(
      'Skyway reconnect lease restore lifecycle is stale.',
    );
  }
  if (
    targetSnapshot.capacity !== sourceSnapshot.capacity ||
    targetSnapshot.leaseDurationTicks !==
      sourceSnapshot.leaseDurationTicks ||
    targetSnapshot.rosterHash !== sourceSnapshot.rosterHash
  ) {
    throw new TypeError(
      'Skyway reconnect lease restore configuration is incompatible.',
    );
  }
  const targetHash = hashSkywaySnapshot(targetSnapshot);
  if (
    typeof expectedTargetLeaseWindowHash !== 'string' ||
    targetHash !== expectedTargetLeaseWindowHash
  ) {
    throw new RangeError(
      'Skyway reconnect lease restore target revision is stale.',
    );
  }

  const sourceHash = hashSkywaySnapshot(sourceSnapshot);
  const result = deepFreeze({
    version: SKYWAY_RECONNECT_LEASE_VERSION,
    kind: 'skyway-reconnect-lease-window-restore',
    sessionIncarnationHash,
    roundEpoch,
    previousRevision: targetSnapshot.revision,
    revision: sourceSnapshot.revision,
    previousLeaseWindowHash: targetHash,
    leaseWindowHash: sourceHash,
  });
  restoreObjectState(window, sourceSnapshot);
  return result;
}

export function resetSkywayReconnectLeaseWindow(
  window,
  {
    sessionIncarnation,
    roundEpoch,
    baseLeaseWindowSnapshot,
    authorityCheckpoint,
    admissionAckWatermark,
  },
) {
  const abortSnapshot = snapshotSkywayReconnectLeaseWindow(window);
  const suppliedBase = snapshotSkywayReconnectLeaseWindow(
    structuredClone(baseLeaseWindowSnapshot),
  );
  const abortHash = hashSkywaySnapshot(abortSnapshot);
  if (
    canonicalizeSkywaySnapshot(abortSnapshot) !==
      canonicalizeSkywaySnapshot(suppliedBase)
  ) {
    throw new RangeError(
      'Skyway reconnect lease lifecycle revision is stale.',
    );
  }
  const sessionIncarnationHash = hashSkywaySnapshot(sessionIncarnation);
  if (
    abortSnapshot.sessionIncarnationHash !== sessionIncarnationHash ||
    abortSnapshot.roundEpoch !== roundEpoch ||
    authorityCheckpoint?.sessionIncarnation !== sessionIncarnation ||
    authorityCheckpoint?.roundEpoch !== roundEpoch + 1 ||
    authorityCheckpoint?.tick !== 0 ||
    authorityCheckpoint?.rosterHash !== abortSnapshot.rosterHash
  ) {
    throw new RangeError(
      'Skyway reconnect lease lifecycle reset is not aligned.',
    );
  }

  const prepared = createSkywayReconnectLeaseWindow({
    authorityCheckpoint,
    admissionAckWatermark,
    capacity: abortSnapshot.capacity,
    leaseDurationTicks: abortSnapshot.leaseDurationTicks,
  });
  const preparedSnapshot =
    snapshotSkywayReconnectLeaseWindow(prepared);
  if (
    preparedSnapshot.sessionIncarnationHash !== sessionIncarnationHash ||
    preparedSnapshot.roundEpoch !== roundEpoch + 1 ||
    preparedSnapshot.rosterHash !== abortSnapshot.rosterHash ||
    preparedSnapshot.revision !== 0 ||
    preparedSnapshot.slots.some((slot) => slot !== null)
  ) {
    throw new RangeError(
      'Skyway reconnect lease lifecycle reset image is invalid.',
    );
  }

  const clearedActiveLeaseCount = abortSnapshot.slots.filter((slot) => (
    slot?.status === 'active'
  )).length;
  const clearedConsumedLeaseCount = abortSnapshot.slots.filter((slot) => (
    slot?.status === 'consumed'
  )).length;
  const leaseWindowHash = hashSkywaySnapshot(preparedSnapshot);
  const result = deepFreeze({
    version: SKYWAY_RECONNECT_LEASE_VERSION,
    kind: 'skyway-reconnect-lease-window-reset',
    sessionIncarnationHash,
    previousRoundEpoch: roundEpoch,
    roundEpoch: roundEpoch + 1,
    previousRevision: abortSnapshot.revision,
    revision: preparedSnapshot.revision,
    clearedActiveLeaseCount,
    clearedConsumedLeaseCount,
    abortLeaseWindowHash: abortHash,
    leaseWindowHash,
    leaseWindowSnapshot: preparedSnapshot,
  });
  restoreObjectState(window, preparedSnapshot);
  return result;
}
