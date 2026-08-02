import {
  resetSkywayCommandJournal,
} from './skyway-command-journal.js';
import {
  resetSkywayReplayEventLedger,
} from './skyway-replay-event-ledger.js';
import {
  resetSkywayRound,
  restoreSkywayRound,
  snapshotSkywayRound,
} from './skyway-round.js';
import {
  hashSkywaySnapshot,
  lookupSkywaySnapshot,
  recordSkywaySnapshot,
  resetSkywaySnapshotHistory,
} from './skyway-snapshot-history.js';

export const SKYWAY_ROUND_LIFECYCLE_VERSION = 2;

function participantIdsFromRound(round) {
  return round?.participants?.map((participant) => participant.id);
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

function assertAlignedLifecycleHead({
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
  roundEpoch,
}) {
  const currentRound = snapshotSkywayRound(round);
  const tick = currentRound.tick;
  const participantIds = participantIdsFromRound(round);
  const expectedSidecarHead = tick === 0 ? null : tick;
  if (
    round?.inputTimeline?.nextTick !== tick + 1 ||
    (
      tick === 0
        ? ![null, 0].includes(snapshotHistory?.latestTick)
        : snapshotHistory?.latestTick !== tick
    ) ||
    commandJournal?.latestTick !== expectedSidecarHead ||
    replayEventLedger?.latestTick !== expectedSidecarHead ||
    replayEventLedger?.nextTick !== tick + 1
  ) {
    throw new RangeError('Skyway round lifecycle heads are not aligned.');
  }
  if (
    !Number.isSafeInteger(snapshotHistory?.roundEpoch) ||
    snapshotHistory.roundEpoch !== commandJournal?.roundEpoch ||
    snapshotHistory.roundEpoch !== replayEventLedger?.roundEpoch ||
    snapshotHistory.roundEpoch !== roundEpoch
  ) {
    throw new RangeError('Skyway round lifecycle epochs are not aligned.');
  }
  if (
    !sameParticipantOrder(participantIds, round.inputTimeline.participantIds) ||
    !sameParticipantOrder(participantIds, commandJournal?.participantIds) ||
    !sameParticipantOrder(participantIds, replayEventLedger?.participantIds)
  ) {
    throw new TypeError('Skyway round lifecycle participant order is not aligned.');
  }
  if (
    !Number.isInteger(snapshotHistory?.capacityTicks) ||
    !Number.isInteger(commandJournal?.capacityTicks) ||
    !Number.isInteger(replayEventLedger?.capacityTicks) ||
    snapshotHistory.capacityTicks < commandJournal.capacityTicks + 1 ||
    round.inputTimeline.capacityTicks < commandJournal.capacityTicks ||
    replayEventLedger.capacityTicks < commandJournal.capacityTicks
  ) {
    throw new RangeError('Skyway round lifecycle capacities are not aligned.');
  }
  const currentHistory = snapshotHistory.latestTick === null
    ? null
    : lookupSkywaySnapshot(snapshotHistory, tick, { roundEpoch });
  if (currentHistory && currentHistory.hash !== hashSkywaySnapshot(currentRound)) {
    throw new RangeError('Skyway round lifecycle snapshot head is not aligned.');
  }
  if (tick > 0 && !currentHistory) {
    throw new RangeError('Skyway round lifecycle snapshot head is not aligned.');
  }
  return { currentRound, currentHistory };
}

function prepareLifecycleReset({
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
  roundEpoch,
}) {
  const scratchRound = structuredClone(round);
  const scratchHistory = structuredClone(snapshotHistory);
  const scratchJournal = structuredClone(commandJournal);
  const scratchLedger = structuredClone(replayEventLedger);
  resetSkywayRound(scratchRound);
  resetSkywaySnapshotHistory(scratchHistory, { roundEpoch });
  const snapshot = snapshotSkywayRound(scratchRound);
  const seeded = recordSkywaySnapshot(scratchHistory, snapshot, {
    roundEpoch: scratchHistory.roundEpoch,
  });
  resetSkywayCommandJournal(scratchJournal, { roundEpoch });
  resetSkywayReplayEventLedger(scratchLedger, { nextTick: 1, roundEpoch });

  if (
    snapshot.tick !== 0 ||
    scratchHistory.oldestTick !== 0 ||
    scratchHistory.latestTick !== 0 ||
    scratchJournal.oldestTick !== null ||
    scratchJournal.latestTick !== null ||
    scratchLedger.oldestTick !== null ||
    scratchLedger.latestTick !== null ||
    scratchLedger.nextTick !== 1 ||
    scratchLedger.committedThroughTick !== 0 ||
    scratchLedger.revision !== 0 ||
    scratchHistory.roundEpoch !== roundEpoch + 1 ||
    scratchJournal.roundEpoch !== roundEpoch + 1 ||
    scratchLedger.roundEpoch !== roundEpoch + 1
  ) {
    throw new TypeError('Skyway round lifecycle reset could not be prepared.');
  }
  return {
    snapshot,
    seeded,
    nextRoundEpoch: scratchLedger.roundEpoch,
    scratchHistory,
    scratchJournal,
    scratchLedger,
  };
}

export function resetSkywayRoundLifecycle({
  round,
  snapshotHistory,
  commandJournal,
  replayEventLedger,
  roundEpoch,
}) {
  const aligned = assertAlignedLifecycleHead({
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
    roundEpoch,
  });
  const prepared = prepareLifecycleReset({
    round,
    snapshotHistory,
    commandJournal,
    replayEventLedger,
    roundEpoch,
  });
  const previousTick = round.tick;
  const previousRoundEpoch = replayEventLedger.roundEpoch;
  const historyBackup = structuredClone(snapshotHistory);
  const journalBackup = structuredClone(commandJournal);
  const ledgerBackup = structuredClone(replayEventLedger);

  try {
    restoreSkywayRound(round, prepared.snapshot);
    restoreObjectState(snapshotHistory, prepared.scratchHistory);
    restoreObjectState(commandJournal, prepared.scratchJournal);
    restoreObjectState(replayEventLedger, prepared.scratchLedger);
  } catch (error) {
    restoreSkywayRound(round, aligned.currentRound);
    restoreObjectState(snapshotHistory, historyBackup);
    restoreObjectState(commandJournal, journalBackup);
    restoreObjectState(replayEventLedger, ledgerBackup);
    throw error;
  }

  return Object.freeze({
    version: SKYWAY_ROUND_LIFECYCLE_VERSION,
    kind: 'skyway-round-lifecycle-reset',
    previousTick,
    tick: 0,
    nextTick: 1,
    previousRoundEpoch,
    roundEpoch: prepared.nextRoundEpoch,
    initialSnapshotHash: prepared.seeded.hash,
  });
}
