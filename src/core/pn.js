// pn.js — Public Network integration boundary.
// Codex owns the real PN infrastructure. These are LOCAL FAKES with the final
// method signatures; game code calls pn.* and never builds its own backend.
export function createPn(ctx) {
  const pending = (what) => ({ ok: false, reason: `PN ${what} integration pending (Codex)` });
  return {
    identity() { return { guest: true, name: ctx.save.profile.name }; },
    async upgradeToPN() { return pending('identity'); },
    async unitsBalance() { return 0; },
    // One-way rail: Units -> Coins (1 : 100). Coins can NEVER go back.
    async buyCoinsWithUnits(units) {
      const coins = Math.floor(units * 100);
      if (coins <= 0) return { ok: false, reason: 'amount too small' };
      ctx.save.addCoins(coins, 'units->coins');
      return { ok: true, coins };
    },
    async marketList() { return pending('marketplace'); },
    async marketBuy() { return pending('marketplace'); },
    async marketSell() { return pending('marketplace'); },
    async chatSend(text) { return { ok: true, filtered: text }; },
  };
}
