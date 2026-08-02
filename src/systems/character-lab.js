// character-lab.js - development-only, browser-local GLB acceptance surface.
//
// Candidate bytes never leave the browser and are never added to the runtime
// roster. Automated inspection delegates to the production-character adapter;
// this system only presents the result and a neutral comparison preview.

import * as THREE from 'three';
import { registerSystem } from '../core/registry.js';
import {
  loadProductionCharacterCandidateBytes,
  validateProductionCharacterManifest,
} from '../core/production-character.js';
import {
  compactCharacterAcceptanceReport,
  createCharacterAcceptanceReport,
  createCharacterManifestTemplate,
} from '../core/character-acceptance-report.js';

const LAB_ID = 'character-lab';
const MAX_LOCAL_FILE_BYTES = 64_000_000;
const VIEW_DEFINITIONS = Object.freeze([
  { label: 'FRONT', direction: new THREE.Vector3(0, 0, 1) },
  { label: 'SIDE', direction: new THREE.Vector3(1, 0, 0) },
  { label: 'BACK', direction: new THREE.Vector3(0, 0, -1) },
  { label: '3/4', direction: new THREE.Vector3(1, 0, 1).normalize() },
]);

const CSS = `
.cal-panel{width:min(1120px,96vw);max-height:94vh}
.cal-panel .uv-body{padding-top:4px}
.cal-root{display:grid;grid-template-columns:minmax(250px,.72fr) minmax(420px,1.28fr);gap:16px}
.cal-card{border:1px solid #d8d0c4;border-radius:10px;background:#f5f5f7;padding:14px}
.cal-card h3{font-size:14px;margin:0 0 7px}.cal-card p{margin:0;color:#4e4d4d;line-height:1.45}
.cal-private{display:flex;gap:9px;align-items:flex-start;margin-bottom:12px;padding:10px 12px;border-radius:10px;background:#e9f1ea;color:#345242;font-size:12px;font-weight:500}
.cal-stack{display:flex;flex-direction:column;gap:12px}
.cal-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:116px;padding:14px;border:2px dashed #b8ad9e;border-radius:14px;background:#ffffff;text-align:center;cursor:pointer}
.cal-drop.drag{border-color:#d49a27;background:#fff8e5}.cal-drop strong{font-size:15px}.cal-drop small{margin-top:5px;color:#9a9aa2}
.cal-file{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.cal-file-fact{font-size:12px;font-weight:600;color:#060c21;overflow-wrap:anywhere}
.cal-label{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:600}
.cal-manifest{width:100%;min-height:260px;resize:vertical;border:1px solid #cfc5b7;border-radius:10px;background:#fff;color:#060c21;padding:10px;font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;box-sizing:border-box}
.cal-actions{display:flex;flex-wrap:wrap;gap:8px}.cal-actions .uv-btn{padding:10px 14px}
.cal-status{min-height:20px;font-size:13px;font-weight:600}.cal-status[data-state=passed]{color:#397756}.cal-status[data-state=rejected],.cal-status[data-state=load-error]{color:#a04b3c}
.cal-preview-wrap{position:relative;width:100%;aspect-ratio:3/2;min-height:340px;border-radius:14px;overflow:hidden;background:#e8e4dc}
.cal-preview-wrap[hidden],.cal-legend[hidden],.cal-motion[hidden]{display:none!important}
.cal-preview{display:block;width:100%;height:100%}
.cal-view-labels{position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;pointer-events:none}
.cal-view-labels span{display:flex;align-items:flex-start;justify-content:flex-start;padding:9px;color:#34312d;font:600 10px/1 system-ui;letter-spacing:.12em;text-shadow:0 1px #fff}
.cal-view-labels span:nth-child(odd){border-right:1px solid rgba(6,12,33,.16)}
.cal-view-labels span:nth-child(-n+2){border-bottom:1px solid rgba(6,12,33,.16)}
.cal-legend{display:flex;justify-content:space-between;gap:8px;margin-top:7px;font-size:11px;font-weight:600;color:#4e4d4d}
.cal-preview-empty{margin-top:12px!important;padding:18px;border:1px dashed #c8bdaf;border-radius:10px;text-align:center;font-size:12px}
.cal-motion{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.cal-motion button{border:1px solid #cec3b4;background:#ffffff;border-radius:999px;padding:7px 10px;font:600 11px system-ui;cursor:pointer}.cal-motion button.on{background:#0A84FF;border-color:#d49a27}
.cal-report-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}
.cal-verdict{display:inline-flex;padding:6px 9px;border-radius:999px;background:#e4ddd2;color:#4e4d4d;font-size:10px;font-weight:600;letter-spacing:.04em}.cal-verdict.passed{background:#dcebdd;color:#315d40}.cal-verdict.rejected,.cal-verdict.load-error{background:#f1dcd6;color:#843f34}
.cal-list{margin:7px 0 0;padding-left:18px;color:#5d5750;font-size:12px;line-height:1.5}.cal-list.errors{color:#843f34}.cal-list.warnings{color:#745b27}
.cal-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:10px}.cal-metric{padding:8px;border:1px solid #e5e5ea;border-radius:10px;background:#ffffff}.cal-metric span{display:block;color:#9a9aa2;font-size:9px;font-weight:600;text-transform:uppercase}.cal-metric strong{display:block;margin-top:3px;font-size:12px;overflow-wrap:anywhere}
.cal-human{margin-top:10px;padding:10px 12px;border-left:4px solid #8b79c9;border-radius:8px;background:#f2edf8;color:#514766;font-size:11.5px;line-height:1.45}
.cal-report-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
@media(max-width:780px){.cal-panel{width:100%;max-height:100%}.cal-root{grid-template-columns:1fr}.cal-preview-wrap{min-height:270px}.cal-manifest{min-height:220px}.cal-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;

let cssInjected = false;
let panel = null;

function injectCss() {
  if (cssInjected) return;
  cssInjected = true;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
}

export function allowsCharacterAcceptanceLab(
  search = globalThis.location?.search || '',
) {
  return new URLSearchParams(search).get('dev') === '1';
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return 'not measured';
  if (value < 1_000) return `${value} B`;
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)} kB`;
  return `${(value / 1_000_000).toFixed(2)} MB`;
}

function parseManifest(text) {
  try {
    return { value: JSON.parse(text), error: null };
  } catch (error) {
    return {
      value: null,
      error: `Manifest JSON could not be parsed: ${error instanceof Error ? error.message : error}`,
    };
  }
}

function metricEntries(report, manifest) {
  const metrics = report?.metrics || {};
  const budgets = manifest?.budgets || {};
  return [
    ['File', formatBytes(metrics.fileBytes), formatBytes(budgets.maxFileBytes)],
    ['Triangles', metrics.triangles ?? 'not measured', budgets.maxTriangles],
    ['Draw calls', metrics.drawCalls ?? 'not measured', budgets.maxDrawCalls],
    ['Bones', metrics.bones ?? 'not measured', budgets.maxBones],
    ['Textures', metrics.textures ?? 'not measured', budgets.maxTextures],
    ['Largest texture', metrics.maxTextureSize ?? 'not measured', budgets.maxTextureSize],
    ['Skinned meshes', metrics.skinnedMeshes ?? 'not measured', 'at least 1'],
    ['Authored height', Number.isFinite(metrics.authoredBounds?.height)
      ? metrics.authoredBounds.height.toFixed(3)
      : 'not measured', 'finite'],
  ];
}

function appendIssueList(parent, items, className, emptyCopy) {
  const list = document.createElement('ul');
  list.className = `cal-list ${className}`;
  if (!items.length) {
    const item = document.createElement('li');
    item.textContent = emptyCopy;
    list.appendChild(item);
  } else {
    for (const text of items) {
      const item = document.createElement('li');
      item.textContent = text;
      list.appendChild(item);
    }
  }
  parent.appendChild(list);
}

function motionState(name) {
  if (name === 'walk') return { grounded: true, speed: 2.4, moving: true };
  if (name === 'run') return { grounded: true, speed: 5, moving: true };
  if (name === 'jump') return { grounded: false, velocityY: 4, speed: 0 };
  if (name === 'fall') return { grounded: false, velocityY: -3, speed: 0 };
  return { grounded: true, speed: 0, moving: false };
}

function createComparisonPreview(ctx, canvas, candidate, onMotionChange) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'low-power',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setScissorTest(true);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8e4dc);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x777066, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(3, 5, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdce8f0, 1.1);
  fill.position.set(-4, 2, -3);
  scene.add(fill);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 8),
    new THREE.MeshStandardMaterial({ color: 0xd8d2c8, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const candidateRoot = candidate.model;
  scene.add(candidateRoot);
  let reference = null;
  let active = true;
  let frameId = 0;
  let motion = 'idle';
  let last = performance.now();
  const cameras = VIEW_DEFINITIONS.map(() => new THREE.OrthographicCamera());
  const ready = ctx.characters.createInstance('qa-runner', {
    lod: 'hero',
    shadow: 'none',
  }).then((instance) => {
    if (!active) {
      instance.dispose();
      return;
    }
    reference = instance;
    scene.add(instance.root);
  });

  function selectMotion(next) {
    motion = next;
    if (next === 'land') {
      candidate.animator.signal('land', { strength: 1 });
      reference?.animator.signal('land', { strength: 1 });
    } else if (next === 'celebrate') {
      candidate.animator.play('celebrate');
      reference?.animator.play('celebrate');
    }
    onMotionChange(next);
  }

  function render(now) {
    if (!active) return;
    frameId = requestAnimationFrame(render);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const state = motionState(motion);
    candidate.animator.update(dt, state);
    reference?.animator.update(dt, state);

    const width = Math.max(2, Math.round(canvas.clientWidth * renderer.getPixelRatio()));
    const height = Math.max(2, Math.round(canvas.clientHeight * renderer.getPixelRatio()));
    if (canvas.width !== width || canvas.height !== height) {
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    }
    const cellWidth = Math.floor(canvas.width / 2);
    const cellHeight = Math.floor(canvas.height / 2);
    for (let index = 0; index < VIEW_DEFINITIONS.length; index++) {
      const column = index % 2;
      const row = index < 2 ? 1 : 0;
      const definition = VIEW_DEFINITIONS[index];
      const camera = cameras[index];
      const target = new THREE.Vector3(0, 0.96, 0);
      camera.position.copy(definition.direction).multiplyScalar(5).add(target);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      candidateRoot.position.copy(right).multiplyScalar(-0.65);
      reference?.root.position.copy(right).multiplyScalar(0.65);
      const aspect = cellWidth / cellHeight;
      camera.left = -1.35 * aspect;
      camera.right = 1.35 * aspect;
      camera.top = 1.35;
      camera.bottom = -1.35;
      camera.near = 0.1;
      camera.far = 20;
      camera.updateProjectionMatrix();
      renderer.setViewport(column * cellWidth, row * cellHeight, cellWidth, cellHeight);
      renderer.setScissor(column * cellWidth, row * cellHeight, cellWidth, cellHeight);
      renderer.render(scene, camera);
    }
  }
  frameId = requestAnimationFrame(render);

  return {
    ready,
    selectMotion,
    dispose() {
      if (!active) return;
      active = false;
      cancelAnimationFrame(frameId);
      candidateRoot.removeFromParent();
      reference?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

function createReportCard(container, reportData, reportText, manifest, controls) {
  container.replaceChildren();
  const inspection = reportData.automatedInspection;
  const head = document.createElement('div');
  head.className = 'cal-report-head';
  const title = document.createElement('h3');
  title.textContent = 'Automated contract';
  const verdict = document.createElement('span');
  verdict.className = `cal-verdict ${inspection.status}`;
  verdict.textContent = inspection.status === 'passed'
    ? 'PASSED'
    : inspection.status.replace('-', ' ').toUpperCase();
  head.append(title, verdict);
  container.appendChild(head);

  const errorsTitle = document.createElement('strong');
  errorsTitle.textContent = 'Fail reasons';
  container.appendChild(errorsTitle);
  appendIssueList(container, inspection.errors, 'errors', 'No automated failures.');
  const warningTitle = document.createElement('strong');
  warningTitle.textContent = 'Warnings';
  container.appendChild(warningTitle);
  appendIssueList(container, inspection.warnings, 'warnings', 'No warnings.');

  const metrics = document.createElement('div');
  metrics.className = 'cal-metrics';
  for (const [label, value, budget] of metricEntries(inspection, manifest)) {
    const card = document.createElement('div');
    card.className = 'cal-metric';
    const name = document.createElement('span');
    name.textContent = label;
    const fact = document.createElement('strong');
    fact.textContent = `${value} / ${budget}`;
    card.append(name, fact);
    metrics.appendChild(card);
  }
  container.appendChild(metrics);

  const human = document.createElement('div');
  human.className = 'cal-human';
  human.textContent = 'Still requires human signoff: identity against approved 2D art, deformation and loop quality, root motion, all cosmetic anchors, every game surface, and real phone/laptop performance. Automated PASS is not release approval.';
  container.appendChild(human);

  const actions = document.createElement('div');
  actions.className = 'cal-report-actions';
  controls.copy.disabled = false;
  controls.download.disabled = false;
  controls.copy.dataset.report = reportText;
  controls.download.dataset.report = reportText;
  actions.append(controls.copy, controls.download);
  container.appendChild(actions);
}

registerSystem(LAB_ID, {
  open(ctx) {
    if (!allowsCharacterAcceptanceLab()) {
      ctx.ui.toast('Character Acceptance Lab is available only with ?dev=1.');
      return;
    }
    if (panel) return;
    injectCss();

    let selectedFile = null;
    let candidate = null;
    let preview = null;
    let reportText = '';
    const downloadUrls = new Set();
    const devOverlay = document.getElementById('dev-overlay');
    const previousDevOverlayVisibility = devOverlay?.style.visibility || '';
    if (devOverlay) devOverlay.style.visibility = 'hidden';

    function disposeCandidate() {
      preview?.dispose();
      preview = null;
      candidate?.dispose();
      candidate = null;
    }

    panel = ctx.ui.panel({
      title: 'Character Acceptance Lab',
      closeLabel: 'Close Character Acceptance Lab',
      onClose: () => {
        disposeCandidate();
        for (const url of downloadUrls) URL.revokeObjectURL(url);
        downloadUrls.clear();
        if (devOverlay) devOverlay.style.visibility = previousDevOverlayVisibility;
        panel = null;
      },
    });
    panel.el.classList.add('cal-panel');

    const root = document.createElement('div');
    root.className = 'cal-root';
    const left = document.createElement('div');
    left.className = 'cal-stack';
    const right = document.createElement('div');
    right.className = 'cal-stack';

    const privateNotice = document.createElement('div');
    privateNotice.className = 'cal-private';
    privateNotice.textContent = 'LOCAL DEV TOOL - the GLB is read only in this browser tab. It is not uploaded, saved, equipped, or approved for release.';
    left.appendChild(privateNotice);

    const inputCard = document.createElement('section');
    inputCard.className = 'cal-card';
    const inputTitle = document.createElement('h3');
    inputTitle.textContent = '1. Choose a candidate GLB';
    const fileInput = document.createElement('input');
    fileInput.className = 'cal-file';
    fileInput.type = 'file';
    fileInput.accept = '.glb,model/gltf-binary';
    fileInput.id = 'cal-file';
    const drop = document.createElement('label');
    drop.className = 'cal-drop';
    drop.htmlFor = fileInput.id;
    const dropStrong = document.createElement('strong');
    dropStrong.textContent = 'Select a local .glb';
    const dropSmall = document.createElement('small');
    dropSmall.textContent = 'or drop one here - one self-contained binary glTF, 64 MB local safety limit';
    drop.append(dropStrong, dropSmall);
    const fileFact = document.createElement('p');
    fileFact.className = 'cal-file-fact';
    fileFact.textContent = 'No file selected.';
    inputCard.append(inputTitle, fileInput, drop, fileFact);
    left.appendChild(inputCard);

    const manifestCard = document.createElement('section');
    manifestCard.className = 'cal-card';
    const manifestLabel = document.createElement('label');
    manifestLabel.className = 'cal-label';
    manifestLabel.htmlFor = 'cal-manifest';
    manifestLabel.textContent = '2. Confirm exact manifest names';
    const manifestHelp = document.createElement('p');
    manifestHelp.textContent = 'The filename creates a template only. Edit clip and node names to exactly match the artist export.';
    const manifestInput = document.createElement('textarea');
    manifestInput.id = 'cal-manifest';
    manifestInput.className = 'cal-manifest';
    manifestInput.spellcheck = false;
    manifestInput.value = JSON.stringify(createCharacterManifestTemplate(), null, 2);
    manifestCard.append(manifestLabel, manifestHelp, manifestInput);
    left.appendChild(manifestCard);

    const runCard = document.createElement('section');
    runCard.className = 'cal-card';
    const runTitle = document.createElement('h3');
    runTitle.textContent = '3. Inspect locally';
    const runHelp = document.createElement('p');
    runHelp.textContent = 'Runs the same manifest, rig, clip, anchor, and hard-budget inspection used by the development candidate adapter.';
    const runActions = document.createElement('div');
    runActions.className = 'cal-actions';
    runActions.style.marginTop = '10px';
    const analyze = ctx.ui.button('Run acceptance inspection', () => {}, { primary: true });
    analyze.disabled = true;
    const clear = ctx.ui.button('Clear local file', () => {});
    const status = document.createElement('div');
    status.className = 'cal-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    runActions.append(analyze, clear);
    runCard.append(runTitle, runHelp, runActions, status);
    left.appendChild(runCard);

    const previewCard = document.createElement('section');
    previewCard.className = 'cal-card';
    const previewTitle = document.createElement('h3');
    previewTitle.textContent = 'Neutral turntable comparison';
    const previewHelp = document.createElement('p');
    previewHelp.textContent = 'Candidate left - current QA Runner right. Neutral light, fixed scale, no environment styling.';
    const previewEmpty = document.createElement('p');
    previewEmpty.className = 'cal-preview-empty';
    previewEmpty.textContent = 'A contract-safe preview will appear here after inspection.';
    const previewWrap = document.createElement('div');
    previewWrap.className = 'cal-preview-wrap';
    previewWrap.hidden = true;
    const canvas = document.createElement('canvas');
    canvas.className = 'cal-preview';
    canvas.setAttribute('aria-label', 'Candidate and QA Runner front, side, back, and three-quarter comparison');
    const labels = document.createElement('div');
    labels.className = 'cal-view-labels';
    for (const { label } of VIEW_DEFINITIONS) {
      const span = document.createElement('span');
      span.textContent = label;
      labels.appendChild(span);
    }
    previewWrap.append(canvas, labels);
    const legend = document.createElement('div');
    legend.className = 'cal-legend';
    legend.innerHTML = '<span>CANDIDATE - LEFT</span><span>QA RUNNER - RIGHT</span>';
    legend.hidden = true;
    const motion = document.createElement('div');
    motion.className = 'cal-motion';
    motion.hidden = true;
    const motionButtons = new Map();
    for (const name of ['idle', 'walk', 'run', 'jump', 'fall', 'land', 'celebrate']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = name.toUpperCase();
      button.setAttribute('aria-pressed', String(name === 'idle'));
      button.classList.toggle('on', name === 'idle');
      button.onclick = () => preview?.selectMotion(name);
      motionButtons.set(name, button);
      motion.appendChild(button);
    }
    previewCard.append(previewTitle, previewHelp, previewEmpty, previewWrap, legend, motion);
    right.appendChild(previewCard);

    const reportCard = document.createElement('section');
    reportCard.className = 'cal-card';
    const reportPlaceholder = document.createElement('p');
    reportPlaceholder.textContent = 'Choose a GLB, confirm its manifest, and run inspection to see exact pass/fail reasons.';
    reportCard.appendChild(reportPlaceholder);
    right.appendChild(reportCard);

    const copy = ctx.ui.button('Copy compact report', async () => {
      if (!reportText) return;
      let copied = false;
      try {
        await navigator.clipboard.writeText(reportText);
        copied = true;
      } catch {
        const fallback = document.createElement('textarea');
        fallback.value = reportText;
        fallback.style.position = 'fixed';
        fallback.style.opacity = '0';
        document.body.appendChild(fallback);
        fallback.select();
        copied = document.execCommand('copy');
        fallback.remove();
      }
      ctx.ui.toast(copied ? 'Local acceptance report copied.' : 'Copy failed. Use Download JSON instead.');
    });
    copy.disabled = true;
    const download = ctx.ui.button('Download report JSON', () => {
      if (!reportText) return;
      const blob = new Blob([reportText], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      downloadUrls.add(url);
      const link = document.createElement('a');
      const parsed = parseManifest(manifestInput.value).value;
      link.download = `${parsed?.id || 'character-candidate'}-acceptance-report.json`;
      link.href = url;
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        downloadUrls.delete(url);
      }, 0);
    });
    download.disabled = true;
    const reportControls = { copy, download };

    function setMotion(next) {
      for (const [name, button] of motionButtons) {
        const selected = name === next;
        button.classList.toggle('on', selected);
        button.setAttribute('aria-pressed', String(selected));
      }
    }

    function applyFile(file) {
      if (!file || !file.name.toLowerCase().endsWith('.glb')) {
        status.dataset.state = 'rejected';
        status.textContent = 'Choose one .glb file.';
        return;
      }
      selectedFile = file;
      manifestInput.value = JSON.stringify(createCharacterManifestTemplate(file.name), null, 2);
      fileFact.textContent = `${file.name} - ${formatBytes(file.size)} - local tab only`;
      analyze.disabled = false;
      status.dataset.state = '';
      status.textContent = 'Ready. Confirm exact clip and anchor names, then inspect.';
      disposeCandidate();
      previewWrap.hidden = true;
      legend.hidden = true;
      motion.hidden = true;
      previewEmpty.hidden = false;
      previewEmpty.textContent = 'A contract-safe preview will appear here after inspection.';
      reportText = '';
      reportCard.replaceChildren(reportPlaceholder);
      copy.disabled = true;
      download.disabled = true;
    }

    fileInput.addEventListener('change', () => applyFile(fileInput.files?.[0]));
    for (const eventName of ['dragenter', 'dragover']) {
      drop.addEventListener(eventName, (event) => {
        event.preventDefault();
        drop.classList.add('drag');
      });
    }
    for (const eventName of ['dragleave', 'drop']) {
      drop.addEventListener(eventName, (event) => {
        event.preventDefault();
        drop.classList.remove('drag');
      });
    }
    drop.addEventListener('drop', (event) => applyFile(event.dataTransfer?.files?.[0]));

    clear.onclick = () => {
      disposeCandidate();
      selectedFile = null;
      fileInput.value = '';
      fileFact.textContent = 'No file selected.';
      analyze.disabled = true;
      status.dataset.state = '';
      status.textContent = '';
      manifestInput.value = JSON.stringify(createCharacterManifestTemplate(), null, 2);
      previewWrap.hidden = true;
      legend.hidden = true;
      motion.hidden = true;
      previewEmpty.hidden = false;
      previewEmpty.textContent = 'A contract-safe preview will appear here after inspection.';
      reportText = '';
      reportCard.replaceChildren(reportPlaceholder);
      copy.disabled = true;
      download.disabled = true;
    };

    analyze.onclick = async () => {
      if (!selectedFile || analyze.disabled) return;
      disposeCandidate();
      previewWrap.hidden = true;
      legend.hidden = true;
      motion.hidden = true;
      previewEmpty.hidden = false;
      analyze.disabled = true;
      status.dataset.state = '';
      status.textContent = 'Inspecting local GLB...';
      const parsed = parseManifest(manifestInput.value);
      let manifest = parsed.value;
      let inspection = null;
      let loadError = parsed.error;
      if (!loadError && validateProductionCharacterManifest(manifest).length === 0) {
        if (selectedFile.size > MAX_LOCAL_FILE_BYTES) {
          loadError = `Local safety limit exceeded: ${formatBytes(selectedFile.size)} is larger than ${formatBytes(MAX_LOCAL_FILE_BYTES)}.`;
        } else {
          try {
            candidate = await loadProductionCharacterCandidateBytes(
              manifest,
              await selectedFile.arrayBuffer(),
            );
            inspection = candidate.report;
          } catch (error) {
            inspection = error?.report || null;
            loadError = inspection
              ? null
              : `GLB could not be parsed locally: ${error instanceof Error ? error.message : error}`;
          }
        }
      }
      const reportData = createCharacterAcceptanceReport({
        fileName: selectedFile.name,
        fileBytes: selectedFile.size,
        manifest,
        inspection,
        loadError,
      });
      reportText = compactCharacterAcceptanceReport(reportData);
      createReportCard(reportCard, reportData, reportText, manifest, reportControls);
      status.dataset.state = reportData.automatedInspection.status;
      status.textContent = reportData.automatedInspection.status === 'passed'
        ? 'Automated contract passed. Human visual and real-device signoff are still required.'
        : 'Candidate is not accepted. Review every fail reason below.';

      if (candidate) {
        previewEmpty.hidden = true;
        previewWrap.hidden = false;
        legend.hidden = false;
        motion.hidden = false;
        preview = createComparisonPreview(ctx, canvas, candidate, setMotion);
        await preview.ready;
        preview.selectMotion('idle');
      } else {
        previewEmpty.textContent = inspection?.canPreview === false
          ? 'Preview blocked: the GLB has a critical rig, scene, or bounds failure. Fix the automated fail reasons before visual review.'
          : 'Preview unavailable because the local GLB could not be parsed safely.';
      }
      analyze.disabled = false;
    };

    root.append(left, right);
    panel.body.appendChild(root);
  },
  close() {
    panel?.close();
  },
});
