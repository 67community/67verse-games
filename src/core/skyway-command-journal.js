import {
  queueSkywayTimelineInput,
  snapshotSkywayInputTimeline,
  validateSkywayTickInput,
} from './skyway-input-timeline.js';

export const SKYWAY_COMMAND_JOURNAL_VERSION = 2;
export const SKYWAY_COMMAND_JOURNAL_CAPACITY = 120;

const AUTHORITY_RANK = Object.freeze({
  neutral: 0,
  predicted: 1,
  authoritative: 2,
});

function validParticipantIds(participantIds) {
  return Array.isArray(participantIds) &&
    participantIds.length > 0 &&
    participantIds.every((id) => typeof id === 'string' && id.length > 0) &&
    new Set(participantIds).size === participantIds.length;
}

function validAuthority(authority) {
  return Object.hasOwn(AUTHORITY_RANK, authority);
}

function inputsEqual(first, second) {
  return first.dirX === second.dirX &&
    first.dirZ === second.dirZ &&
    first.moving === second.moving &&
    first.jumpHeld === second.jumpHeld &&
    first.grabPressed === second.grabPressed;
}

function assertJournal(journal) {
  if (
    !journal ||
    journal.version !== SKYWAY_COMMAND_JOURNAL_VERSION ||
    !Number.isSafeInteger(journal.roundEpoch) ||
    journal.roundEpoch < 1 ||
    !Number.isInteger(journal.capacityTicks) ||
    journal.capacityTicks < 1 ||
    !validParticipantIds(journal.participantIds) ||
    !Array.isArray(journal.slots) ||
    journal.slots.length !== journal.capacityTicks ||
    (journal.oldestTick !== null && (
      !Number.isInteger(journal.oldestTick) ||
      !Number.isInteger(journal.latestTick) ||
      journal.oldestTick < 1 ||
      journal.latestTick < journal.oldestTick ||
      journal.latestTick - journal.oldestTick >= journal.capacityTicks
    )) ||
    (journal.oldestTick === null && journal.latestTick !== null)
  ) {
    throw new TypeError('Invalid Skyway command journal.');
  }
}

function assertRoundEpoch(journal, roundEpoch) {
  if (!Number.isSafeInteger(roundEpoch) || roundEpoch !== journal.roundEpoch) {
    throw new RangeError('Skyway command journal round epoch is stale.');
  }
}

function slotIndex(journal, tick) {
  return tick % journal.capacityTicks;
}

function detachedTick(entry) {
  if (!entry) return null;
  return {
    roundEpoch: entry.roundEpoch,
    tick: entry.tick,
    commands: entry.commands.map((command) => ({
      participantId: command.participantId,
      authority: command.authority,
      input: { ...command.input },
    })),
  };
}

function retainedEntry(journal, tick) {
  if (
    !Number.isInteger(tick) ||
    journal.oldestTick === null ||
    tick < journal.oldestTick ||
    tick > journal.latestTick
  ) {
    return null;
  }
  const entry = journal.slots[slotIndex(journal, tick)];
  return entry?.tick === tick ? entry : null;
}

export function createSkywayCommandJournal({
  participantIds,
  capacityTicks = SKYWAY_COMMAND_JOURNAL_CAPACITY,
  roundEpoch = 1,
}) {
  if (
    !validParticipantIds(participantIds) ||
    !Number.isInteger(capacityTicks) ||
    capacityTicks < 1 ||
    !Number.isSafeInteger(roundEpoch) ||
    roundEpoch < 1
  ) {
    throw new TypeError(
      'Skyway command journal requires participants, positive capacity, and round epoch.',
    );
  }
  return {
    version: SKYWAY_COMMAND_JOURNAL_VERSION,
    capacityTicks,
    roundEpoch,
    participantIds: [...participantIds],
    oldestTick: null,
    latestTick: null,
    slots: Array(capacityTicks).fill(null),
  };
}

export function appendSkywayCommandTick(journal, {
  tick,
  commands,
  roundEpoch,
}) {
  assertJournal(journal);
  assertRoundEpoch(journal, roundEpoch);
  if (!Number.isInteger(tick) || tick < 1) {
    throw new TypeError('Skyway command ticks must be positive integers.');
  }
  if (journal.latestTick !== null && tick !== journal.latestTick + 1) {
    throw new RangeError(`Skyway command journal expected tick ${journal.latestTick + 1}.`);
  }
  if (
    !Array.isArray(commands) ||
    commands.length !== journal.participantIds.length
  ) {
    throw new TypeError('Skyway command ticks require one ordered command per participant.');
  }
  const normalized = commands.map((command, index) => {
    if (
      command?.participantId !== journal.participantIds[index] ||
      !validAuthority(command.authority)
    ) {
      throw new TypeError('Skyway command tick order or authority is invalid.');
    }
    const input = validateSkywayTickInput(command.input);
    if (!input) throw new TypeError('Invalid Skyway journal input.');
    return {
      participantId: command.participantId,
      authority: command.authority,
      input,
    };
  });

  const entry = { roundEpoch: journal.roundEpoch, tick, commands: normalized };
  journal.slots[slotIndex(journal, tick)] = entry;
  if (journal.oldestTick === null) {
    journal.oldestTick = tick;
  } else if (tick - journal.oldestTick >= journal.capacityTicks) {
    journal.oldestTick = tick - journal.capacityTicks + 1;
  }
  journal.latestTick = tick;
  return detachedTick(entry);
}

export function lookupSkywayCommandTick(journal, tick, { roundEpoch } = {}) {
  assertJournal(journal);
  assertRoundEpoch(journal, roundEpoch);
  return detachedTick(retainedEntry(journal, tick));
}

export function replaceSkywayJournalCommand(
  journal,
  { tick, participantId, authority, input, roundEpoch },
) {
  assertJournal(journal);
  assertRoundEpoch(journal, roundEpoch);
  const entry = retainedEntry(journal, tick);
  if (!entry) return { accepted: false, reason: 'unavailable' };
  const participantIndex = journal.participantIds.indexOf(participantId);
  if (participantIndex < 0) {
    throw new RangeError(`Unknown Skyway participant "${participantId}".`);
  }
  if (!validAuthority(authority)) {
    throw new TypeError('Invalid Skyway command authority.');
  }
  const normalized = validateSkywayTickInput(input);
  if (!normalized) throw new TypeError('Invalid Skyway journal input.');

  const current = entry.commands[participantIndex];
  const nextRank = AUTHORITY_RANK[authority];
  const currentRank = AUTHORITY_RANK[current.authority];
  if (nextRank === currentRank) {
    return {
      accepted: false,
      reason: current.authority === 'authoritative' && !inputsEqual(current.input, normalized)
        ? 'authoritative-conflict'
        : 'duplicate',
    };
  }
  if (nextRank < currentRank) {
    return { accepted: false, reason: 'lower-authority' };
  }
  const previousAuthority = current.authority;
  const changed = !inputsEqual(current.input, normalized);
  entry.commands[participantIndex] = {
    participantId,
    authority,
    input: normalized,
  };
  return {
    accepted: true,
    reason: null,
    previousAuthority,
    authority,
    changed,
    rollbackTick: changed ? tick - 1 : null,
  };
}

export function reconstructSkywayInputTimeline(
  journal,
  timeline,
  { fromTick, throughTick, roundEpoch },
) {
  assertJournal(journal);
  assertRoundEpoch(journal, roundEpoch);
  if (
    !Number.isInteger(fromTick) ||
    !Number.isInteger(throughTick) ||
    fromTick < 1 ||
    throughTick < fromTick ||
    timeline?.nextTick !== fromTick ||
    timeline.capacityTicks < throughTick - fromTick + 1 ||
    timeline.participantIds?.length !== journal.participantIds.length ||
    journal.participantIds.some((id, index) => timeline.participantIds[index] !== id)
  ) {
    throw new TypeError('Skyway journal reconstruction range is invalid.');
  }
  const retained = [];
  for (let tick = fromTick; tick <= throughTick; tick++) {
    const entry = retainedEntry(journal, tick);
    if (!entry) {
      throw new RangeError(`Skyway command journal does not retain tick ${tick}.`);
    }
    retained.push(entry);
  }
  const timelineSnapshot = snapshotSkywayInputTimeline(timeline);
  if (timelineSnapshot.entries.some((entry) => (
    entry.tick >= fromTick && entry.tick <= throughTick && entry.inputs.length > 0
  ))) {
    throw new RangeError('Skyway reconstruction requires an empty timeline range.');
  }

  let commandCount = 0;
  for (const entry of retained) {
    for (const command of entry.commands) {
      const queued = queueSkywayTimelineInput(timeline, {
        tick: entry.tick,
        participantId: command.participantId,
        input: command.input,
      });
      if (!queued.accepted) {
        throw new TypeError('Skyway journal reconstruction could not queue a retained command.');
      }
      commandCount += 1;
    }
  }
  return { fromTick, throughTick, commandCount };
}

export function resetSkywayCommandJournal(journal, { roundEpoch } = {}) {
  assertJournal(journal);
  assertRoundEpoch(journal, roundEpoch);
  if (journal.roundEpoch >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Skyway command journal round epoch is exhausted.');
  }
  journal.oldestTick = null;
  journal.latestTick = null;
  journal.slots.fill(null);
  journal.roundEpoch += 1;
  return journal;
}
