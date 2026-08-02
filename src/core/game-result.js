// Canonical progression-facing view of a completed local game result.
// This validates only the device-local event contract; it is not an online
// receipt, authoritative match record, or backend idempotency mechanism.
export function commitLocalGameReward(save, result, why = '') {
  if (!result || typeof result !== 'object') return null;
  const attemptedCoins = Number.isFinite(result.coins)
    ? Math.max(0, result.coins)
    : 0;
  const total = save?.addCoins?.(attemptedCoins, why);
  const rewardCommitted = Number.isFinite(total);
  return {
    ...result,
    coins: rewardCommitted ? attemptedCoins : 0,
    rewardCommitted,
    attemptedCoins,
  };
}

export function localGameRewardStat(result) {
  return result?.rewardCommitted === false
    ? 'Not saved'
    : `+${Math.max(0, Number(result?.coins) || 0)} Coins`;
}

export function localGameResultFacts(result) {
  if (!result || typeof result !== 'object') return null;
  if (result.rewardCommitted === false) return null;
  const rawGameId = result.gameId || result.game;
  if (typeof rawGameId !== 'string' || !rawGameId.trim()) return null;

  const score = Number.isFinite(result.score)
    ? Math.max(0, result.score)
    : 0;
  const placement = Number.isInteger(result.placement) && result.placement > 0
    ? result.placement
    : null;

  return {
    gameId: rawGameId.trim(),
    score,
    placement,
  };
}

export function localGameResultProgress(result) {
  const facts = localGameResultFacts(result);
  return {
    play: facts ? 1 : 0,
    score: facts?.score || 0,
    firstPlace: facts?.placement === 1 ? 1 : 0,
  };
}
