import {
  assertSkywayAdmissionAckRestore,
} from './skyway-admission-ack-finality.js';
import {
  assertSkywayAuthorityCheckpoint,
  createSkywayAuthorityCheckpoint,
  restoreSkywayAuthorityCheckpoint,
} from './skyway-authority-checkpoint.js';
import {
  applySkywayAuthoritativeIntake,
} from './skyway-authoritative-intake.js';
import {
  applySkywayAuthoritativeReconnectIntake,
} from './skyway-authoritative-reconnect-intake.js';
import {
  createSkywayInputAdmissionBatch,
} from './skyway-input-admission.js';
import {
  consumeSkywayReconnectLease,
  snapshotSkywayReconnectLeaseWindow,
} from './skyway-reconnect-lease.js';
import {
  canonicalizeSkywaySnapshot,
  hashSkywaySnapshot,
} from './skyway-snapshot-history.js';

export const SKYWAY_AUTHORITATIVE_RECONNECT_CORRECTION_VERSION = 1;

const RESULT_KEYS = Object.freeze([
  'ackWatermarkAdvanced',
  'admissionAckWatermarkHash',
  'admissionBatch',
  'admissionBatchHash',
  'admissionSnapshotHash',
  'authoritativeIntake',
  'authorityCheckpoint',
  'authorityCheckpointHash',
  'directiveHash',
  'kind',
  'leaseHash',
  'leaseWindowHash',
  'ownerId',
  'previousAdmissionSnapshotHash',
  'previousAuthorityCheckpointHash',
  'previousLeaseWindowHash',
  'reconnectIntake',
  'requiresAckWatermarkAdvance',
  'resyncSnapshotHash',
  'roundEpoch',
  'sessionIncarnationHash',
  'suppressPresentation',
  'tick',
  'transactionHash',
  'version',
]);

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

function canonicalEqual(first, second) {
  return canonicalizeSkywaySnapshot(first) ===
    canonicalizeSkywaySnapshot(second);
}

export function assertSkywayAuthoritativeReconnectCorrectionResult(
  result,
) {
  if (
    !exactKeys(result, RESULT_KEYS) ||
    result.version !==
      SKYWAY_AUTHORITATIVE_RECONNECT_CORRECTION_VERSION ||
    result.kind !== 'skyway-authoritative-reconnect-correction' ||
    typeof result.ownerId !== 'string' ||
    typeof result.sessionIncarnationHash !== 'string' ||
    !Number.isSafeInteger(result.roundEpoch) ||
    result.roundEpoch < 1 ||
    !Number.isSafeInteger(result.tick) ||
    result.tick < 0 ||
    typeof result.leaseHash !== 'string' ||
    typeof result.directiveHash !== 'string' ||
    typeof result.resyncSnapshotHash !== 'string' ||
    typeof result.admissionBatchHash !== 'string' ||
    typeof result.previousAuthorityCheckpointHash !== 'string' ||
    typeof result.authorityCheckpointHash !== 'string' ||
    typeof result.previousLeaseWindowHash !== 'string' ||
    typeof result.leaseWindowHash !== 'string' ||
    typeof result.previousAdmissionSnapshotHash !== 'string' ||
    typeof result.admissionSnapshotHash !== 'string' ||
    typeof result.admissionAckWatermarkHash !== 'string' ||
    result.ackWatermarkAdvanced !== false ||
    result.requiresAckWatermarkAdvance !== true ||
    result.suppressPresentation !== true ||
    typeof result.transactionHash !== 'string'
  ) {
    throw new TypeError(
      'Invalid Skyway authoritative reconnect correction result.',
    );
  }
  assertSkywayAuthorityCheckpoint(result.authorityCheckpoint);
  const decision = result.admissionBatch?.decisions?.[0];
  if (
    result.authorityCheckpointHash !==
      result.authorityCheckpoint.authorityCheckpointHash ||
    result.authorityCheckpoint.roundEpoch !== result.roundEpoch ||
    result.authorityCheckpoint.tick !== result.tick ||
    result.authorityCheckpoint.admissionSnapshotHash !==
      result.admissionSnapshotHash ||
    result.admissionBatch?.batchHash !== result.admissionBatchHash ||
    result.admissionBatch?.decisions?.length !== 1 ||
    result.admissionBatch?.corrections?.length !== 1 ||
    decision?.ownerId !== result.ownerId ||
    result.reconnectIntake?.ownerId !== result.ownerId ||
    result.reconnectIntake?.leaseHash !== result.leaseHash ||
    result.reconnectIntake?.directiveHash !== result.directiveHash ||
    result.reconnectIntake?.resyncSnapshotHash !==
      result.resyncSnapshotHash ||
    result.authoritativeIntake?.admissionBatchHash !==
      result.admissionBatchHash ||
    result.authoritativeIntake?.checkpointHash !==
      result.authorityCheckpoint.roundCheckpointHash ||
    result.authoritativeIntake?.admissionSnapshotHash !==
      result.admissionSnapshotHash
  ) {
    throw new RangeError(
      'Skyway authoritative reconnect correction result binding is invalid.',
    );
  }
  const {
    transactionHash: ignoredTransactionHash,
    ...payload
  } = result;
  if (hashSkywaySnapshot(payload) !== result.transactionHash) {
    throw new RangeError(
      'Skyway authoritative reconnect correction result hash is invalid.',
    );
  }
  return result;
}

function cloneRoundStack({
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  return {
    round: structuredClone(round),
    snapshotHistory: structuredClone(snapshotHistory),
    commandJournal: structuredClone(commandJournal),
    replayEventLedger: structuredClone(replayEventLedger),
  };
}

function authorityArguments({
  sessionIncarnation,
  roundEpoch,
  admissionWindow,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  return {
    sessionIncarnation,
    roundEpoch,
    admissionWindow,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  };
}

function currentAuthority(arguments_) {
  return createSkywayAuthorityCheckpoint(
    authorityArguments(arguments_),
  );
}

function assertAuthorityBase(current, expected, label = 'base') {
  if (
    current.authorityCheckpointHash !==
      expected?.authorityCheckpointHash ||
    !canonicalEqual(current, expected)
  ) {
    throw new RangeError(
      `Skyway authoritative reconnect correction ${label} Authority CAS is stale.`,
    );
  }
}

function assertCanonicalReconnectBatch(batch, command) {
  const decision = batch?.decisions?.[0];
  const correction = batch?.corrections?.[0];
  if (
    batch?.correctionCount !== 1 ||
    batch.decisions.length !== 1 ||
    batch.corrections.length !== 1 ||
    decision.ownerId !== command.ownerId ||
    decision.participantId !== command.participantId ||
    decision.clientSequence !== command.clientSequence ||
    decision.tick !== command.tick ||
    correction.participantId !== command.participantId ||
    correction.tick !== command.tick
  ) {
    throw new RangeError(
      'Skyway authoritative reconnect correction requires one canonical resumed-command batch.',
    );
  }
}

function restoreAuthority({
  checkpoint,
  expectedTargetAuthorityHash,
  admissionAckWatermark,
  sessionIncarnation,
  roundEpoch,
  admissionWindow,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  return restoreSkywayAuthorityCheckpoint({
    checkpoint,
    expectedTargetAuthorityHash,
    admissionAckWatermark,
    sessionIncarnation,
    roundEpoch,
    admissionWindow,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
}

export function applySkywayAuthoritativeReconnectCorrection({
  authenticatedOwnerId,
  lease,
  command,
  authorityCheckpoint,
  admissionAckWatermark,
  baseLeaseWindowSnapshot,
  baseAdmissionSnapshot,
  environmentForRound,
  leaseWindow,
  admissionWindow,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  const sessionIncarnation = authorityCheckpoint?.sessionIncarnation;
  const roundEpoch = authorityCheckpoint?.roundEpoch;
  const liveArguments = {
    sessionIncarnation,
    roundEpoch,
    admissionWindow,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  };
  const abortAuthority = currentAuthority(liveArguments);
  assertAuthorityBase(abortAuthority, authorityCheckpoint);
  assertSkywayAdmissionAckRestore(admissionAckWatermark, {
    authorityCheckpoint: abortAuthority,
  });
  const abortLeaseSnapshot =
    snapshotSkywayReconnectLeaseWindow(leaseWindow);
  if (!canonicalEqual(
    abortLeaseSnapshot,
    baseLeaseWindowSnapshot,
  )) {
    throw new RangeError(
      'Skyway authoritative reconnect correction lease-window CAS is stale.',
    );
  }

  const scratchStack = cloneRoundStack(liveArguments);
  const scratchAdmission = structuredClone(admissionWindow);
  const scratchLease = structuredClone(leaseWindow);
  const reconnectIntake =
    applySkywayAuthoritativeReconnectIntake({
      authenticatedOwnerId,
      lease,
      command,
      authorityCheckpoint: abortAuthority,
      admissionAckWatermark,
      baseLeaseWindowSnapshot,
      baseAdmissionSnapshot,
      leaseWindow: scratchLease,
      admissionWindow: scratchAdmission,
    });
  const admissionBatch = createSkywayInputAdmissionBatch(
    scratchAdmission,
    {
      sessionIncarnation,
      roundEpoch,
      throughTick: abortAuthority.tick,
    },
  );
  assertCanonicalReconnectBatch(admissionBatch, command);

  const authoritativeIntake = applySkywayAuthoritativeIntake({
    sessionIncarnation,
    roundEpoch,
    baseCheckpointBundle:
      abortAuthority.components.roundCheckpointBundle,
    admissionBatch,
    environmentForRound,
    admissionWindow: scratchAdmission,
    ...scratchStack,
  });
  const correctedAuthority = currentAuthority({
    sessionIncarnation,
    roundEpoch,
    admissionWindow: scratchAdmission,
    ...scratchStack,
  });
  assertSkywayAdmissionAckRestore(admissionAckWatermark, {
    authorityCheckpoint: correctedAuthority,
  });
  if (
    correctedAuthority.authorityCheckpointHash ===
      abortAuthority.authorityCheckpointHash ||
    correctedAuthority.components.admissionSnapshot.revision !==
      baseAdmissionSnapshot.revision + 2 ||
    authoritativeIntake.admissionBatchHash !== admissionBatch.batchHash ||
    authoritativeIntake.checkpointHash !==
      correctedAuthority.roundCheckpointHash ||
    authoritativeIntake.admissionSnapshotHash !==
      correctedAuthority.admissionSnapshotHash
  ) {
    throw new RangeError(
      'Skyway authoritative reconnect correction prepared Authority is not aligned.',
    );
  }

  // Prove the complete corrected Authority image can restore through the
  // existing five-target Authority Seam before any live target changes.
  const proofStack = cloneRoundStack(liveArguments);
  const proofAdmission = structuredClone(admissionWindow);
  restoreAuthority({
    checkpoint: correctedAuthority,
    expectedTargetAuthorityHash:
      abortAuthority.authorityCheckpointHash,
    admissionAckWatermark,
    sessionIncarnation,
    roundEpoch,
    admissionWindow: proofAdmission,
    ...proofStack,
  });
  const provenAuthority = currentAuthority({
    sessionIncarnation,
    roundEpoch,
    admissionWindow: proofAdmission,
    ...proofStack,
  });
  assertAuthorityBase(
    provenAuthority,
    correctedAuthority,
    'prepared',
  );

  const commitAuthorityTarget = currentAuthority(liveArguments);
  const commitLeaseTarget =
    snapshotSkywayReconnectLeaseWindow(leaseWindow);
  assertAuthorityBase(
    commitAuthorityTarget,
    abortAuthority,
    'target',
  );
  if (!canonicalEqual(commitLeaseTarget, abortLeaseSnapshot)) {
    throw new RangeError(
      'Skyway authoritative reconnect correction lease target changed during preparation.',
    );
  }

  const committedLeaseSnapshot =
    snapshotSkywayReconnectLeaseWindow(scratchLease);
  const payload = {
    version: SKYWAY_AUTHORITATIVE_RECONNECT_CORRECTION_VERSION,
    kind: 'skyway-authoritative-reconnect-correction',
    ownerId: authenticatedOwnerId,
    sessionIncarnationHash: lease.sessionIncarnationHash,
    roundEpoch,
    tick: correctedAuthority.tick,
    leaseHash: lease.leaseHash,
    directiveHash: lease.directiveHash,
    resyncSnapshotHash: lease.resyncSnapshotHash,
    admissionBatchHash: admissionBatch.batchHash,
    previousAuthorityCheckpointHash:
      abortAuthority.authorityCheckpointHash,
    authorityCheckpointHash:
      correctedAuthority.authorityCheckpointHash,
    previousLeaseWindowHash:
      hashSkywaySnapshot(abortLeaseSnapshot),
    leaseWindowHash:
      hashSkywaySnapshot(committedLeaseSnapshot),
    previousAdmissionSnapshotHash:
      abortAuthority.admissionSnapshotHash,
    admissionSnapshotHash:
      correctedAuthority.admissionSnapshotHash,
    admissionAckWatermarkHash:
      admissionAckWatermark.watermarkHash,
    ackWatermarkAdvanced: false,
    requiresAckWatermarkAdvance: true,
    suppressPresentation:
      authoritativeIntake.suppressPresentation,
    reconnectIntake,
    admissionBatch,
    authoritativeIntake,
    authorityCheckpoint: correctedAuthority,
  };
  const result = deepFreeze({
    ...payload,
    transactionHash: hashSkywaySnapshot(payload),
  });

  restoreAuthority({
    checkpoint: correctedAuthority,
    expectedTargetAuthorityHash:
      abortAuthority.authorityCheckpointHash,
    admissionAckWatermark,
    ...liveArguments,
  });
  try {
    consumeSkywayReconnectLease(leaseWindow, {
      authenticatedOwnerId,
      lease,
      authorityCheckpoint: abortAuthority,
      admissionAckWatermark,
      expectedRevision: abortLeaseSnapshot.revision,
    });
  } catch (error) {
    restoreAuthority({
      checkpoint: abortAuthority,
      expectedTargetAuthorityHash:
        correctedAuthority.authorityCheckpointHash,
      admissionAckWatermark,
      ...liveArguments,
    });
    throw error;
  }

  return result;
}
