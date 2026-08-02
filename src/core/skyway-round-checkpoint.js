import {
  appendSkywayCommandTick,
  createSkywayCommandJournal,
  lookupSkywayCommandTick,
} from './skyway-command-journal.js';
import {
  appendSkywayReplayEventFrame,
  createSkywayReplayEventLedger,
  lookupSkywayReplayEventFrame,
} from './skyway-replay-event-ledger.js';
import {
  restoreSkywayRound,
  snapshotSkywayRound,
} from './skyway-round.js';
import {
  canonicalizeSkywaySnapshot,
  createSkywaySnapshotHistory,
  hashSkywaySnapshot,
  lookupSkywaySnapshot,
  recordSkywaySnapshot,
} from './skyway-snapshot-history.js';

export const SKYWAY_ROUND_CHECKPOINT_VERSION = 1;

const BUNDLE_KEYS = Object.freeze([
  'bundleHash',
  'components',
  'kind',
  'participantIds',
  'roundEpoch',
  'roundSnapshotHash',
  'sessionIncarnation',
  'tick',
  'version',
]);
const COMPONENT_KEYS = Object.freeze([
  'commandJournal',
  'replayEventLedger',
  'roundSnapshot',
  'snapshotHistory',
]);

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function validSessionIncarnation(value) {
  return typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 128 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}

function assertIncarnation(sessionIncarnation, roundEpoch) {
  if (
    !validSessionIncarnation(sessionIncarnation) ||
    !Number.isSafeInteger(roundEpoch) ||
    roundEpoch < 1
  ) {
    throw new TypeError(
      'Skyway checkpoint requires a bounded session incarnation and positive round epoch.',
    );
  }
}

function sameParticipantOrder(first, second) {
  return Array.isArray(first) &&
    Array.isArray(second) &&
    first.length === second.length &&
    first.every((id, index) => id === second[index]);
}

function restoreObjectState(target, backup) {
  for (const key of Object.keys(target)) {
    if (!Object.hasOwn(backup, key)) delete target[key];
  }
  Object.assign(target, structuredClone(backup));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function canonicalEqual(first, second) {
  return canonicalizeSkywaySnapshot(first) === canonicalizeSkywaySnapshot(second);
}

function validateSnapshotHistory(source, roundEpoch) {
  const history = structuredClone(source);
  lookupSkywaySnapshot(
    history,
    history.latestTick ?? 0,
    { roundEpoch },
  );
  const rebuilt = createSkywaySnapshotHistory({
    capacityTicks: history.capacityTicks,
    roundEpoch,
  });
  if (history.oldestTick !== null) {
    for (let tick = history.oldestTick; tick <= history.latestTick; tick++) {
      const retained = lookupSkywaySnapshot(history, tick, { roundEpoch });
      if (!retained || retained.tick !== tick || retained.roundEpoch !== roundEpoch) {
        throw new RangeError('Skyway checkpoint snapshot coverage is incomplete.');
      }
      const recorded = recordSkywaySnapshot(
        rebuilt,
        retained.snapshot,
        { roundEpoch },
      );
      if (recorded.hash !== retained.hash) {
        throw new RangeError('Skyway checkpoint snapshot hash is invalid.');
      }
    }
  }
  if (!canonicalEqual(history, rebuilt)) {
    throw new TypeError('Skyway checkpoint snapshot history is not canonical.');
  }
  return history;
}

function validateCommandJournal(source, roundEpoch) {
  const journal = structuredClone(source);
  lookupSkywayCommandTick(
    journal,
    journal.latestTick ?? 1,
    { roundEpoch },
  );
  const rebuilt = createSkywayCommandJournal({
    participantIds: journal.participantIds,
    capacityTicks: journal.capacityTicks,
    roundEpoch,
  });
  if (journal.oldestTick !== null) {
    for (let tick = journal.oldestTick; tick <= journal.latestTick; tick++) {
      const retained = lookupSkywayCommandTick(journal, tick, { roundEpoch });
      if (!retained || retained.tick !== tick || retained.roundEpoch !== roundEpoch) {
        throw new RangeError('Skyway checkpoint command coverage is incomplete.');
      }
      appendSkywayCommandTick(rebuilt, {
        roundEpoch,
        tick,
        commands: retained.commands,
      });
    }
  }
  if (!canonicalEqual(journal, rebuilt)) {
    throw new TypeError('Skyway checkpoint command journal is not canonical.');
  }
  return journal;
}

function validateReplayEventLedger(source, roundEpoch) {
  const ledger = structuredClone(source);
  lookupSkywayReplayEventFrame(ledger, ledger.latestTick ?? ledger.nextTick);
  if (ledger.roundEpoch !== roundEpoch) {
    throw new RangeError('Skyway checkpoint event epoch is not aligned.');
  }
  const rebuilt = createSkywayReplayEventLedger({
    participantIds: ledger.participantIds,
    capacityTicks: ledger.capacityTicks,
    nextTick: ledger.oldestTick ?? ledger.nextTick,
    roundEpoch,
  });
  if (ledger.oldestTick !== null) {
    for (let tick = ledger.oldestTick; tick <= ledger.latestTick; tick++) {
      const retained = lookupSkywayReplayEventFrame(ledger, tick);
      if (!retained || retained.tick !== tick) {
        throw new RangeError('Skyway checkpoint event coverage is incomplete.');
      }
      appendSkywayReplayEventFrame(rebuilt, retained);
    }
  }
  if (!canonicalEqual(ledger.slots, rebuilt.slots)) {
    throw new TypeError('Skyway checkpoint event ledger is not canonical.');
  }
  return ledger;
}

function prepareAlignedStack({
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
  roundEpoch,
}) {
  const roundSnapshot = snapshotSkywayRound(round);
  const scratchRound = structuredClone(round);
  restoreSkywayRound(scratchRound, roundSnapshot);
  const participantIds = roundSnapshot.participants.map(({ id }) => id);
  const history = validateSnapshotHistory(snapshotHistory, roundEpoch);
  const journal = validateCommandJournal(commandJournal, roundEpoch);
  const ledger = validateReplayEventLedger(replayEventLedger, roundEpoch);
  const tick = roundSnapshot.tick;
  const sidecarHead = tick === 0 ? null : tick;

  if (
    roundSnapshot.inputTimeline?.nextTick !== tick + 1 ||
    (
      tick === 0
        ? ![null, 0].includes(history.latestTick)
        : history.latestTick !== tick
    ) ||
    journal.latestTick !== sidecarHead ||
    ledger.latestTick !== sidecarHead ||
    ledger.nextTick !== tick + 1
  ) {
    throw new RangeError('Skyway checkpoint heads are not aligned.');
  }
  if (
    history.roundEpoch !== roundEpoch ||
    journal.roundEpoch !== roundEpoch ||
    ledger.roundEpoch !== roundEpoch
  ) {
    throw new RangeError('Skyway checkpoint epochs are not aligned.');
  }
  if (
    !sameParticipantOrder(
      participantIds,
      roundSnapshot.inputTimeline?.participantIds,
    ) ||
    !sameParticipantOrder(participantIds, journal.participantIds) ||
    !sameParticipantOrder(participantIds, ledger.participantIds)
  ) {
    throw new TypeError('Skyway checkpoint participant order is not aligned.');
  }
  if (
    history.capacityTicks < journal.capacityTicks + 1 ||
    roundSnapshot.inputTimeline.capacityTicks < journal.capacityTicks ||
    ledger.capacityTicks < journal.capacityTicks
  ) {
    throw new RangeError('Skyway checkpoint capacities are not aligned.');
  }
  if (history.latestTick !== null) {
    const head = lookupSkywaySnapshot(history, tick, { roundEpoch });
    if (!head || head.hash !== hashSkywaySnapshot(roundSnapshot)) {
      throw new RangeError('Skyway checkpoint Round snapshot head is not aligned.');
    }
  }

  return {
    tick,
    participantIds,
    roundSnapshot,
    snapshotHistory: history,
    commandJournal: journal,
    replayEventLedger: ledger,
  };
}

function payloadFromBundle(bundle) {
  return {
    version: bundle.version,
    kind: bundle.kind,
    sessionIncarnation: bundle.sessionIncarnation,
    roundEpoch: bundle.roundEpoch,
    tick: bundle.tick,
    participantIds: bundle.participantIds,
    roundSnapshotHash: bundle.roundSnapshotHash,
    components: bundle.components,
  };
}

function assertBundleEnvelope(bundle, sessionIncarnation, roundEpoch) {
  if (
    !exactKeys(bundle, BUNDLE_KEYS) ||
    bundle.version !== SKYWAY_ROUND_CHECKPOINT_VERSION ||
    bundle.kind !== 'skyway-round-checkpoint-bundle' ||
    !exactKeys(bundle.components, COMPONENT_KEYS)
  ) {
    throw new TypeError('Invalid Skyway Round checkpoint bundle.');
  }
  assertIncarnation(sessionIncarnation, roundEpoch);
  if (bundle.sessionIncarnation !== sessionIncarnation) {
    throw new RangeError('Skyway checkpoint session incarnation is stale.');
  }
  if (bundle.roundEpoch !== roundEpoch) {
    throw new RangeError('Skyway checkpoint round epoch is stale.');
  }
  const savedParticipants = bundle.components.roundSnapshot?.participants;
  const savedParticipantIds = Array.isArray(savedParticipants)
    ? savedParticipants.map((participant) => participant?.id)
    : null;
  if (
    !Number.isInteger(bundle.tick) ||
    bundle.tick < 0 ||
    !sameParticipantOrder(
      bundle.participantIds,
      savedParticipantIds,
    ) ||
    bundle.components.roundSnapshot?.tick !== bundle.tick ||
    typeof bundle.roundSnapshotHash !== 'string' ||
    typeof bundle.bundleHash !== 'string'
  ) {
    throw new TypeError('Invalid Skyway Round checkpoint bundle.');
  }
  const payload = payloadFromBundle(bundle);
  if (hashSkywaySnapshot(payload) !== bundle.bundleHash) {
    throw new RangeError('Skyway checkpoint bundle hash is invalid.');
  }
  if (
    hashSkywaySnapshot(bundle.components.roundSnapshot) !==
      bundle.roundSnapshotHash
  ) {
    throw new RangeError('Skyway checkpoint Round snapshot hash is invalid.');
  }
}

export function createSkywayRoundCheckpointBundle({
  sessionIncarnation,
  roundEpoch,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  assertIncarnation(sessionIncarnation, roundEpoch);
  const prepared = prepareAlignedStack({
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
    roundEpoch,
  });
  const payload = {
    version: SKYWAY_ROUND_CHECKPOINT_VERSION,
    kind: 'skyway-round-checkpoint-bundle',
    sessionIncarnation,
    roundEpoch,
    tick: prepared.tick,
    participantIds: prepared.participantIds,
    roundSnapshotHash: hashSkywaySnapshot(prepared.roundSnapshot),
    components: {
      roundSnapshot: prepared.roundSnapshot,
      snapshotHistory: prepared.snapshotHistory,
      commandJournal: prepared.commandJournal,
      replayEventLedger: prepared.replayEventLedger,
    },
  };
  return deepFreeze({
    ...payload,
    bundleHash: hashSkywaySnapshot(payload),
  });
}

export function restoreSkywayRoundCheckpointBundle({
  sessionIncarnation,
  roundEpoch,
  bundle,
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
}) {
  assertBundleEnvelope(bundle, sessionIncarnation, roundEpoch);
  if (
    snapshotHistory?.roundEpoch !== roundEpoch ||
    commandJournal?.roundEpoch !== roundEpoch ||
    replayEventLedger?.roundEpoch !== roundEpoch
  ) {
    throw new RangeError('Skyway checkpoint target epoch is not aligned.');
  }

  const target = prepareAlignedStack({
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
    roundEpoch,
  });
  if (!sameParticipantOrder(target.participantIds, bundle.participantIds)) {
    throw new TypeError('Skyway checkpoint target participants are not aligned.');
  }
  if (
    target.snapshotHistory.capacityTicks !==
      bundle.components.snapshotHistory?.capacityTicks ||
    target.commandJournal.capacityTicks !==
      bundle.components.commandJournal?.capacityTicks ||
    target.replayEventLedger.capacityTicks !==
      bundle.components.replayEventLedger?.capacityTicks ||
    target.roundSnapshot.inputTimeline.capacityTicks !==
      bundle.components.roundSnapshot?.inputTimeline?.capacityTicks
  ) {
    throw new RangeError('Skyway checkpoint target capacities are not aligned.');
  }

  const scratchRound = structuredClone(round);
  restoreSkywayRound(scratchRound, bundle.components.roundSnapshot);
  const prepared = prepareAlignedStack({
    round: scratchRound,
    snapshotHistory: bundle.components.snapshotHistory,
    commandJournal: bundle.components.commandJournal,
    replayEventLedger: bundle.components.replayEventLedger,
    roundEpoch,
  });
  if (
    prepared.tick !== bundle.tick ||
    !canonicalEqual(prepared.roundSnapshot, bundle.components.roundSnapshot) ||
    hashSkywaySnapshot(prepared.roundSnapshot) !== bundle.roundSnapshotHash
  ) {
    throw new RangeError('Skyway checkpoint prepared Round is not aligned.');
  }
  if (
    target.replayEventLedger.committedThroughTick >
      prepared.replayEventLedger.committedThroughTick
  ) {
    throw new RangeError(
      'Skyway checkpoint cannot restore behind committed presentation effects.',
    );
  }

  const roundBackup = target.roundSnapshot;
  const historyBackup = structuredClone(snapshotHistory);
  const journalBackup = structuredClone(commandJournal);
  const ledgerBackup = structuredClone(replayEventLedger);
  try {
    restoreSkywayRound(round, prepared.roundSnapshot);
    restoreObjectState(snapshotHistory, prepared.snapshotHistory);
    restoreObjectState(commandJournal, prepared.commandJournal);
    restoreObjectState(replayEventLedger, prepared.replayEventLedger);
  } catch (error) {
    restoreSkywayRound(round, roundBackup);
    restoreObjectState(snapshotHistory, historyBackup);
    restoreObjectState(commandJournal, journalBackup);
    restoreObjectState(replayEventLedger, ledgerBackup);
    throw error;
  }

  return Object.freeze({
    version: SKYWAY_ROUND_CHECKPOINT_VERSION,
    kind: 'skyway-round-checkpoint-restore',
    sessionIncarnation,
    roundEpoch,
    tick: prepared.tick,
    roundSnapshotHash: bundle.roundSnapshotHash,
    bundleHash: bundle.bundleHash,
  });
}
