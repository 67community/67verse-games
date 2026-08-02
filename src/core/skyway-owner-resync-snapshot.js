import {
  assertSkywayAdmissionAckRestore,
} from './skyway-admission-ack-finality.js';
import {
  validateSkywayOwnerResyncDirective,
} from './skyway-reconnect-planner.js';
import {
  hashSkywaySnapshot,
} from './skyway-snapshot-history.js';

export const SKYWAY_OWNER_RESYNC_SNAPSHOT_VERSION = 1;
export const SKYWAY_OWNER_RESYNC_PUBLIC_ROUND_MAX_BYTES = 24 * 1_024;
export const SKYWAY_OWNER_RESYNC_SNAPSHOT_MAX_BYTES = 32 * 1_024;

const encoder = new TextEncoder();

function boundedId(value, maxLength = 64) {
  return typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= maxLength &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value);
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

function sameOrder(first, second) {
  return Array.isArray(first) &&
    Array.isArray(second) &&
    first.length === second.length &&
    first.every((value, index) => value === second[index]);
}

function roundBundlePayload(bundle) {
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

function projectPlayer(player) {
  return {
    pos: {
      x: player?.pos?.x,
      y: player?.pos?.y,
      z: player?.pos?.z,
    },
    vel: {
      x: player?.vel?.x,
      y: player?.vel?.y,
      z: player?.vel?.z,
    },
    yaw: player?.yaw,
    grounded: player?.grounded,
    grabCooldown: player?.grabCooldown,
    grabEvent: player?.grabEvent,
    jumpEvent: player?.jumpEvent,
    coyoteTime: player?.coyoteTime,
    jumpBufferTime: player?.jumpBufferTime,
    jumpHeldLast: player?.jumpHeldLast,
  };
}

function projectParticipant(participant) {
  return {
    id: participant?.id,
    isPlayer: participant?.isPlayer,
    race: {
      cp: participant?.race?.cp,
      finished: participant?.race?.finished,
      place: participant?.race?.place,
      finishTime: participant?.race?.finishTime,
      knockCd: participant?.race?.knockCd,
      stun: participant?.race?.stun,
      falls: participant?.race?.falls,
      usedShortcut: participant?.race?.usedShortcut,
    },
    simulation: {
      version: participant?.simulation?.version,
      tick: participant?.simulation?.tick,
      time: participant?.simulation?.time,
      player: projectPlayer(participant?.simulation?.player),
    },
  };
}

function projectCourse(course) {
  return {
    version: course?.version,
    tick: course?.tick,
    time: course?.time,
    raceTime: course?.raceTime,
    phase: course?.phase,
    finishCount: course?.finishCount,
    platforms: course?.platforms?.map((platform) => ({
      id: platform?.id,
      active: platform?.active,
      timeLeft: platform?.timeLeft,
      position: {
        x: platform?.position?.x,
        y: platform?.position?.y,
        z: platform?.position?.z,
      },
      minX: platform?.minX,
      maxX: platform?.maxX,
      minZ: platform?.minZ,
      maxZ: platform?.maxZ,
      top: platform?.top,
    })),
    sweepers: course?.sweepers?.map((sweeper) => ({
      id: sweeper?.id,
      angle: sweeper?.angle,
    })),
    walls: course?.walls?.map((wall) => ({
      id: wall?.id,
      cx: wall?.cx,
      vx: wall?.vx,
    })),
  };
}

function projectPublicRound(roundSnapshot) {
  const result = {
    version: roundSnapshot?.version,
    tick: roundSnapshot?.tick,
    countdown: {
      durationTicks: roundSnapshot?.countdown?.durationTicks,
      elapsedTicks: roundSnapshot?.countdown?.elapsedTicks,
    },
    course: projectCourse(roundSnapshot?.course),
    participants: roundSnapshot?.participants?.map(projectParticipant),
  };
  hashSkywaySnapshot(result);
  if (byteLength(result) > SKYWAY_OWNER_RESYNC_PUBLIC_ROUND_MAX_BYTES) {
    throw new RangeError('Skyway public Round resync state exceeds its bound.');
  }
  return result;
}

function currentOwnerBinding(authorityCheckpoint, ownerId) {
  const admission = authorityCheckpoint.components.admissionSnapshot;
  const owner = admission.owners.find((entry) => entry.ownerId === ownerId);
  const participantIds = admission.ownership
    .filter((entry) => entry.ownerId === ownerId)
    .map((entry) => entry.participantId);
  if (!owner || participantIds.length < 1) return null;
  return {
    owner,
    participantIds,
    lastAcceptedCommandHash: owner.ackSequence === -1
      ? null
      : hashSkywaySnapshot(owner.lastAcceptedCommand),
  };
}

function committedOwnerBinding(admissionAckWatermark, ownerId) {
  return admissionAckWatermark.acknowledgements.find((entry) => (
    entry.ownerId === ownerId
  )) ?? null;
}

function assertRoundCheckpointBinding(authorityCheckpoint) {
  const bundle =
    authorityCheckpoint?.components?.roundCheckpointBundle;
  const roundSnapshot = bundle?.components?.roundSnapshot;
  const participantIds = roundSnapshot?.participants?.map(({ id }) => id);
  if (
    bundle?.bundleHash !== authorityCheckpoint.roundCheckpointHash ||
    bundle?.sessionIncarnation !==
      authorityCheckpoint.sessionIncarnation ||
    bundle?.roundEpoch !== authorityCheckpoint.roundEpoch ||
    bundle?.tick !== authorityCheckpoint.tick ||
    roundSnapshot?.tick !== authorityCheckpoint.tick ||
    !sameOrder(bundle?.participantIds, authorityCheckpoint.participantIds) ||
    !sameOrder(participantIds, authorityCheckpoint.participantIds) ||
    bundle?.roundSnapshotHash !== hashSkywaySnapshot(roundSnapshot) ||
    bundle?.bundleHash !== hashSkywaySnapshot(roundBundlePayload(bundle))
  ) {
    throw new TypeError(
      'Skyway owner resync snapshot Round checkpoint is invalid.',
    );
  }
  return roundSnapshot;
}

function assertDirectiveBinding({
  directive,
  authorityCheckpoint,
  admissionAckWatermark,
  owner,
  authenticatedOwnerId,
}) {
  if (
    directive.action !== 'full-resync' ||
    directive.requiresAuthoritySnapshot !== true
  ) {
    throw new RangeError(
      'Skyway owner resync snapshot requires a full-resync directive.',
    );
  }
  if (
    directive.sessionIncarnationHash !== hashSkywaySnapshot(
      authorityCheckpoint.sessionIncarnation,
    ) ||
    directive.roundEpoch !== authorityCheckpoint.roundEpoch ||
    directive.tick !== authorityCheckpoint.tick ||
    directive.rosterHash !== authorityCheckpoint.rosterHash ||
    directive.authorityCheckpointHash !==
      authorityCheckpoint.authorityCheckpointHash ||
    directive.admissionAckWatermarkHash !==
      admissionAckWatermark.watermarkHash ||
    directive.serverAckSequence !== owner.owner.ackSequence ||
    directive.lastAcceptedCommandHash !==
      owner.lastAcceptedCommandHash ||
    !sameOrder(directive.ownedParticipantIds, owner.participantIds)
  ) {
    throw new RangeError(
      'Skyway owner resync snapshot directive is stale.',
    );
  }
  if (directive.ownerId !== authenticatedOwnerId) {
    throw new RangeError('Skyway resync snapshot owner is not authorized.');
  }
}

export function projectSkywayOwnerFullResyncSnapshot({
  authenticatedOwnerId,
  directive,
  authorityCheckpoint,
  admissionAckWatermark,
}) {
  validateSkywayOwnerResyncDirective(directive);
  if (
    !boundedId(authenticatedOwnerId) ||
    authenticatedOwnerId !== directive.ownerId
  ) {
    throw new RangeError('Skyway resync snapshot owner is not authorized.');
  }
  assertSkywayAdmissionAckRestore(admissionAckWatermark, {
    authorityCheckpoint,
  });
  const owner = currentOwnerBinding(
    authorityCheckpoint,
    authenticatedOwnerId,
  );
  const committed = committedOwnerBinding(
    admissionAckWatermark,
    authenticatedOwnerId,
  );
  if (!owner || !committed) {
    throw new RangeError('Skyway resync snapshot owner is not authorized.');
  }
  assertDirectiveBinding({
    directive,
    authorityCheckpoint,
    admissionAckWatermark,
    owner,
    authenticatedOwnerId,
  });

  const publicRound = projectPublicRound(
    assertRoundCheckpointBinding(authorityCheckpoint),
  );
  const admission = authorityCheckpoint.components.admissionSnapshot;
  const payload = {
    version: SKYWAY_OWNER_RESYNC_SNAPSHOT_VERSION,
    kind: 'skyway-owner-full-resync-snapshot',
    ownerId: authenticatedOwnerId,
    sessionIncarnationHash: directive.sessionIncarnationHash,
    roundEpoch: authorityCheckpoint.roundEpoch,
    tick: authorityCheckpoint.tick,
    rosterHash: authorityCheckpoint.rosterHash,
    directiveHash: directive.directiveHash,
    authorityCheckpointHash:
      authorityCheckpoint.authorityCheckpointHash,
    admissionAckWatermarkHash:
      admissionAckWatermark.watermarkHash,
    publicRoundHash: hashSkywaySnapshot(publicRound),
    publicRound,
    admission: {
      admissionSnapshotHash:
        authorityCheckpoint.admissionSnapshotHash,
      revision: admission.revision,
      currentTick: admission.currentTick,
      pastTickHorizon: admission.pastTickHorizon,
      futureTickHorizon: admission.futureTickHorizon,
      owner: {
        ownerId: authenticatedOwnerId,
        participantIds: [...owner.participantIds],
        admittedAckSequence: owner.owner.ackSequence,
        admittedLastAcceptedCommandHash:
          owner.lastAcceptedCommandHash,
        committedAckSequence: committed.ackSequence,
        committedLastAcceptedCommandHash:
          committed.lastAcceptedCommandHash,
      },
    },
  };
  const result = deepFreeze({
    ...payload,
    snapshotHash: hashSkywaySnapshot(payload),
  });
  if (byteLength(result) > SKYWAY_OWNER_RESYNC_SNAPSHOT_MAX_BYTES) {
    throw new RangeError('Skyway owner resync snapshot exceeds its bound.');
  }
  return result;
}
