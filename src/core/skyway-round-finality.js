import {
  SKYWAY_ROUND_VERSION,
} from './skyway-round.js';
import {
  hashSkywaySnapshot,
} from './skyway-snapshot-history.js';

export const SKYWAY_ROUND_FINALITY_TOKEN_VERSION = 1;

const TOKEN_KEYS = Object.freeze([
  'kind',
  'ledgerRevision',
  'roundEpoch',
  'roundSnapshotHash',
  'roundTick',
  'tokenHash',
  'version',
]);

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === keys.length &&
    actual.every((key, index) => key === keys[index]);
}

function participantIdsFromSnapshot(snapshot) {
  return snapshot?.participants?.map((participant) => participant?.id);
}

function sameParticipantOrder(first, second) {
  return Array.isArray(first) &&
    Array.isArray(second) &&
    first.length === second.length &&
    first.every((id, index) => id === second[index]);
}

function tokenPayload({
  roundEpoch,
  roundTick,
  ledgerRevision,
  roundSnapshotHash,
}) {
  return {
    version: SKYWAY_ROUND_FINALITY_TOKEN_VERSION,
    kind: 'skyway-round-finality',
    roundEpoch,
    roundTick,
    ledgerRevision,
    roundSnapshotHash,
  };
}

function validLedgerCoordinates(ledger) {
  return ledger &&
    Number.isSafeInteger(ledger.roundEpoch) &&
    ledger.roundEpoch >= 1 &&
    Number.isSafeInteger(ledger.revision) &&
    ledger.revision >= 0 &&
    Number.isInteger(ledger.committedThroughTick) &&
    ledger.committedThroughTick >= 0 &&
    Number.isInteger(ledger.oldestTick) &&
    Number.isInteger(ledger.latestTick) &&
    ledger.oldestTick >= 1 &&
    ledger.latestTick >= ledger.oldestTick &&
    Array.isArray(ledger.participantIds);
}

export function createSkywayRoundFinalityToken({
  ledger,
  roundSnapshot,
}) {
  const participantIds = participantIdsFromSnapshot(roundSnapshot);
  if (
    !validLedgerCoordinates(ledger) ||
    roundSnapshot?.version !== SKYWAY_ROUND_VERSION ||
    !Number.isSafeInteger(roundSnapshot.tick) ||
    roundSnapshot.tick !== ledger.latestTick ||
    !sameParticipantOrder(participantIds, ledger.participantIds)
  ) {
    throw new TypeError('Skyway finality token requires an aligned Round snapshot and ledger.');
  }
  const payload = tokenPayload({
    roundEpoch: ledger.roundEpoch,
    roundTick: roundSnapshot.tick,
    ledgerRevision: ledger.revision,
    roundSnapshotHash: hashSkywaySnapshot(roundSnapshot),
  });
  return Object.freeze({
    ...payload,
    tokenHash: hashSkywaySnapshot(payload),
  });
}

export function assertSkywayRoundFinalityToken(
  token,
  { ledger, roundSnapshot, expectedRoundTick = ledger?.latestTick },
) {
  if (
    !exactKeys(token, TOKEN_KEYS) ||
    token.version !== SKYWAY_ROUND_FINALITY_TOKEN_VERSION ||
    token.kind !== 'skyway-round-finality' ||
    !Number.isSafeInteger(token.roundEpoch) ||
    !Number.isSafeInteger(token.roundTick) ||
    !Number.isSafeInteger(token.ledgerRevision) ||
    typeof token.roundSnapshotHash !== 'string' ||
    typeof token.tokenHash !== 'string'
  ) {
    throw new TypeError('Invalid Skyway Round finality token.');
  }
  const payload = tokenPayload(token);
  if (hashSkywaySnapshot(payload) !== token.tokenHash) {
    throw new TypeError('Invalid Skyway Round finality token hash.');
  }
  if (token.roundEpoch !== ledger?.roundEpoch) {
    throw new RangeError('Skyway Round finality token epoch is stale.');
  }
  if (token.ledgerRevision !== ledger?.revision) {
    throw new RangeError('Skyway Round finality token revision is stale.');
  }
  if (
    token.roundTick !== expectedRoundTick ||
    roundSnapshot?.version !== SKYWAY_ROUND_VERSION ||
    roundSnapshot.tick !== expectedRoundTick ||
    !sameParticipantOrder(
      participantIdsFromSnapshot(roundSnapshot),
      ledger?.participantIds,
    )
  ) {
    throw new RangeError('Skyway Round finality token tick is not aligned.');
  }
  if (hashSkywaySnapshot(roundSnapshot) !== token.roundSnapshotHash) {
    throw new RangeError('Skyway Round finality token snapshot hash is stale.');
  }
  return token;
}
