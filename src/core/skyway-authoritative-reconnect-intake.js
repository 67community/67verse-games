import {
  admitSkywayParticipantInput,
  restoreSkywayInputAdmissionWindow,
  snapshotSkywayInputAdmissionWindow,
} from './skyway-input-admission.js';
import {
  consumeSkywayReconnectLease,
  snapshotSkywayReconnectLeaseWindow,
  validateSkywayReconnectLease,
} from './skyway-reconnect-lease.js';
import {
  canonicalizeSkywaySnapshot,
  hashSkywaySnapshot,
} from './skyway-snapshot-history.js';

export const SKYWAY_AUTHORITATIVE_RECONNECT_INTAKE_VERSION = 1;

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

function canonicalEqual(first, second) {
  return canonicalizeSkywaySnapshot(first) ===
    canonicalizeSkywaySnapshot(second);
}

function assertBaseImage(current, expected, label) {
  if (!canonicalEqual(current, expected)) {
    throw new RangeError(
      `Skyway authoritative reconnect ${label} CAS is stale.`,
    );
  }
}

function assertCommandBinding({
  authenticatedOwnerId,
  lease,
  command,
  authorityCheckpoint,
  admissionSnapshot,
}) {
  if (
    !boundedId(authenticatedOwnerId) ||
    lease.ownerId !== authenticatedOwnerId ||
    command?.ownerId !== authenticatedOwnerId
  ) {
    throw new RangeError(
      'Skyway authoritative reconnect owner is not authorized.',
    );
  }
  if (command?.clientSequence !== lease.nextClientSequence) {
    throw new RangeError(
      'Skyway authoritative reconnect command sequence does not match the lease.',
    );
  }
  if (
    command?.sessionIncarnation !==
      authorityCheckpoint.sessionIncarnation ||
    command?.roundEpoch !== authorityCheckpoint.roundEpoch ||
    admissionSnapshot.sessionIncarnation !==
      authorityCheckpoint.sessionIncarnation ||
    admissionSnapshot.roundEpoch !==
      authorityCheckpoint.roundEpoch
  ) {
    throw new RangeError(
      'Skyway authoritative reconnect lifecycle is stale.',
    );
  }
  if (
    admissionSnapshot.currentTick !== authorityCheckpoint.tick ||
    lease.issuedAtTick !== authorityCheckpoint.tick
  ) {
    throw new RangeError(
      'Skyway authoritative reconnect head is stale.',
    );
  }
}

function consumeArguments({
  authenticatedOwnerId,
  lease,
  authorityCheckpoint,
  admissionAckWatermark,
  expectedRevision,
}) {
  return {
    authenticatedOwnerId,
    lease,
    authorityCheckpoint,
    admissionAckWatermark,
    expectedRevision,
  };
}

export function applySkywayAuthoritativeReconnectIntake({
  authenticatedOwnerId,
  lease,
  command,
  authorityCheckpoint,
  admissionAckWatermark,
  baseLeaseWindowSnapshot,
  baseAdmissionSnapshot,
  leaseWindow,
  admissionWindow,
}) {
  validateSkywayReconnectLease(lease);
  const abortLeaseSnapshot =
    snapshotSkywayReconnectLeaseWindow(leaseWindow);
  const abortAdmissionSnapshot =
    snapshotSkywayInputAdmissionWindow(admissionWindow);
  assertBaseImage(
    abortLeaseSnapshot,
    baseLeaseWindowSnapshot,
    'lease-window',
  );
  assertBaseImage(
    abortAdmissionSnapshot,
    baseAdmissionSnapshot,
    'Admission snapshot',
  );
  assertCommandBinding({
    authenticatedOwnerId,
    lease,
    command,
    authorityCheckpoint,
    admissionSnapshot: abortAdmissionSnapshot,
  });

  const scratchLeaseWindow = structuredClone(leaseWindow);
  const scratchAdmissionWindow = structuredClone(admissionWindow);
  const leaseConsume = consumeSkywayReconnectLease(
    scratchLeaseWindow,
    consumeArguments({
      authenticatedOwnerId,
      lease,
      authorityCheckpoint,
      admissionAckWatermark,
      expectedRevision: abortLeaseSnapshot.revision,
    }),
  );
  const admission = admitSkywayParticipantInput(
    scratchAdmissionWindow,
    command,
  );
  if (!admission.accepted) {
    throw new RangeError(
      `Skyway authoritative reconnect Admission rejected the command: ${admission.reason}.`,
    );
  }
  if (
    admission.ownerId !== authenticatedOwnerId ||
    admission.clientSequence !== lease.nextClientSequence ||
    admission.ackSequence !== lease.nextClientSequence
  ) {
    throw new RangeError(
      'Skyway authoritative reconnect Admission result is not lease-aligned.',
    );
  }

  const committedLeaseSnapshot =
    snapshotSkywayReconnectLeaseWindow(scratchLeaseWindow);
  const committedAdmissionSnapshot =
    snapshotSkywayInputAdmissionWindow(scratchAdmissionWindow);

  // Prove the prepared Admission image restores through its public Seam before
  // either live Module changes.
  const restoreProofAdmission = structuredClone(admissionWindow);
  restoreSkywayInputAdmissionWindow(
    restoreProofAdmission,
    committedAdmissionSnapshot,
    {
      sessionIncarnation: authorityCheckpoint.sessionIncarnation,
      roundEpoch: authorityCheckpoint.roundEpoch,
    },
  );
  if (!canonicalEqual(
    restoreProofAdmission,
    committedAdmissionSnapshot,
  )) {
    throw new RangeError(
      'Skyway authoritative reconnect Admission restore proof failed.',
    );
  }

  const commitLeaseTarget =
    snapshotSkywayReconnectLeaseWindow(leaseWindow);
  const commitAdmissionTarget =
    snapshotSkywayInputAdmissionWindow(admissionWindow);
  assertBaseImage(
    commitLeaseTarget,
    abortLeaseSnapshot,
    'lease-window target',
  );
  assertBaseImage(
    commitAdmissionTarget,
    abortAdmissionSnapshot,
    'Admission target',
  );

  const payload = {
    version: SKYWAY_AUTHORITATIVE_RECONNECT_INTAKE_VERSION,
    kind: 'skyway-authoritative-reconnect-intake',
    ownerId: authenticatedOwnerId,
    sessionIncarnationHash: lease.sessionIncarnationHash,
    roundEpoch: lease.roundEpoch,
    tick: authorityCheckpoint.tick,
    leaseHash: lease.leaseHash,
    directiveHash: lease.directiveHash,
    resyncSnapshotHash: lease.resyncSnapshotHash,
    authorityCheckpointHash: lease.authorityCheckpointHash,
    admissionAckWatermarkHash:
      lease.admissionAckWatermarkHash,
    nextClientSequence: lease.nextClientSequence,
    participantId: admission.participantId,
    commandTick: admission.tick,
    previousLeaseRevision: abortLeaseSnapshot.revision,
    leaseRevision: committedLeaseSnapshot.revision,
    previousAdmissionRevision: abortAdmissionSnapshot.revision,
    admissionRevision: committedAdmissionSnapshot.revision,
    previousLeaseWindowHash:
      hashSkywaySnapshot(abortLeaseSnapshot),
    leaseWindowHash: hashSkywaySnapshot(committedLeaseSnapshot),
    previousAdmissionSnapshotHash:
      hashSkywaySnapshot(abortAdmissionSnapshot),
    admissionSnapshotHash:
      hashSkywaySnapshot(committedAdmissionSnapshot),
    leaseConsume,
    admission,
  };
  const result = deepFreeze({
    ...payload,
    transactionHash: hashSkywaySnapshot(payload),
  });

  try {
    restoreSkywayInputAdmissionWindow(
      admissionWindow,
      committedAdmissionSnapshot,
      {
        sessionIncarnation: authorityCheckpoint.sessionIncarnation,
        roundEpoch: authorityCheckpoint.roundEpoch,
      },
    );
    consumeSkywayReconnectLease(
      leaseWindow,
      consumeArguments({
        authenticatedOwnerId,
        lease,
        authorityCheckpoint,
        admissionAckWatermark,
        expectedRevision: abortLeaseSnapshot.revision,
      }),
    );
  } catch (error) {
    restoreSkywayInputAdmissionWindow(
      admissionWindow,
      abortAdmissionSnapshot,
      {
        sessionIncarnation: authorityCheckpoint.sessionIncarnation,
        roundEpoch: authorityCheckpoint.roundEpoch,
      },
    );
    throw error;
  }

  return result;
}
