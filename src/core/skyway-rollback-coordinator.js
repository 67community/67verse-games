import {
  reconstructSkywayInputTimeline,
} from './skyway-command-journal.js';
import {
  createSkywayInputTimeline,
  restoreSkywayInputTimeline,
  snapshotSkywayInputTimeline,
} from './skyway-input-timeline.js';
import {
  restoreSkywayRound,
  snapshotSkywayRound,
} from './skyway-round.js';
import {
  hashSkywaySnapshot,
  lookupSkywaySnapshot,
  truncateSkywaySnapshotHistory,
} from './skyway-snapshot-history.js';

export const SKYWAY_ROLLBACK_COORDINATOR_VERSION = 2;

function sameParticipantOrder(first, second) {
  return Array.isArray(first) &&
    Array.isArray(second) &&
    first.length === second.length &&
    first.every((id, index) => id === second[index]);
}

function participantIdsFromRound(round) {
  return round?.participants?.map((participant) => participant.id);
}

function assertEmptyReconstructionRange(snapshot, fromTick, throughTick) {
  const timeline = snapshot?.inputTimeline;
  if (
    timeline?.nextTick !== fromTick ||
    !Array.isArray(timeline.entries) ||
    timeline.entries.some((entry) => (
      entry?.tick >= fromTick &&
      entry.tick <= throughTick &&
      entry.inputs?.length > 0
    ))
  ) {
    throw new RangeError(
      'Skyway rollback requires an empty restored input timeline range.',
    );
  }
}

function planSkywayRollback({
  round,
  snapshotHistory,
  commandJournal,
  rollbackTick,
  throughTick,
  roundEpoch,
}) {
  const resolvedThroughTick = throughTick ?? round?.tick;
  if (
    !Number.isInteger(rollbackTick) ||
    rollbackTick < 0 ||
    !Number.isInteger(resolvedThroughTick) ||
    resolvedThroughTick <= rollbackTick
  ) {
    throw new TypeError('Skyway rollback requires a valid completed tick range.');
  }

  const fromTick = rollbackTick + 1;
  const participantIds = participantIdsFromRound(round);
  const timeline = round?.inputTimeline;
  if (
    !Number.isSafeInteger(roundEpoch) ||
    roundEpoch < 1 ||
    snapshotHistory?.roundEpoch !== roundEpoch ||
    commandJournal?.roundEpoch !== roundEpoch
  ) {
    throw new RangeError('Skyway rollback round epochs are not aligned.');
  }
  if (
    round?.tick !== resolvedThroughTick ||
    timeline?.nextTick !== resolvedThroughTick + 1 ||
    snapshotHistory?.latestTick !== resolvedThroughTick ||
    commandJournal?.latestTick !== resolvedThroughTick
  ) {
    throw new RangeError('Skyway rollback heads are not aligned.');
  }
  if (
    !Number.isInteger(snapshotHistory?.capacityTicks) ||
    !Number.isInteger(commandJournal?.capacityTicks) ||
    !Number.isInteger(timeline?.capacityTicks) ||
    snapshotHistory.capacityTicks < commandJournal.capacityTicks + 1 ||
    timeline.capacityTicks < commandJournal.capacityTicks
  ) {
    throw new RangeError('Skyway rollback retention capacities are not aligned.');
  }
  if (
    !sameParticipantOrder(participantIds, commandJournal?.participantIds) ||
    !sameParticipantOrder(participantIds, timeline?.participantIds)
  ) {
    throw new TypeError('Skyway rollback participant order is not aligned.');
  }
  if (
    snapshotHistory.oldestTick === null ||
    snapshotHistory.oldestTick > rollbackTick ||
    commandJournal.oldestTick === null ||
    commandJournal.oldestTick > fromTick ||
    resolvedThroughTick - fromTick + 1 > timeline.capacityTicks
  ) {
    throw new RangeError('Skyway rollback range is outside retained coverage.');
  }

  const currentRound = snapshotSkywayRound(round);
  const currentHistory = lookupSkywaySnapshot(
    snapshotHistory,
    resolvedThroughTick,
    { roundEpoch },
  );
  if (
    !currentHistory ||
    currentHistory.hash !== hashSkywaySnapshot(currentRound)
  ) {
    throw new RangeError('Skyway rollback current snapshot is not aligned.');
  }

  const rollback = lookupSkywaySnapshot(snapshotHistory, rollbackTick, {
    roundEpoch,
  });
  if (
    !rollback ||
    rollback.snapshot?.tick !== rollbackTick ||
    rollback.snapshot?.inputTimeline?.capacityTicks !== timeline.capacityTicks ||
    !sameParticipantOrder(
      participantIds,
      rollback.snapshot?.inputTimeline?.participantIds,
    )
  ) {
    throw new RangeError('Skyway rollback snapshot coverage is unavailable.');
  }
  assertEmptyReconstructionRange(rollback.snapshot, fromTick, resolvedThroughTick);

  // Exact history coverage is checked before any live state can be changed.
  for (let tick = fromTick; tick <= resolvedThroughTick; tick++) {
    if (!lookupSkywaySnapshot(snapshotHistory, tick, { roundEpoch })) {
      throw new RangeError(`Skyway snapshot history does not retain tick ${tick}.`);
    }
  }

  // Build the reconstructed timeline in scratch state. Journal coverage,
  // commands, and queue capacity are therefore proven before the commit.
  const preparedTimeline = createSkywayInputTimeline({
    participantIds,
    capacityTicks: timeline.capacityTicks,
  });
  restoreSkywayInputTimeline(preparedTimeline, rollback.snapshot.inputTimeline);
  const reconstructed = reconstructSkywayInputTimeline(
    commandJournal,
    preparedTimeline,
    { fromTick, throughTick: resolvedThroughTick, roundEpoch },
  );

  return {
    currentRound,
    rollback,
    fromTick,
    throughTick: resolvedThroughTick,
    commandCount: reconstructed.commandCount,
    preparedTimeline: snapshotSkywayInputTimeline(preparedTimeline),
  };
}

export function coordinateSkywayRollback(options) {
  const plan = planSkywayRollback(options);
  const { round, snapshotHistory } = options;

  try {
    restoreSkywayRound(round, plan.rollback.snapshot);
    restoreSkywayInputTimeline(round.inputTimeline, plan.preparedTimeline);
    truncateSkywaySnapshotHistory(snapshotHistory, plan.rollback.tick, {
      roundEpoch: options.roundEpoch,
    });
  } catch (error) {
    restoreSkywayRound(round, plan.currentRound);
    throw error;
  }

  return Object.freeze({
    version: SKYWAY_ROLLBACK_COORDINATOR_VERSION,
    kind: 'skyway-resimulation',
    roundEpoch: options.roundEpoch,
    rollbackTick: plan.rollback.tick,
    fromTick: plan.fromTick,
    throughTick: plan.throughTick,
    tickCount: plan.throughTick - plan.fromTick + 1,
    commandCount: plan.commandCount,
    restoredSnapshotHash: plan.rollback.hash,
    suppressPresentation: true,
  });
}
