import {
  SKYWAY_AUTHORITATIVE_CORRECTION_BATCH_CAPACITY,
} from './skyway-authoritative-correction.js';
import {
  validateSkywayTickInput,
} from './skyway-round.js';
import {
  canonicalizeSkywaySnapshot,
  hashSkywaySnapshot,
} from './skyway-snapshot-history.js';

export const SKYWAY_INPUT_ADMISSION_VERSION = 1;
export const SKYWAY_INPUT_ADMISSION_MAX_PARTICIPANTS = 8;
export const SKYWAY_INPUT_ADMISSION_MAX_SEQUENCE = 1_000_000_000;
export const SKYWAY_INPUT_ADMISSION_MAX_PAST_TICKS = 120;
export const SKYWAY_INPUT_ADMISSION_MAX_FUTURE_TICKS = 32;

const COMMAND_KEYS = Object.freeze([
  'clientSequence',
  'input',
  'ownerId',
  'participantId',
  'roundEpoch',
  'sessionIncarnation',
  'tick',
]);
const BATCH_KEYS = Object.freeze([
  'acks',
  'admissionRevision',
  'batchHash',
  'correctionCount',
  'corrections',
  'currentTick',
  'decisions',
  'fromTick',
  'kind',
  'roundEpoch',
  'sessionIncarnation',
  'throughTick',
  'version',
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

function boundedId(value, maxLength = 64) {
  return typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= maxLength &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}

function validSessionIncarnation(value) {
  return boundedId(value, 128);
}

function inputsEqual(first, second) {
  return first.dirX === second.dirX &&
    first.dirZ === second.dirZ &&
    first.moving === second.moving &&
    first.jumpHeld === second.jumpHeld &&
    first.grabPressed === second.grabPressed;
}

function commandsEqual(first, second) {
  return first.ownerId === second.ownerId &&
    first.participantId === second.participantId &&
    first.clientSequence === second.clientSequence &&
    first.tick === second.tick &&
    inputsEqual(first.input, second.input);
}

function canonicalInput(input) {
  const normalized = validateSkywayTickInput(input);
  return normalized && inputsEqual(normalized, input);
}

function participantOrder(window, participantId) {
  return window.participantIds.indexOf(participantId);
}

function minimumTick(window, currentTick = window.currentTick) {
  return Math.max(1, currentTick - window.pastTickHorizon);
}

function maximumTick(window, currentTick = window.currentTick) {
  return currentTick + window.futureTickHorizon;
}

function slotIndex(window, tick) {
  return tick % window.slotCapacity;
}

function ownerOrderFromOwnership(ownership) {
  return [...new Set(ownership.map(({ ownerId }) => ownerId))];
}

function ownershipMap(window) {
  return new Map(
    window.ownership.map(({ participantId, ownerId }) => [
      participantId,
      ownerId,
    ]),
  );
}

function assertWindow(window) {
  if (
    !window ||
    window.version !== SKYWAY_INPUT_ADMISSION_VERSION ||
    !validSessionIncarnation(window.sessionIncarnation) ||
    !Number.isSafeInteger(window.roundEpoch) ||
    window.roundEpoch < 1 ||
    !Number.isSafeInteger(window.currentTick) ||
    window.currentTick < 0 ||
    !Number.isSafeInteger(window.revision) ||
    window.revision < 0 ||
    !Number.isInteger(window.pastTickHorizon) ||
    window.pastTickHorizon < 0 ||
    window.pastTickHorizon > SKYWAY_INPUT_ADMISSION_MAX_PAST_TICKS ||
    !Number.isInteger(window.futureTickHorizon) ||
    window.futureTickHorizon < 0 ||
    window.futureTickHorizon > SKYWAY_INPUT_ADMISSION_MAX_FUTURE_TICKS ||
    maximumTick(window) > Number.MAX_SAFE_INTEGER ||
    !Array.isArray(window.participantIds) ||
    window.participantIds.length < 1 ||
    window.participantIds.length > SKYWAY_INPUT_ADMISSION_MAX_PARTICIPANTS ||
    window.participantIds.some((id) => !boundedId(id)) ||
    new Set(window.participantIds).size !== window.participantIds.length ||
    !Array.isArray(window.ownership) ||
    window.ownership.length < 1 ||
    window.ownership.length > window.participantIds.length ||
    !Array.isArray(window.owners) ||
    !Array.isArray(window.slots) ||
    window.slotCapacity !==
      window.pastTickHorizon + window.futureTickHorizon + 1 ||
    window.slots.length !== window.slotCapacity
  ) {
    throw new TypeError('Invalid Skyway input-admission window.');
  }

  const participantSet = new Set(window.participantIds);
  const ownedParticipants = new Set();
  for (const entry of window.ownership) {
    if (
      !exactKeys(entry, ['ownerId', 'participantId']) ||
      !participantSet.has(entry.participantId) ||
      !boundedId(entry.ownerId) ||
      ownedParticipants.has(entry.participantId)
    ) {
      throw new TypeError('Invalid Skyway input-admission ownership.');
    }
    ownedParticipants.add(entry.participantId);
  }

  const expectedOwnerOrder = ownerOrderFromOwnership(window.ownership);
  if (
    expectedOwnerOrder.length !== window.owners.length ||
    window.owners.some((owner, index) => (
      owner?.ownerId !== expectedOwnerOrder[index]
    ))
  ) {
    throw new TypeError('Invalid Skyway input-admission owners.');
  }
  for (const owner of window.owners) {
    if (
      !exactKeys(owner, ['ackSequence', 'lastAcceptedCommand', 'ownerId']) ||
      !Number.isInteger(owner.ackSequence) ||
      owner.ackSequence < -1 ||
      owner.ackSequence > SKYWAY_INPUT_ADMISSION_MAX_SEQUENCE ||
      (
        owner.ackSequence === -1
          ? owner.lastAcceptedCommand !== null
          : (
              !owner.lastAcceptedCommand ||
              owner.lastAcceptedCommand.ownerId !== owner.ownerId ||
              owner.lastAcceptedCommand.clientSequence !== owner.ackSequence ||
              !window.ownership.some((entry) => (
                entry.participantId ===
                  owner.lastAcceptedCommand.participantId &&
                entry.ownerId === owner.ownerId
              )) ||
              !Number.isSafeInteger(owner.lastAcceptedCommand.tick) ||
              owner.lastAcceptedCommand.tick < 1 ||
              !canonicalInput(owner.lastAcceptedCommand.input)
            )
      )
    ) {
      throw new TypeError('Invalid Skyway input-admission acknowledgement.');
    }
  }

  const ownerByParticipant = ownershipMap(window);
  const seenTicks = new Set();
  for (let index = 0; index < window.slots.length; index++) {
    const slot = window.slots[index];
    if (slot === null) continue;
    if (
      !exactKeys(slot, ['decisions', 'tick']) ||
      !Number.isSafeInteger(slot.tick) ||
      slot.tick < minimumTick(window) ||
      slot.tick > maximumTick(window) ||
      slotIndex(window, slot.tick) !== index ||
      seenTicks.has(slot.tick) ||
      !Array.isArray(slot.decisions) ||
      slot.decisions.length < 1
    ) {
      throw new TypeError('Invalid Skyway input-admission slot.');
    }
    seenTicks.add(slot.tick);
    let previousOrder = -1;
    for (const decision of slot.decisions) {
      const order = participantOrder(window, decision.participantId);
      const owner = window.owners.find(({ ownerId }) => (
        ownerId === decision.ownerId
      ));
      if (
        !exactKeys(decision, [
          'clientSequence',
          'input',
          'ownerId',
          'participantId',
          'status',
          'tick',
        ]) ||
        decision.tick !== slot.tick ||
        order <= previousOrder ||
        ownerByParticipant.get(decision.participantId) !== decision.ownerId ||
        !owner ||
        !Number.isInteger(decision.clientSequence) ||
        decision.clientSequence < 0 ||
        decision.clientSequence > owner.ackSequence ||
        !['pending', 'emitted'].includes(decision.status) ||
        !canonicalInput(decision.input)
      ) {
        throw new TypeError('Invalid Skyway input-admission decision.');
      }
      previousOrder = order;
    }
  }
}

function assertBinding(window, sessionIncarnation, roundEpoch) {
  if (sessionIncarnation !== window.sessionIncarnation) {
    throw new RangeError('Skyway input admission session incarnation is stale.');
  }
  if (roundEpoch !== window.roundEpoch) {
    throw new RangeError('Skyway input admission round epoch is stale.');
  }
}

function rejectedResult(window, command, reason) {
  const owner = window.owners.find(({ ownerId }) => (
    ownerId === command?.ownerId
  ));
  const ackSequence = owner?.ackSequence ?? null;
  return deepFreeze({
    version: SKYWAY_INPUT_ADMISSION_VERSION,
    kind: 'skyway-input-admission',
    accepted: false,
    status: reason === 'duplicate' ? 'duplicate' : 'rejected',
    reason,
    ownerId: typeof command?.ownerId === 'string' ? command.ownerId : null,
    participantId: typeof command?.participantId === 'string'
      ? command.participantId
      : null,
    clientSequence: Number.isInteger(command?.clientSequence)
      ? command.clientSequence
      : null,
    tick: Number.isInteger(command?.tick) ? command.tick : null,
    ackSequence,
    expectedSequence: ackSequence === null ||
      ackSequence >= SKYWAY_INPUT_ADMISSION_MAX_SEQUENCE
      ? null
      : ackSequence + 1,
    queued: false,
    revision: window.revision,
  });
}

function acceptedResult(window, command, { queued, reason = null }) {
  const owner = window.owners.find(({ ownerId }) => (
    ownerId === command.ownerId
  ));
  return deepFreeze({
    version: SKYWAY_INPUT_ADMISSION_VERSION,
    kind: 'skyway-input-admission',
    accepted: true,
    status: 'accepted',
    reason,
    ownerId: command.ownerId,
    participantId: command.participantId,
    clientSequence: command.clientSequence,
    tick: command.tick,
    ackSequence: owner.ackSequence,
    expectedSequence: owner.ackSequence >= SKYWAY_INPUT_ADMISSION_MAX_SEQUENCE
      ? null
      : owner.ackSequence + 1,
    queued,
    revision: window.revision,
  });
}

function batchPayload(window, throughTick, corrections, decisions) {
  return {
    version: SKYWAY_INPUT_ADMISSION_VERSION,
    kind: 'skyway-input-admission-batch',
    sessionIncarnation: window.sessionIncarnation,
    roundEpoch: window.roundEpoch,
    admissionRevision: window.revision,
    currentTick: window.currentTick,
    fromTick: corrections[0]?.tick ?? null,
    throughTick,
    correctionCount: corrections.length,
    corrections,
    decisions,
    acks: window.owners.map(({ ownerId, ackSequence }) => ({
      ownerId,
      ackSequence,
    })),
  };
}

function detachedCommand(command) {
  return command
    ? {
        ownerId: command.ownerId,
        participantId: command.participantId,
        clientSequence: command.clientSequence,
        tick: command.tick,
        input: { ...command.input },
      }
    : null;
}

export function createSkywayInputAdmissionWindow({
  sessionIncarnation,
  roundEpoch,
  participantIds,
  ownership,
  pastTickHorizon = 119,
  futureTickHorizon = 8,
  currentTick = 0,
}) {
  if (
    !validSessionIncarnation(sessionIncarnation) ||
    !Number.isSafeInteger(roundEpoch) ||
    roundEpoch < 1 ||
    !Number.isSafeInteger(currentTick) ||
    currentTick < 0 ||
    !Array.isArray(participantIds) ||
    participantIds.length < 1 ||
    participantIds.length > SKYWAY_INPUT_ADMISSION_MAX_PARTICIPANTS ||
    participantIds.some((id) => !boundedId(id)) ||
    new Set(participantIds).size !== participantIds.length ||
    !Array.isArray(ownership) ||
    ownership.length < 1 ||
    !Number.isInteger(pastTickHorizon) ||
    pastTickHorizon < 0 ||
    pastTickHorizon > SKYWAY_INPUT_ADMISSION_MAX_PAST_TICKS ||
    !Number.isInteger(futureTickHorizon) ||
    futureTickHorizon < 0 ||
    futureTickHorizon > SKYWAY_INPUT_ADMISSION_MAX_FUTURE_TICKS ||
    currentTick + futureTickHorizon > Number.MAX_SAFE_INTEGER
  ) {
    throw new TypeError('Invalid Skyway input-admission configuration.');
  }
  const participantSet = new Set(participantIds);
  const owned = new Set();
  const normalizedOwnership = ownership.map((entry) => {
    if (
      !exactKeys(entry, ['ownerId', 'participantId']) ||
      !participantSet.has(entry.participantId) ||
      !boundedId(entry.ownerId) ||
      owned.has(entry.participantId)
    ) {
      throw new TypeError('Invalid Skyway input-admission ownership.');
    }
    owned.add(entry.participantId);
    return { participantId: entry.participantId, ownerId: entry.ownerId };
  });
  const ownerIds = ownerOrderFromOwnership(normalizedOwnership);
  if (ownerIds.length > SKYWAY_INPUT_ADMISSION_MAX_PARTICIPANTS) {
    throw new TypeError('Invalid Skyway input-admission ownership.');
  }
  const slotCapacity = pastTickHorizon + futureTickHorizon + 1;
  const window = {
    version: SKYWAY_INPUT_ADMISSION_VERSION,
    sessionIncarnation,
    roundEpoch,
    participantIds: [...participantIds],
    ownership: normalizedOwnership,
    pastTickHorizon,
    futureTickHorizon,
    currentTick,
    slotCapacity,
    revision: 0,
    owners: ownerIds.map((ownerId) => ({
      ownerId,
      ackSequence: -1,
      lastAcceptedCommand: null,
    })),
    slots: Array(slotCapacity).fill(null),
  };
  assertWindow(window);
  return window;
}

export function admitSkywayParticipantInput(window, command) {
  assertWindow(window);
  if (command?.sessionIncarnation !== window.sessionIncarnation) {
    return rejectedResult(window, command, 'stale-session');
  }
  if (command?.roundEpoch !== window.roundEpoch) {
    return rejectedResult(window, command, 'stale-epoch');
  }
  if (
    !exactKeys(command, COMMAND_KEYS) ||
    !boundedId(command.ownerId) ||
    !boundedId(command.participantId) ||
    !Number.isInteger(command.clientSequence) ||
    command.clientSequence < 0 ||
    command.clientSequence > SKYWAY_INPUT_ADMISSION_MAX_SEQUENCE ||
    !Number.isSafeInteger(command.tick) ||
    command.tick < 1
  ) {
    return rejectedResult(window, command, 'invalid-input');
  }
  const expectedOwner = ownershipMap(window).get(command.participantId);
  const owner = window.owners.find(({ ownerId }) => (
    ownerId === command.ownerId
  ));
  if (!owner || expectedOwner !== command.ownerId) {
    return rejectedResult(window, command, 'not-owner');
  }

  if (command.clientSequence <= owner.ackSequence) {
    if (command.clientSequence < owner.ackSequence) {
      return rejectedResult(window, command, 'replay');
    }
    const normalized = validateSkywayTickInput(command.input);
    if (!normalized) return rejectedResult(window, command, 'invalid-input');
    const comparable = {
      ownerId: command.ownerId,
      participantId: command.participantId,
      clientSequence: command.clientSequence,
      tick: command.tick,
      input: normalized,
    };
    return rejectedResult(
      window,
      command,
      commandsEqual(owner.lastAcceptedCommand, comparable)
        ? 'duplicate'
        : 'sequence-conflict',
    );
  }
  if (owner.ackSequence >= SKYWAY_INPUT_ADMISSION_MAX_SEQUENCE) {
    return rejectedResult(window, command, 'sequence-exhausted');
  }
  if (command.clientSequence !== owner.ackSequence + 1) {
    return rejectedResult(window, command, 'sequence-gap');
  }
  if (command.tick < minimumTick(window)) {
    return rejectedResult(window, command, 'past-window');
  }
  if (command.tick > maximumTick(window)) {
    return rejectedResult(window, command, 'future-window');
  }
  const input = validateSkywayTickInput(command.input);
  if (!input) return rejectedResult(window, command, 'invalid-input');

  const index = slotIndex(window, command.tick);
  let slot = window.slots[index];
  if (slot && slot.tick !== command.tick) {
    return rejectedResult(window, command, 'capacity');
  }
  const existing = slot?.decisions.find(({ participantId }) => (
    participantId === command.participantId
  ));
  if (existing && !inputsEqual(existing.input, input)) {
    return rejectedResult(window, command, 'command-conflict');
  }

  const acceptedCommand = {
    ownerId: command.ownerId,
    participantId: command.participantId,
    clientSequence: command.clientSequence,
    tick: command.tick,
    input,
  };
  owner.ackSequence = command.clientSequence;
  owner.lastAcceptedCommand = detachedCommand(acceptedCommand);
  window.revision += 1;

  if (existing) {
    return acceptedResult(window, acceptedCommand, {
      queued: false,
      reason: 'equivalent',
    });
  }
  if (!slot) {
    slot = { tick: command.tick, decisions: [] };
    window.slots[index] = slot;
  }
  slot.decisions.push({
    ...acceptedCommand,
    input: { ...acceptedCommand.input },
    status: 'pending',
  });
  slot.decisions.sort((first, second) => (
    participantOrder(window, first.participantId) -
    participantOrder(window, second.participantId)
  ));
  return acceptedResult(window, acceptedCommand, { queued: true });
}

export function advanceSkywayInputAdmissionHead(window, {
  sessionIncarnation,
  roundEpoch,
  currentTick,
}) {
  assertWindow(window);
  assertBinding(window, sessionIncarnation, roundEpoch);
  if (
    !Number.isSafeInteger(currentTick) ||
    currentTick < window.currentTick ||
    currentTick + window.futureTickHorizon > Number.MAX_SAFE_INTEGER
  ) {
    throw new TypeError(
      'Skyway input-admission head must advance monotonically.',
    );
  }
  const nextMinimum = minimumTick(window, currentTick);
  for (const slot of window.slots) {
    if (
      slot &&
      slot.tick < nextMinimum &&
      slot.decisions.some(({ status }) => status === 'pending')
    ) {
      throw new RangeError(
        'Skyway input-admission head would expire pending input.',
      );
    }
  }
  for (let index = 0; index < window.slots.length; index++) {
    const slot = window.slots[index];
    if (slot && slot.tick < nextMinimum) window.slots[index] = null;
  }
  if (currentTick !== window.currentTick) {
    window.currentTick = currentTick;
    window.revision += 1;
  }
  return deepFreeze({
    version: SKYWAY_INPUT_ADMISSION_VERSION,
    kind: 'skyway-input-admission-head',
    sessionIncarnation,
    roundEpoch,
    currentTick,
    minimumTick: minimumTick(window),
    maximumTick: maximumTick(window),
    revision: window.revision,
    acks: window.owners.map(({ ownerId, ackSequence }) => ({
      ownerId,
      ackSequence,
    })),
  });
}

export function createSkywayInputAdmissionBatch(window, {
  sessionIncarnation,
  roundEpoch,
  throughTick = window?.currentTick,
  limit = SKYWAY_AUTHORITATIVE_CORRECTION_BATCH_CAPACITY,
}) {
  assertWindow(window);
  assertBinding(window, sessionIncarnation, roundEpoch);
  if (
    !Number.isSafeInteger(throughTick) ||
    throughTick < (window.currentTick === 0 ? 0 : minimumTick(window)) ||
    throughTick > window.currentTick ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > SKYWAY_AUTHORITATIVE_CORRECTION_BATCH_CAPACITY
  ) {
    throw new TypeError('Invalid Skyway input-admission batch range.');
  }

  const ready = window.slots
    .filter((slot) => slot && slot.tick <= throughTick)
    .flatMap((slot) => slot.decisions)
    .filter(({ status }) => status === 'pending')
    .sort((first, second) => (
      first.tick - second.tick ||
      participantOrder(window, first.participantId) -
        participantOrder(window, second.participantId)
    ))
    .slice(0, limit);
  const corrections = ready.map(({ tick, participantId, input }) => ({
    tick,
    participantId,
    input: { ...input },
  }));
  const decisions = ready.map(({
    tick,
    participantId,
    ownerId,
    clientSequence,
  }) => ({
    tick,
    participantId,
    ownerId,
    clientSequence,
  }));
  const payload = batchPayload(window, throughTick, corrections, decisions);
  return deepFreeze({
    ...payload,
    batchHash: hashSkywaySnapshot({
      sessionIncarnation,
      roundEpoch,
      admissionRevision: window.revision,
      currentTick: window.currentTick,
      throughTick,
      corrections,
      decisions,
    }),
  });
}

export function commitSkywayInputAdmissionBatch(window, {
  sessionIncarnation,
  roundEpoch,
  batch,
}) {
  assertWindow(window);
  assertBinding(window, sessionIncarnation, roundEpoch);
  if (
    !exactKeys(batch, BATCH_KEYS) ||
    batch.version !== SKYWAY_INPUT_ADMISSION_VERSION ||
    batch.kind !== 'skyway-input-admission-batch' ||
    batch.sessionIncarnation !== sessionIncarnation ||
    batch.roundEpoch !== roundEpoch ||
    batch.admissionRevision !== window.revision ||
    !Number.isInteger(batch.correctionCount) ||
    batch.correctionCount < 1 ||
    batch.correctionCount > SKYWAY_AUTHORITATIVE_CORRECTION_BATCH_CAPACITY ||
    batch.correctionCount !== batch.corrections?.length ||
    batch.correctionCount !== batch.decisions?.length
  ) {
    throw new RangeError('Skyway input-admission batch is stale or invalid.');
  }
  const current = createSkywayInputAdmissionBatch(window, {
    sessionIncarnation,
    roundEpoch,
    throughTick: batch.throughTick,
    limit: batch.correctionCount,
  });
  if (
    current.batchHash !== batch.batchHash ||
    canonicalizeSkywaySnapshot(current) !== canonicalizeSkywaySnapshot(batch)
  ) {
    throw new RangeError('Skyway input-admission batch is stale or invalid.');
  }

  for (const decision of batch.decisions) {
    const slot = window.slots[slotIndex(window, decision.tick)];
    const retained = slot?.tick === decision.tick
      ? slot.decisions.find(({ participantId }) => (
          participantId === decision.participantId
        ))
      : null;
    if (
      !retained ||
      retained.status !== 'pending' ||
      retained.ownerId !== decision.ownerId ||
      retained.clientSequence !== decision.clientSequence
    ) {
      throw new RangeError('Skyway input-admission decision is stale.');
    }
  }
  for (const decision of batch.decisions) {
    const slot = window.slots[slotIndex(window, decision.tick)];
    slot.decisions.find(({ participantId }) => (
      participantId === decision.participantId
    )).status = 'emitted';
  }
  window.revision += 1;
  return deepFreeze({
    version: SKYWAY_INPUT_ADMISSION_VERSION,
    kind: 'skyway-input-admission-batch-commit',
    sessionIncarnation,
    roundEpoch,
    batchHash: batch.batchHash,
    correctionCount: batch.correctionCount,
    admissionRevision: window.revision,
    acks: window.owners.map(({ ownerId, ackSequence }) => ({
      ownerId,
      ackSequence,
    })),
  });
}

export function snapshotSkywayInputAdmissionWindow(window) {
  assertWindow(window);
  return structuredClone(window);
}

export function restoreSkywayInputAdmissionWindow(window, snapshot, {
  sessionIncarnation,
  roundEpoch,
}) {
  assertWindow(window);
  assertBinding(window, sessionIncarnation, roundEpoch);
  const restored = structuredClone(snapshot);
  assertWindow(restored);
  assertBinding(restored, sessionIncarnation, roundEpoch);
  const staticKeys = [
    'participantIds',
    'ownership',
    'pastTickHorizon',
    'futureTickHorizon',
    'slotCapacity',
  ];
  if (staticKeys.some((key) => (
    canonicalizeSkywaySnapshot(window[key]) !==
    canonicalizeSkywaySnapshot(restored[key])
  ))) {
    throw new TypeError(
      'Skyway input-admission snapshot configuration is incompatible.',
    );
  }
  for (const key of Object.keys(window)) {
    if (!Object.hasOwn(restored, key)) delete window[key];
  }
  Object.assign(window, restored);
  return window;
}

export function resetSkywayInputAdmissionWindow(window, {
  sessionIncarnation,
  roundEpoch,
}) {
  assertWindow(window);
  assertBinding(window, sessionIncarnation, roundEpoch);
  if (roundEpoch >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Skyway input-admission round epoch is exhausted.');
  }
  const previousRoundEpoch = window.roundEpoch;
  window.roundEpoch += 1;
  window.currentTick = 0;
  window.revision = 0;
  window.slots.fill(null);
  for (const owner of window.owners) {
    owner.ackSequence = -1;
    owner.lastAcceptedCommand = null;
  }
  return deepFreeze({
    version: SKYWAY_INPUT_ADMISSION_VERSION,
    kind: 'skyway-input-admission-reset',
    sessionIncarnation,
    previousRoundEpoch,
    roundEpoch: window.roundEpoch,
    currentTick: 0,
    revision: 0,
  });
}
