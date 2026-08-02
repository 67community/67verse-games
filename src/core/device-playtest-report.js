// Structured, browser-local evidence for a human device playtest.
//
// This module deliberately never persists or uploads a session. The dev-only
// presentation layer owns the in-memory value and may offer a JSON download.

export const DEVICE_PLAYTEST_CHECKS = Object.freeze([
  Object.freeze({ id: 'fresh-entry', label: 'Fresh entry and first input' }),
  Object.freeze({ id: 'hub', label: 'Skypark hub traversal' }),
  Object.freeze({ id: 'skyway', label: 'Skyway Sprint' }),
  Object.freeze({ id: 'tag', label: 'Tag' }),
  Object.freeze({ id: 'balloon', label: 'Balloon Battle' }),
  Object.freeze({ id: 'show67', label: '67 Show round flow' }),
  Object.freeze({ id: 'creator-playback', label: 'Creator level playback' }),
  Object.freeze({ id: 'room-fallback', label: 'Remote/local-room fallback' }),
  Object.freeze({ id: 'screen-reader', label: 'VoiceOver or TalkBack' }),
  Object.freeze({ id: 'reduced-motion', label: 'Reduced motion' }),
  Object.freeze({ id: 'battery-thermal-network', label: 'Battery, thermal, and network behavior' }),
]);

export const DEVICE_PLAYTEST_STATUSES = Object.freeze([
  'untested',
  'pass',
  'fail',
  'blocked',
  'not-applicable',
]);

function boundedText(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function safeTime(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : Date.now();
}

function checklistSummary(checklist) {
  return checklist.reduce((summary, item) => {
    summary[item.status] += 1;
    return summary;
  }, {
    untested: 0,
    pass: 0,
    fail: 0,
    blocked: 0,
    'not-applicable': 0,
  });
}

export function createDevicePlaytestSession({
  now = Date.now(),
  sessionId = `device-${safeTime(now).toString(36)}`,
} = {}) {
  const startedAt = safeTime(now);
  return {
    kind: '67verse-local-device-playtest-session',
    schemaVersion: 1,
    sessionId: boundedText(sessionId, 80),
    startedAt,
    updatedAt: startedAt,
    physicalDeviceTestCompleted: false,
    automatedReleaseApproval: false,
    caveat: 'Human-entered local evidence only. This report does not prove release readiness or a completed physical-device test.',
    observations: [],
    checklist: DEVICE_PLAYTEST_CHECKS.map(({ id, label }) => ({
      id,
      label,
      status: 'untested',
      note: '',
      updatedAt: null,
    })),
    summary: checklistSummary(DEVICE_PLAYTEST_CHECKS.map(() => ({ status: 'untested' }))),
  };
}

export function appendDevicePlaytestObservation(session, {
  now = Date.now(),
  note = '',
  evidence = {},
} = {}) {
  const capturedAt = safeTime(now);
  const next = structuredClone(session);
  next.observations.push({
    sequence: next.observations.length + 1,
    capturedAt,
    note: boundedText(note, 1000),
    evidence: structuredClone(evidence),
  });
  if (next.observations.length > 100) next.observations.shift();
  next.observations.forEach((entry, index) => { entry.sequence = index + 1; });
  next.updatedAt = capturedAt;
  next.physicalDeviceTestCompleted = false;
  next.automatedReleaseApproval = false;
  return next;
}

export function updateDevicePlaytestCheck(session, id, {
  now = Date.now(),
  status = 'untested',
  note = '',
} = {}) {
  if (!DEVICE_PLAYTEST_STATUSES.includes(status)) {
    throw new TypeError(`Unsupported device playtest status: ${status}`);
  }
  const next = structuredClone(session);
  const check = next.checklist.find((entry) => entry.id === id);
  if (!check) throw new TypeError(`Unknown device playtest check: ${id}`);
  check.status = status;
  check.note = boundedText(note, 600);
  check.updatedAt = safeTime(now);
  next.updatedAt = check.updatedAt;
  next.summary = checklistSummary(next.checklist);
  next.physicalDeviceTestCompleted = false;
  next.automatedReleaseApproval = false;
  return next;
}

export function exportDevicePlaytestSession(session) {
  const report = structuredClone(session);
  report.summary = checklistSummary(report.checklist);
  report.physicalDeviceTestCompleted = false;
  report.automatedReleaseApproval = false;
  return report;
}

export function exportDevicePlaytestSessionJson(session) {
  return JSON.stringify(exportDevicePlaytestSession(session), null, 2);
}
