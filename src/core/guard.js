const CONTROL_KEYS = new Set(['mx', 'my', 'jump', 'grab', 'seq']);

export function sanitizePlayerName(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 18) || 'Guest';
}

export function normalizeControlMessage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.keys(value).some((key) => !CONTROL_KEYS.has(key))) return null;
  const mx = Number(value.mx);
  const my = Number(value.my);
  const seq = Number(value.seq);
  if (![mx, my, seq].every(Number.isFinite)) return null;

  let x = Math.max(-1, Math.min(1, mx));
  let y = Math.max(-1, Math.min(1, my));
  const length = Math.hypot(x, y);
  if (length > 1) {
    x /= length;
    y /= length;
  }

  return {
    mx: x,
    my: y,
    jump: value.jump === true,
    grab: value.grab === true,
    seq: Math.max(0, Math.min(1_000_000_000, Math.floor(seq))),
  };
}

export function createRateLimiter({ rate = 30, burst = 12, now = () => performance.now() } = {}) {
  let tokens = burst;
  let last = now();
  return {
    take(cost = 1) {
      const current = now();
      tokens = Math.min(burst, tokens + Math.max(0, current - last) * rate / 1000);
      last = current;
      if (tokens < cost) return false;
      tokens -= cost;
      return true;
    },
  };
}
