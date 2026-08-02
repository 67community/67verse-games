// Pure quality contract for the local Tag mode. Rendering and movement remain
// in the game module; these functions keep pacing, catch-up, and ranking
// deterministic and directly testable.

export const TAG_RULES = Object.freeze({
  roundSeconds: 90,
  safePointPerSecond: 1,
  pointsPerTag: 8,
  baseTagRadius: 1.2,
  baseTransferLockSeconds: 2,
  recoveryImmunitySeconds: 2.25,
  finalChaseRatio: 0.25,
  finalRadiusBonus: 0.15,
  finalTransferLockSeconds: 1.25,
  assistStartsAfterSeconds: 7,
  assistRampSeconds: 7,
  assistRadiusMax: 0.35,
});

function nonNegative(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function tagPacingState(
  timeLeft,
  roundDuration = TAG_RULES.roundSeconds,
  chaserHoldSeconds = 0,
) {
  const duration = Math.max(1, nonNegative(roundDuration));
  const remaining = Math.min(duration, nonNegative(timeLeft));
  const finalChase = remaining <= duration * TAG_RULES.finalChaseRatio;
  const assistProgress = Math.min(
    1,
    Math.max(
      0,
      (nonNegative(chaserHoldSeconds) - TAG_RULES.assistStartsAfterSeconds) /
        TAG_RULES.assistRampSeconds,
    ),
  );
  const assistRadius = assistProgress * TAG_RULES.assistRadiusMax;
  return Object.freeze({
    finalChase,
    assistActive: assistRadius > 0,
    assistProgress,
    assistRadius,
    tagRadius:
      TAG_RULES.baseTagRadius +
      (finalChase ? TAG_RULES.finalRadiusBonus : 0) +
      assistRadius,
    transferLockSeconds: finalChase
      ? TAG_RULES.finalTransferLockSeconds
      : TAG_RULES.baseTransferLockSeconds,
  });
}

export function tagParticipantScore(participant = {}) {
  return Math.round(
    nonNegative(participant.safeTime) * TAG_RULES.safePointPerSecond +
    nonNegative(participant.tagsMade) * TAG_RULES.pointsPerTag,
  );
}

export function rankTagParticipants(participants = []) {
  const rows = participants.map((participant, index) => ({
    index,
    score: tagParticipantScore(participant),
    safeTime: nonNegative(participant.safeTime),
    tagsMade: nonNegative(participant.tagsMade),
  }));
  rows.sort((a, b) => (
    b.score - a.score ||
    b.tagsMade - a.tagsMade ||
    b.safeTime - a.safeTime ||
    a.index - b.index
  ));
  return rows.map((row, rank) => Object.freeze({ ...row, placement: rank + 1 }));
}

export function tagResultCue({ placement = 1, longestItSeconds = 0, tagsMade = 0 } = {}) {
  if (longestItSeconds >= 12) {
    return 'Next run: cut across the center and use chase assist before runners reach the fence.';
  }
  if (tagsMade === 0) {
    return 'Next run: if you become IT, touch one runner to pass the role and get back to scoring.';
  }
  if (placement === 1) {
    return 'Clean round. Keep changing direction near the blocks to protect the lead.';
  }
  return 'Good transfers. Shorter time as IT is the clearest path up the ranking.';
}
