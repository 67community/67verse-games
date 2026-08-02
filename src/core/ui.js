// ui.js — DOM helpers for system panels, buttons, toasts, HUD icon bar.
//
// Styled to Public Network's design language (Figma "Public Network Final"):
// near-white surfaces, near-black ink, greys carrying the hierarchy, hairline
// separators, 10px card / 14px input radii, iOS press scale. Colour belongs to
// the 3D world — the interface stays quiet so the game reads through it.
const CSS = `
.uv-panel-veil{position:fixed;inset:0;background:rgba(253,253,253,.58);z-index:60;display:flex;align-items:center;justify-content:center;padding:calc(env(safe-area-inset-top) + 10px) calc(env(safe-area-inset-right) + 10px) calc(env(safe-area-inset-bottom) + 10px) calc(env(safe-area-inset-left) + 10px);backdrop-filter:blur(18px) saturate(180%)}
.uv-panel-veil[inert]{pointer-events:none}
.uv-panel{background:#fbfbfc;border:1px solid #e5e5ea;border-radius:14px;box-shadow:0 12px 40px rgba(6,12,33,.12);width:min(680px,92vw);max-height:84vh;display:flex;flex-direction:column;color:#060c21;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;touch-action:pan-y}
.uv-panel header{display:flex;align-items:center;justify-content:space-between;padding:18px 22px 10px;font-weight:600;font-size:19px;letter-spacing:-.02em}
.uv-panel header .uv-x{border:1px solid #e5e5ea;background:#fff;border-radius:999px;width:34px;height:34px;font-size:16px;cursor:pointer;color:#060c21}
.uv-panel header .uv-x:hover{background:#fafafa;border-color:#a9a9b1}
.uv-panel .uv-body{padding:8px 22px 22px;overflow:auto;font-size:14px}
.uv-btn{font:500 14px/1 -apple-system,system-ui,sans-serif;background:#fff;border:1px solid #e5e5ea;border-radius:10px;padding:12px 18px;cursor:pointer;color:#060c21;transition:transform 150ms ease-out,background 150ms ease-out,border-color 150ms ease-out}
.uv-btn:hover{background:#fafafa;border-color:#a9a9b1}
.uv-btn:active{transform:scale(.98)}
.uv-btn.primary{background:#060c21;border-color:#060c21;color:#fff;font-weight:500;box-shadow:inset 0 1px 0 rgba(255,255,255,.16)}
.uv-btn.primary:hover{background:#11182f;border-color:#11182f}
.uv-btn:disabled{opacity:.45;cursor:default}
.uv-toast{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 18px);transform:translateX(-50%);max-width:calc(100vw - env(safe-area-inset-left) - env(safe-area-inset-right) - 20px);background:#060c21;color:#fff;padding:10px 20px;border-radius:999px;font:500 13px -apple-system,system-ui,sans-serif;z-index:80;box-shadow:0 8px 24px rgba(6,12,33,.22);pointer-events:none}
.uv-hudbar{position:fixed;top:calc(env(safe-area-inset-top) + 12px);right:calc(env(safe-area-inset-right) + 12px);z-index:50;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;max-width:60vw}
.uv-hudbar button{width:44px;height:44px;border-radius:10px;border:1px solid #e5e5ea;background:rgba(255,255,255,.92);font-size:19px;cursor:pointer;box-shadow:none;color:#060c21;backdrop-filter:blur(12px) saturate(180%);transition:transform 150ms ease-out,background 150ms ease-out,border-color 150ms ease-out}
.uv-hudbar button[aria-label="Settings"]{width:auto;min-width:44px;padding:0 14px;font:500 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0}
.uv-hudbar button:hover{background:#fff;border-color:#a9a9b1}
.uv-hudbar button:active{transform:scale(.98)}
.uv-hudbar button[aria-busy="true"]{opacity:.55;cursor:wait}
body.in-game .uv-hudbar{display:none}
.uv-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.uv-chip{font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.04em;padding:5px 11px;border-radius:8px;background:#f5f5f7;border:1px solid #e5e5ea;color:#9a9aa2}
.uv-play-intro{margin:0 0 14px;color:#4e4d4d;line-height:1.5}
.uv-game-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.uv-game-card{display:flex;min-width:0;flex-direction:column;align-items:flex-start;gap:8px;padding:15px;border:1px solid #e5e5ea;border-radius:10px;background:#fff}
.uv-game-icon{font-size:26px;line-height:1}
.uv-game-card h3{margin:0;font-size:16px;font-weight:600;letter-spacing:-.01em}
.uv-game-card p{margin:0;min-height:54px;color:#707070;font-size:13px;line-height:1.4}
.uv-game-card .uv-chip{font-size:9px}
.uv-game-card .uv-btn{width:100%;margin-top:auto}
@media(max-width:620px){
  .uv-panel{width:100%;max-height:100%;border-radius:14px}
  .uv-panel header{padding:15px 16px 8px;font-size:18px}
  .uv-panel header .uv-x{width:44px;height:44px}
  .uv-panel .uv-body{padding:8px 16px 18px}
  .uv-panel .uv-btn{min-height:44px}
  .uv-game-grid{grid-template-columns:1fr}
  .uv-game-card{display:grid;grid-template-columns:auto 1fr auto;align-items:center;padding:12px}
  .uv-game-card h3{grid-column:2}
  .uv-game-card p{grid-column:2 / 4;min-height:0}
  .uv-game-card .uv-chip{grid-column:2 / 4}
  .uv-game-card .uv-btn{grid-column:1 / 4}
}
`;

let injected = false;
function inject() {
  if (injected) return; injected = true;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
}

export function createUi(ctx) {
  inject();
  const panelStack = [];
  const modalLayers = [];
  const isolatedBackground = new Map();
  const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  function visibleFocusables(panel) {
    return [...panel.querySelectorAll(focusableSelector)].filter((element) => (
      element.getAttribute('aria-hidden') !== 'true'
      && element.getClientRects().length > 0
    ));
  }

  function restoreBackgroundIsolation() {
    for (const [element, state] of isolatedBackground) {
      element.toggleAttribute('inert', state.inert);
      if (state.ariaHidden == null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', state.ariaHidden);
      if (state.role == null) element.removeAttribute('role');
      else element.setAttribute('role', state.role);
      if (state.ariaModal == null) element.removeAttribute('aria-modal');
      else element.setAttribute('aria-modal', state.ariaModal);
    }
    isolatedBackground.clear();
  }

  function syncPanelIsolation() {
    restoreBackgroundIsolation();
    const hasModalLayer = modalLayers.length > 0;
    document.body.classList.toggle('modal-open', hasModalLayer);
    if (hasModalLayer) ctx.input?.resetTransient?.();
    const touchUi = document.getElementById('touch-ui');
    const touchBlocked = hasModalLayer
      || document.body.classList.contains('entry-open')
      || document.body.classList.contains('show67-overlay-open');
    touchUi?.toggleAttribute('inert', touchBlocked);
    if (touchBlocked) touchUi?.setAttribute('aria-hidden', 'true');
    else touchUi?.removeAttribute('aria-hidden');
    if (!hasModalLayer) return;

    const topLayer = modalLayers.at(-1);
    for (const element of document.body.children) {
      if (
        element === topLayer
        || element.tagName === 'SCRIPT'
        || element.classList.contains('uv-toast')
      ) continue;
      isolatedBackground.set(element, {
        inert: element.hasAttribute('inert'),
        ariaHidden: element.getAttribute('aria-hidden'),
        role: element.getAttribute('role'),
        ariaModal: element.getAttribute('aria-modal'),
      });
      element.setAttribute('inert', '');
      element.setAttribute('aria-hidden', 'true');
      if (element.getAttribute('role') === 'dialog') {
        element.removeAttribute('role');
        element.removeAttribute('aria-modal');
      }
    }
  }

  function addModalLayer(element) {
    if (!(element instanceof HTMLElement) || modalLayers.includes(element)) {
      return () => {};
    }
    modalLayers.push(element);
    syncPanelIsolation();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const index = modalLayers.indexOf(element);
      if (index >= 0) modalLayers.splice(index, 1);
      syncPanelIsolation();
    };
  }

  const hudbar = document.createElement('div');
  hudbar.className = 'uv-hudbar';
  hudbar.setAttribute('role', 'navigation');
  hudbar.setAttribute('aria-label', 'Skypark menu');
  document.body.appendChild(hudbar);

  const ui = {
    panel({ title = '', onClose, closeLabel } = {}) {
      const veil = document.createElement('div');
      veil.className = 'uv-panel-veil';
      const el = document.createElement('div');
      el.className = 'uv-panel';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      const head = document.createElement('header');
      const titleEl = document.createElement('span');
      titleEl.textContent = title;
      titleEl.id = `uv-panel-title-${Date.now()}-${panelStack.length}`;
      el.setAttribute('aria-labelledby', titleEl.id);
      const x = document.createElement('button');
      x.className = 'uv-x'; x.textContent = '✕';
      x.type = 'button';
      x.setAttribute('aria-label', closeLabel || `Close ${title || 'dialog'}`);
      const body = document.createElement('div');
      body.className = 'uv-body';
      head.append(titleEl, x);
      el.appendChild(head); el.appendChild(body);
      veil.appendChild(el);
      document.body.appendChild(veil);
      const priorFocus = document.activeElement;
      let closed = false;
      const entry = { el, veil, close: null, releaseIsolation: null };
      const close = () => {
        if (closed) return;
        closed = true;
        const index = panelStack.indexOf(entry);
        if (index >= 0) panelStack.splice(index, 1);
        veil.remove();
        entry.releaseIsolation?.();
        onClose && onClose();
        const fallbackFocus = ctx.view.current
          ? document.getElementById('return-skypark')
          : document.getElementById('primary-play');
        const restoreTarget = (
          priorFocus instanceof HTMLElement
          && priorFocus !== document.body
          && priorFocus.isConnected
        ) ? priorFocus : fallbackFocus;
        restoreTarget?.focus();
      };
      entry.close = close;
      panelStack.push(entry);
      entry.releaseIsolation = addModalLayer(veil);
      x.onclick = close;
      veil.addEventListener('pointerdown', (e) => { if (e.target === veil) close(); });
      queueMicrotask(() => x.focus());
      return { el, body, close };
    },
    button(label, onClick, { primary = false } = {}) {
      const b = document.createElement('button');
      b.className = 'uv-btn' + (primary ? ' primary' : '');
      b.type = 'button';
      b.textContent = label;
      b.onclick = onClick;
      return b;
    },
    toast(text) {
      const t = document.createElement('div');
      t.className = 'uv-toast';
      t.textContent = text;
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      t.setAttribute('aria-atomic', 'true');
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 2500);
    },
    hudIcon(id, emoji, title) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = emoji; b.title = title;
      b.setAttribute('aria-label', title);
      b.onclick = () => {
        const sys = ctx.systems.get(id);
        if (sys) sys.open(ctx);
        else ui.toast(title + ' — coming soon');
      };
      hudbar.appendChild(b);
      return b;
    },
    confirm(text) {
      return new Promise((res) => {
        let settled = false;
        const finish = (value, p) => {
          if (settled) return;
          settled = true;
          p.close();
          res(value);
        };
        const p = ui.panel({ title: 'Are you sure?', onClose: () => {
          if (!settled) { settled = true; res(false); }
        } });
        const msg = document.createElement('p');
        msg.id = `uv-confirm-message-${Date.now()}`;
        msg.textContent = text;
        p.el.setAttribute('aria-describedby', msg.id);
        const row = document.createElement('div'); row.className = 'uv-row';
        row.append(
          ui.button('Cancel', () => finish(false, p)),
          ui.button('Yes', () => finish(true, p), { primary: true }),
        );
        p.body.append(msg, row);
      });
    },
    hasModal() {
      return panelStack.length > 0;
    },
    hasAnyModal() {
      return modalLayers.length > 0;
    },
    isolateModalLayer(element) {
      return addModalLayer(element);
    },
    closeTopPanel() {
      panelStack.at(-1)?.close();
    },
  };
  window.addEventListener('keydown', (event) => {
    const topLayer = modalLayers.at(-1);
    const topPanelEntry = panelStack.at(-1);
    if (!topLayer) return;
    if (event.code === 'Escape' && topPanelEntry?.veil === topLayer) {
      event.preventDefault();
      event.stopImmediatePropagation();
      ui.closeTopPanel();
      return;
    }
    if (event.code !== 'Tab') return;
    const focusRoot = topPanelEntry?.veil === topLayer ? topPanelEntry.el : topLayer;
    const focusables = visibleFocusables(focusRoot);
    if (!focusables.length) {
      event.preventDefault();
      focusRoot.tabIndex = -1;
      focusRoot.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables.at(-1);
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !focusRoot.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !focusRoot.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }, true);
  return ui;
}
