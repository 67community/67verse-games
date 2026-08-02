// save.js — localStorage persistence, namespaced "67v." All values JSON.
import { createBus } from './bus.js';

const PREFIX = '67v.';
const PROFILE_NAME_MAX = 32;

function validProfileName(value) {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.trim().length <= PROFILE_NAME_MAX
    && !/[\u0000-\u001f\u007f]/.test(value);
}

export function createLocalGuestName(random = Math.random) {
  const candidate = typeof random === 'function' ? random() : 0;
  const sample = Number.isFinite(candidate) ? candidate : 0;
  const suffix = Math.floor(1000 + Math.max(0, Math.min(0.999999, sample)) * 9000);
  return `Guest${suffix}`;
}

export function recoverLocalProfile(raw, fallbackName = 'Guest1000') {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  const fallback = validProfileName(fallbackName) ? fallbackName.trim() : 'Guest1000';
  const profile = Object.freeze({
    name: validProfileName(record?.name) ? record.name.trim() : fallback,
    guest: typeof record?.guest === 'boolean' ? record.guest : true,
    pn: record?.pn ?? null,
  });
  const recovered = !record
    || record.name !== profile.name
    || record.guest !== profile.guest
    || (record.pn ?? null) !== profile.pn
    || Object.keys(record).some((key) => !['name', 'guest', 'pn'].includes(key));
  return Object.freeze({ profile, recovered });
}

export function createSave(
  bus,
  storage = globalThis.localStorage,
  warn = (...args) => console.warn(...args),
  random = Math.random,
) {
  let localProfileState = null;

  function get(key, fallback) {
    try {
      const raw = storage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  }
  function set(key, value) {
    try {
      const serialized = JSON.stringify(value);
      if (typeof serialized !== 'string') {
        warn('[save] set failed', key, 'value is not JSON-serializable');
        return false;
      }
      const storageKey = PREFIX + key;
      storage.setItem(storageKey, serialized);
      if (storage.getItem(storageKey) !== serialized) {
        warn('[save] set verification failed', key);
        return false;
      }
      return true;
    } catch (e) {
      warn('[save] set failed', key, e);
      return false;
    }
  }
  function commitCoins(n, why = '', persist = () => true) {
    if (!Number.isFinite(n) || typeof persist !== 'function') return null;
    const currentValue = get('coins', 0);
    const current = Number.isFinite(currentValue) ? currentValue : 0;
    const total = Math.max(0, current + n);
    if (!set('coins', total)) return null;

    let persisted = false;
    try {
      persisted = persist() !== false;
    } catch (error) {
      warn('[save] coin commit failed', why, error);
    }
    if (!persisted) {
      if (!set('coins', current)) {
        warn('[save] coin rollback failed', why);
      }
      return null;
    }

    bus.emit('coins-earned', { amount: n, why, total });
    return total;
  }
  function ensureProfile() {
    if (localProfileState) return localProfileState;
    const recovery = recoverLocalProfile(get('profile', null), createLocalGuestName(random));
    const persisted = recovery.recovered ? set('profile', recovery.profile) : true;
    localProfileState = Object.freeze({
      profile: recovery.profile,
      persisted,
    });
    return localProfileState;
  }
  function retryProfile() {
    const current = ensureProfile();
    if (current.persisted) return true;
    if (!set('profile', current.profile)) return false;
    localProfileState = Object.freeze({
      profile: current.profile,
      persisted: true,
    });
    return true;
  }
  function setProfile(profile) {
    if (!validProfileName(profile?.name)) return false;
    const canonical = recoverLocalProfile(profile, profile.name).profile;
    if (!set('profile', canonical)) return false;
    localProfileState = Object.freeze({ profile: canonical, persisted: true });
    return true;
  }
  const save = {
    get, set, commitCoins, ensureProfile, retryProfile,
    get coins() { return get('coins', 0); },
    addCoins(n, why = '') {
      return commitCoins(n, why);
    },
    get profile() { return ensureProfile().profile; },
    get profileState() { return ensureProfile(); },
    setProfile,
    get settings() {
      return get('settings', {
        volume: 0.7, quality: 'auto', chatEnabled: true,
        parentalGate: false, spendCap: 0, skinTone: '#f2c9a0',
      });
    },
    setSettings(s) {
      const saved = set('settings', s);
      if (saved) bus.emit('settings-changed', s);
      return saved;
    },
  };
  ensureProfile();
  return save;
}
