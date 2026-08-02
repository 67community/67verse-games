// device-playtest.js - development-only, browser-local physical-device handoff.
//
// The tool captures observations a human explicitly appends. It never uploads,
// persists, or turns automated browser telemetry into a device-test approval.

import { registerSystem } from '../core/registry.js';
import {
  appendDevicePlaytestObservation,
  createDevicePlaytestSession,
  DEVICE_PLAYTEST_STATUSES,
  exportDevicePlaytestSession,
  exportDevicePlaytestSessionJson,
  updateDevicePlaytestCheck,
} from '../core/device-playtest-report.js';

const SYSTEM_ID = 'device-playtest';
const CSS = `
.dph-panel{width:min(980px,96vw);max-height:94vh}
.dph-root{display:grid;grid-template-columns:minmax(280px,.8fr) minmax(380px,1.2fr);gap:14px}
.dph-stack{display:flex;flex-direction:column;gap:12px}
.dph-card{border:1px solid #d8d0c4;border-radius:10px;background:#f5f0e8;padding:13px}
.dph-card h3{margin:0 0 6px;font-size:14px}.dph-card p{margin:0;color:#4e4d4d;font-size:12px;line-height:1.45}
.dph-private{padding:10px 12px;border-radius:10px;background:#e9f1ea;color:#345242;font-size:12px;font-weight:600;line-height:1.4}
.dph-live{margin:10px 0 0;padding:10px;border-radius:11px;background:#272522;color:#f6f0e7;white-space:pre-wrap;font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace}
.dph-note{box-sizing:border-box;width:100%;min-height:82px;margin-top:9px;padding:9px;border:1px solid #cfc5b7;border-radius:10px;background:#fff;font:12px/1.4 system-ui;resize:vertical}
.dph-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:9px}.dph-actions .uv-btn{padding:9px 12px}
.dph-status{min-height:18px;margin-top:7px!important;font-weight:600}
.dph-checks{display:flex;flex-direction:column;gap:8px;margin-top:10px}
.dph-check{display:grid;grid-template-columns:minmax(150px,.8fr) 130px minmax(160px,1fr);align-items:center;gap:8px;padding:8px;border:1px solid #e5e5ea;border-radius:11px;background:#ffffff}
.dph-check label{font-size:11px;font-weight:600}.dph-check select,.dph-check input{box-sizing:border-box;width:100%;min-height:34px;border:1px solid #cfc5b7;border-radius:8px;background:#fff;padding:6px 8px;font:11px system-ui}
.dph-caveat{margin-top:9px!important;padding-left:9px;border-left:3px solid #8b79c9;color:#514766!important}
@media(max-width:780px){.dph-panel{width:100%;max-height:100%}.dph-root{grid-template-columns:1fr}.dph-check{grid-template-columns:1fr 118px}.dph-check input{grid-column:1/-1}}
`;

let cssInjected = false;
let panel = null;
let activeSession = null;

function injectCss() {
  if (cssInjected) return;
  cssInjected = true;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
}

export function allowsDevicePlaytestHarness(
  search = globalThis.location?.search || '',
) {
  return new URLSearchParams(search).get('dev') === '1';
}

function finiteOrNull(value, digits = null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return digits == null ? numeric : Number(numeric.toFixed(digits));
}

function roomState(route) {
  if (route?.id !== 'obstacle') {
    return {
      state: 'not-applicable',
      fallbackActive: false,
      localRoomRequested: new URLSearchParams(location.search).get('online') === '1',
    };
  }
  const label = document.querySelector('.sw-mode[data-h="mode"]')?.textContent?.trim() || '';
  const state =
    label === 'LOCAL DEV ROOM' ? 'local-dev-room' :
      label === 'CHECKING LOCAL ROOM' ? 'connecting-local-dev-room' :
        'echo-trial-local-fallback';
  return {
    state,
    fallbackActive: state === 'echo-trial-local-fallback',
    localRoomRequested: new URLSearchParams(location.search).get('online') === '1',
    renderedLabel: label || null,
  };
}

export function collectDevicePlaytestEvidence(ctx) {
  const runtime = globalThis.window?.__67VERSE_PERF__?.snapshot?.('device-playtest-live') || null;
  const quality = ctx?.quality?.getState?.() || null;
  const route = ctx?.devicePlaytestRuntime?.getRouteState?.() || {
    kind: document.body.classList.contains('in-game') ? 'game' : 'hub',
    id: document.body.classList.contains('in-game') ? 'unknown' : 'hub',
  };
  const memory = performance.memory
    ? {
        usedJSHeapBytes: finiteOrNull(performance.memory.usedJSHeapSize),
        totalJSHeapBytes: finiteOrNull(performance.memory.totalJSHeapSize),
        heapLimitBytes: finiteOrNull(performance.memory.jsHeapSizeLimit),
      }
    : null;
  const connection = navigator.connection;
  const frame = runtime?.metrics?.frameMs || {};
  return {
    route,
    multiplayer: roomState(route),
    performance: runtime
      ? {
          scope: runtime.scope,
          status: runtime.status,
          sampleCount: runtime.sampleCount,
          fpsCurrent: frame.current > 0 ? finiteOrNull(1000 / frame.current, 1) : null,
          fpsAtP95Frame: frame.p95 > 0 ? finiteOrNull(1000 / frame.p95, 1) : null,
          frameP95Ms: finiteOrNull(frame.p95, 2),
          drawCallsCurrent: finiteOrNull(runtime.metrics?.drawCalls?.current),
          drawCallsPeak: finiteOrNull(runtime.metrics?.drawCalls?.peak),
          trianglesCurrent: finiteOrNull(runtime.metrics?.triangles?.current),
          trianglesPeak: finiteOrNull(runtime.metrics?.triangles?.peak),
          breaches: [...(runtime.breaches || [])],
        }
      : null,
    display: {
      viewportCssPixels: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      devicePixelRatio: finiteOrNull(window.devicePixelRatio || 1, 2),
      rendererPixelRatio: finiteOrNull(ctx?.renderer?.getPixelRatio?.(), 2),
    },
    input: {
      touchDevice: Boolean(ctx?.input?.isTouchDevice),
      maxTouchPoints: finiteOrNull(navigator.maxTouchPoints || 0),
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      hover: matchMedia('(hover: hover)').matches,
    },
    quality: quality ? {
      preference: quality.preference,
      tier: quality.tier,
      pixelRatio: finiteOrNull(quality.pixelRatio, 2),
      shadows: quality.shadows,
      visualDensity: quality.visualDensity,
    } : null,
    accessibility: {
      reducedMotionRequested: matchMedia('(prefers-reduced-motion: reduce)').matches,
    },
    memory,
    network: connection ? {
      effectiveType: connection.effectiveType || null,
      downlinkMbps: finiteOrNull(connection.downlink, 2),
      rttMs: finiteOrNull(connection.rtt),
      saveData: Boolean(connection.saveData),
    } : null,
    document: {
      visibility: document.visibilityState,
      focused: document.hasFocus(),
    },
    userAgent: navigator.userAgent,
    capturedAt: Date.now(),
  };
}

function formatLiveEvidence(evidence) {
  const perf = evidence.performance;
  const quality = evidence.quality;
  const route = evidence.route;
  const memory = evidence.memory;
  return [
    `route      ${route.kind}:${route.id}${route.activityId ? `/${route.activityId}` : ''}`,
    `room       ${evidence.multiplayer.state}`,
    perf
      ? `frame      ${perf.fpsCurrent ?? '—'} fps · p95 ${perf.frameP95Ms ?? '—'} ms · ${perf.sampleCount} samples`
      : 'frame      diagnostics warming or unavailable',
    perf
      ? `geometry   ${perf.drawCallsCurrent ?? '—'} draws · ${perf.trianglesCurrent ?? '—'} triangles`
      : 'geometry   diagnostics warming or unavailable',
    `display    ${evidence.display.viewportCssPixels.width}×${evidence.display.viewportCssPixels.height} CSS · DPR ${evidence.display.devicePixelRatio} · renderer ${evidence.display.rendererPixelRatio}`,
    `input      ${evidence.input.touchDevice ? 'touch' : 'non-touch'} · ${evidence.input.coarsePointer ? 'coarse' : 'fine'} pointer · ${evidence.input.maxTouchPoints} touch points`,
    `quality    ${quality ? `${quality.tier}/${quality.preference} · ${quality.pixelRatio}x · shadows ${quality.shadows ? 'on' : 'off'}` : 'unavailable'}`,
    `memory     ${memory ? `${Math.round(memory.usedJSHeapBytes / 1_000_000)} / ${Math.round(memory.heapLimitBytes / 1_000_000)} MB JS heap` : 'not supported by this browser'}`,
  ].join('\n');
}

registerSystem(SYSTEM_ID, {
  open(ctx) {
    if (!allowsDevicePlaytestHarness()) {
      ctx.ui.toast('Device Playtest is available only with ?dev=1.');
      return;
    }
    if (panel) return;
    injectCss();
    activeSession ||= createDevicePlaytestSession();
    const downloadUrls = new Set();
    let liveTimer = 0;
    let liveEvidence = collectDevicePlaytestEvidence(ctx);

    panel = ctx.ui.panel({
      title: 'Physical-device playtest',
      closeLabel: 'Close physical-device playtest',
      onClose: () => {
        clearInterval(liveTimer);
        for (const url of downloadUrls) URL.revokeObjectURL(url);
        downloadUrls.clear();
        delete window.__67VERSE_DEVICE_PLAYTEST__;
        panel = null;
      },
    });
    panel.el.classList.add('dph-panel');

    const root = document.createElement('div');
    root.className = 'dph-root';
    const left = document.createElement('div');
    left.className = 'dph-stack';
    const right = document.createElement('div');
    right.className = 'dph-stack';

    const privateNotice = document.createElement('div');
    privateNotice.className = 'dph-private';
    privateNotice.textContent = 'LOCAL DEV TOOL — observations stay in memory until you download JSON. Nothing is uploaded or saved by default.';
    left.appendChild(privateNotice);

    const liveCard = document.createElement('section');
    liveCard.className = 'dph-card';
    const liveTitle = document.createElement('h3');
    liveTitle.textContent = 'Live device facts';
    const liveHelp = document.createElement('p');
    liveHelp.textContent = 'Renderer telemetry is observational. It is not a physical-device pass and cannot approve a release.';
    const live = document.createElement('pre');
    live.className = 'dph-live';
    live.setAttribute('aria-live', 'polite');
    live.textContent = formatLiveEvidence(liveEvidence);
    liveCard.append(liveTitle, liveHelp, live);
    left.appendChild(liveCard);

    const observationCard = document.createElement('section');
    observationCard.className = 'dph-card';
    const observationTitle = document.createElement('h3');
    observationTitle.textContent = 'Append an observation';
    const observationHelp = document.createElement('p');
    observationHelp.textContent = 'Describe what you actually saw on the device, then append the current route and telemetry snapshot.';
    const note = document.createElement('textarea');
    note.className = 'dph-note';
    note.maxLength = 1000;
    note.placeholder = 'Human observation, device model, OS/browser, issue or result…';
    note.setAttribute('aria-label', 'Playtest observation');
    const observationActions = document.createElement('div');
    observationActions.className = 'dph-actions';
    const append = ctx.ui.button('Append current snapshot', () => {
      liveEvidence = collectDevicePlaytestEvidence(ctx);
      activeSession = appendDevicePlaytestObservation(activeSession, {
        note: note.value,
        evidence: liveEvidence,
      });
      note.value = '';
      syncSessionUi('Snapshot appended in memory.');
    }, { primary: true });
    observationActions.appendChild(append);
    const status = document.createElement('p');
    status.className = 'dph-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    observationCard.append(observationTitle, observationHelp, note, observationActions, status);
    left.appendChild(observationCard);

    const reportCard = document.createElement('section');
    reportCard.className = 'dph-card';
    const reportTitle = document.createElement('h3');
    reportTitle.textContent = 'Local session report';
    const reportHelp = document.createElement('p');
    reportHelp.textContent = 'Download the structured checklist and appended evidence for a human handoff.';
    const reportActions = document.createElement('div');
    reportActions.className = 'dph-actions';
    const download = ctx.ui.button('Download session JSON', () => {
      const json = exportDevicePlaytestSessionJson(activeSession);
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      downloadUrls.add(url);
      const link = document.createElement('a');
      link.download = `${activeSession.sessionId}.json`;
      link.href = url;
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        downloadUrls.delete(url);
      }, 0);
      syncSessionUi('Local JSON download requested.');
    });
    const restart = ctx.ui.button('Start new in-memory session', () => {
      activeSession = createDevicePlaytestSession();
      renderChecks();
      syncSessionUi('Started a new in-memory session.');
    });
    reportActions.append(download, restart);
    const caveat = document.createElement('p');
    caveat.className = 'dph-caveat';
    caveat.textContent = activeSession.caveat;
    reportCard.append(reportTitle, reportHelp, reportActions, caveat);
    left.appendChild(reportCard);

    const checklistCard = document.createElement('section');
    checklistCard.className = 'dph-card';
    const checklistTitle = document.createElement('h3');
    checklistTitle.textContent = 'Representative device checklist';
    const checklistHelp = document.createElement('p');
    checklistHelp.textContent = 'Mark only what a human actually exercised. “Pass” is recorded evidence, never automatic release approval.';
    const checks = document.createElement('div');
    checks.className = 'dph-checks';
    checklistCard.append(checklistTitle, checklistHelp, checks);
    right.appendChild(checklistCard);

    function syncSessionUi(message = '') {
      const report = exportDevicePlaytestSession(activeSession);
      status.textContent = message || `${report.observations.length} snapshots in memory.`;
      panel.el.dataset.observationCount = String(report.observations.length);
      panel.el.dataset.report = JSON.stringify(report);
    }

    function renderChecks() {
      checks.replaceChildren();
      for (const item of activeSession.checklist) {
        const row = document.createElement('div');
        row.className = 'dph-check';
        row.dataset.check = item.id;
        const label = document.createElement('label');
        label.textContent = item.label;
        const select = document.createElement('select');
        select.setAttribute('aria-label', `${item.label} status`);
        for (const value of DEVICE_PLAYTEST_STATUSES) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value.replace('-', ' ');
          select.appendChild(option);
        }
        select.value = item.status;
        const itemNote = document.createElement('input');
        itemNote.type = 'text';
        itemNote.maxLength = 600;
        itemNote.value = item.note;
        itemNote.placeholder = 'Device evidence or blocker';
        itemNote.setAttribute('aria-label', `${item.label} note`);
        const commit = () => {
          activeSession = updateDevicePlaytestCheck(activeSession, item.id, {
            status: select.value,
            note: itemNote.value,
          });
          syncSessionUi(`${item.label}: ${select.value.replace('-', ' ')}.`);
        };
        select.addEventListener('change', commit);
        itemNote.addEventListener('change', commit);
        row.append(label, select, itemNote);
        checks.appendChild(row);
      }
    }

    root.append(left, right);
    panel.body.appendChild(root);
    renderChecks();
    syncSessionUi();
    liveTimer = window.setInterval(() => {
      liveEvidence = collectDevicePlaytestEvidence(ctx);
      live.textContent = formatLiveEvidence(liveEvidence);
    }, 500);
    window.__67VERSE_DEVICE_PLAYTEST__ = Object.freeze({
      evidence: () => structuredClone(liveEvidence),
      report: () => exportDevicePlaytestSession(activeSession),
    });
  },
});
