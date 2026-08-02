import {
  assertSkywayAdmissionAckRestore,
} from './skyway-admission-ack-finality.js';
import {
  restoreSkywayInputAdmissionWindow,
  snapshotSkywayInputAdmissionWindow,
} from './skyway-input-admission.js';
import {
  createSkywayRoundCheckpointBundle,
  restoreSkywayRoundCheckpointBundle,
} from './skyway-round-checkpoint.js';
import {
  canonicalizeSkywaySnapshot,
  hashSkywaySnapshot,
} from './skyway-snapshot-history.js';

export const SKYWAY_AUTHORITY_CHECKPOINT_VERSION = 1;

const CHECKPOINT_KEYS = Object.freeze([
  'admissionSnapshotHash',
  'authorityCheckpointHash',
  'components',
  'kind',
  'participantIds',
  'rosterHash',
  'roundCheckpointHash',
  'roundEpoch',
  'sessionIncarnation',
  'tick',
  'version',
]);
const COMPONENT_KEYS = Object.freeze([
  'admissionSnapshot',
  'roundCheckpointBundle',
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

function sameOrder(first, second) {
  return Array.isArray(first) &&
    Array.isArray(second) &&
    first.length === second.length &&
    first.every((value, index) => value === second[index]);
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

function rosterPayload(participantIds, ownership) {
  return {
    participantIds,
    ownership,
  };
}

function checkpointPayload(checkpoint) {
  return {
    version: checkpoint.version,
    kind: checkpoint.kind,
    sessionIncarnation: checkpoint.sessionIncarnation,
    roundEpoch: checkpoint.roundEpoch,
    tick: checkpoint.tick,
    participantIds: checkpoint.participantIds,
    rosterHash: checkpoint.rosterHash,
    roundCheckpointHash: checkpoint.roundCheckpointHash,
    admissionSnapshotHash: checkpoint.admissionSnapshotHash,
    components: checkpoint.components,
  };
}

function assertAlignedComponents({
  sessionIncarnation,
  roundEpoch,
  roundCheckpointBundle,
  admissionSnapshot,
}) {
  if (
    roundCheckpointBundle?.sessionIncarnation !== sessionIncarnation ||
    admissionSnapshot?.sessionIncarnation !== sessionIncarnation
  ) {
    throw new RangeError(
      'Skyway Authority checkpoint session incarnation is stale.',
    );
  }
  if (
    roundCheckpointBundle?.roundEpoch !== roundEpoch ||
    admissionSnapshot?.roundEpoch !== roundEpoch
  ) {
    throw new RangeError('Skyway Authority checkpoint round epoch is stale.');
  }
  if (
    admissionSnapshot?.currentTick !== roundCheckpointBundle?.tick
  ) {
    throw new RangeError('Skyway Authority checkpoint heads are not aligned.');
  }
  if (!sameOrder(
    roundCheckpointBundle?.participantIds,
    admissionSnapshot?.participantIds,
  )) {
    throw new TypeError(
      'Skyway Authority checkpoint participant order is not aligned.',
    );
  }
}

function assertCheckpointEnvelope(
  checkpoint,
  sessionIncarnation,
  roundEpoch,
) {
  if (
    !exactKeys(checkpoint, CHECKPOINT_KEYS) ||
    checkpoint.version !== SKYWAY_AUTHORITY_CHECKPOINT_VERSION ||
    checkpoint.kind !== 'skyway-authority-checkpoint' ||
    !exactKeys(checkpoint.components, COMPONENT_KEYS) ||
    !Number.isSafeInteger(checkpoint.tick) ||
    checkpoint.tick < 0 ||
    !Array.isArray(checkpoint.participantIds) ||
    typeof checkpoint.rosterHash !== 'string' ||
    typeof checkpoint.roundCheckpointHash !== 'string' ||
    typeof checkpoint.admissionSnapshotHash !== 'string' ||
    typeof checkpoint.authorityCheckpointHash !== 'string'
  ) {
    throw new TypeError('Invalid Skyway Authority checkpoint.');
  }
  if (checkpoint.sessionIncarnation !== sessionIncarnation) {
    throw new RangeError(
      'Skyway Authority checkpoint session incarnation is stale.',
    );
  }
  if (checkpoint.roundEpoch !== roundEpoch) {
    throw new RangeError('Skyway Authority checkpoint round epoch is stale.');
  }

  const { roundCheckpointBundle, admissionSnapshot } = checkpoint.components;
  assertAlignedComponents({
    sessionIncarnation,
    roundEpoch,
    roundCheckpointBundle,
    admissionSnapshot,
  });
  if (
    checkpoint.tick !== roundCheckpointBundle.tick ||
    !sameOrder(checkpoint.participantIds, roundCheckpointBundle.participantIds)
  ) {
    throw new TypeError('Invalid Skyway Authority checkpoint binding.');
  }
  if (
    checkpoint.roundCheckpointHash !== roundCheckpointBundle.bundleHash ||
    checkpoint.admissionSnapshotHash !==
      hashSkywaySnapshot(admissionSnapshot) ||
    checkpoint.rosterHash !== hashSkywaySnapshot(rosterPayload(
      checkpoint.participantIds,
      admissionSnapshot.ownership,
    ))
  ) {
    throw new RangeError(
      'Skyway Authority checkpoint component hash is invalid.',
    );
  }
  if (
    checkpoint.authorityCheckpointHash !==
      hashSkywaySnapshot(checkpointPayload(checkpoint))
  ) {
    throw new RangeError('Skyway Authority checkpoint hash is invalid.');
  }
}

export function assertSkywayAuthorityCheckpoint(checkpoint) {
  assertCheckpointEnvelope(
    checkpoint,
    checkpoint?.sessionIncarnation,
    checkpoint?.roundEpoch,
  );
  return checkpoint;
}

export function createSkywayAuthorityCheckpoint({
  sessionIncarnation,
  roundEpoch,
  admissionWindow,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  const roundCheckpointBundle = createSkywayRoundCheckpointBundle({
    sessionIncarnation,
    roundEpoch,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  });
  const admissionSnapshot =
    snapshotSkywayInputAdmissionWindow(admissionWindow);
  assertAlignedComponents({
    sessionIncarnation,
    roundEpoch,
    roundCheckpointBundle,
    admissionSnapshot,
  });

  const participantIds = [...roundCheckpointBundle.participantIds];
  const payload = {
    version: SKYWAY_AUTHORITY_CHECKPOINT_VERSION,
    kind: 'skyway-authority-checkpoint',
    sessionIncarnation,
    roundEpoch,
    tick: roundCheckpointBundle.tick,
    participantIds,
    rosterHash: hashSkywaySnapshot(rosterPayload(
      participantIds,
      admissionSnapshot.ownership,
    )),
    roundCheckpointHash: roundCheckpointBundle.bundleHash,
    admissionSnapshotHash: hashSkywaySnapshot(admissionSnapshot),
    components: {
      roundCheckpointBundle,
      admissionSnapshot,
    },
  };
  return deepFreeze({
    ...payload,
    authorityCheckpointHash: hashSkywaySnapshot(payload),
  });
}

export function restoreSkywayAuthorityCheckpoint({
  sessionIncarnation,
  roundEpoch,
  checkpoint,
  expectedTargetAuthorityHash,
  admissionAckWatermark = null,
  admissionWindow,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  assertCheckpointEnvelope(checkpoint, sessionIncarnation, roundEpoch);

  const liveArguments = {
    sessionIncarnation,
    roundEpoch,
    admissionWindow,
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
  };
  const abortCheckpoint = createSkywayAuthorityCheckpoint(liveArguments);
  if (
    typeof expectedTargetAuthorityHash !== 'string' ||
    abortCheckpoint.authorityCheckpointHash !== expectedTargetAuthorityHash
  ) {
    throw new RangeError(
      'Skyway Authority checkpoint target revision is stale.',
    );
  }
  if (!sameOrder(
    abortCheckpoint.participantIds,
    checkpoint.participantIds,
  )) {
    throw new TypeError(
      'Skyway Authority checkpoint target participants are not aligned.',
    );
  }
  if (admissionAckWatermark !== null) {
    assertSkywayAdmissionAckRestore(admissionAckWatermark, {
      authorityCheckpoint: abortCheckpoint,
    });
    assertSkywayAdmissionAckRestore(admissionAckWatermark, {
      authorityCheckpoint: checkpoint,
    });
  }

  const scratchStack = cloneRoundStack(liveArguments);
  const scratchAdmission = structuredClone(admissionWindow);
  const roundRestore = restoreSkywayRoundCheckpointBundle({
    ...scratchStack,
    sessionIncarnation,
    roundEpoch,
    bundle: checkpoint.components.roundCheckpointBundle,
  });
  restoreSkywayInputAdmissionWindow(
    scratchAdmission,
    checkpoint.components.admissionSnapshot,
    { sessionIncarnation, roundEpoch },
  );
  const prepared = createSkywayAuthorityCheckpoint({
    ...scratchStack,
    admissionWindow: scratchAdmission,
    sessionIncarnation,
    roundEpoch,
  });
  if (
    prepared.authorityCheckpointHash !== checkpoint.authorityCheckpointHash ||
    canonicalizeSkywaySnapshot(prepared) !==
      canonicalizeSkywaySnapshot(checkpoint)
  ) {
    throw new RangeError(
      'Skyway Authority checkpoint prepared image is not canonical.',
    );
  }

  const commitTarget = createSkywayAuthorityCheckpoint(liveArguments);
  if (
    commitTarget.authorityCheckpointHash !==
      abortCheckpoint.authorityCheckpointHash
  ) {
    throw new RangeError(
      'Skyway Authority checkpoint target changed during preparation.',
    );
  }

  const result = deepFreeze({
    version: SKYWAY_AUTHORITY_CHECKPOINT_VERSION,
    kind: 'skyway-authority-checkpoint-restore',
    sessionIncarnation,
    roundEpoch,
    tick: checkpoint.tick,
    participantIds: [...checkpoint.participantIds],
    rosterHash: checkpoint.rosterHash,
    previousTick: abortCheckpoint.tick,
    previousAuthorityCheckpointHash:
      abortCheckpoint.authorityCheckpointHash,
    authorityCheckpointHash: checkpoint.authorityCheckpointHash,
    roundCheckpointHash: checkpoint.roundCheckpointHash,
    admissionSnapshotHash: checkpoint.admissionSnapshotHash,
    previousAdmissionRevision:
      abortCheckpoint.components.admissionSnapshot.revision,
    admissionRevision: checkpoint.components.admissionSnapshot.revision,
    roundRestore,
  });

  const admissionBackup =
    snapshotSkywayInputAdmissionWindow(admissionWindow);
  try {
    restoreSkywayInputAdmissionWindow(
      admissionWindow,
      checkpoint.components.admissionSnapshot,
      { sessionIncarnation, roundEpoch },
    );
    restoreSkywayRoundCheckpointBundle({
      sessionIncarnation,
      roundEpoch,
      bundle: checkpoint.components.roundCheckpointBundle,
      round,
      snapshotHistory,
      commandJournal,
      replayEventLedger,
    });
  } catch (error) {
    restoreSkywayInputAdmissionWindow(
      admissionWindow,
      admissionBackup,
      { sessionIncarnation, roundEpoch },
    );
    throw error;
  }

  return result;
}
