// settings.js — Settings system: deterministic Auto/High/Low graphics tier,
// chat toggle, parental gate, spend cap, volume, and the
// default skin tone. Everything persists via ctx.save key 'settings' and every
// change is broadcast on the bus as 'settings-changed' (save.setSettings emits
// it) so audio / chat / rendering / character modules can react live.
//
// Save key: 'settings' = { volume, quality:'auto'|'high'|'low', chatEnabled, parentalGate, spendCap, skinTone }
// Bus events emitted: 'settings-changed' (full settings object) — via save.setSettings.
// Bus events listened: 'settings-changed' (only while the panel is open, to refresh UI).
// Hooks used: 'boot' (apply persisted quality to the renderer at startup),
//             'hub'  (capture the hub scene so shadow toggles can recompile materials).

import { registerSystem, registerHook } from '../core/registry.js';

const DEFAULTS = {
  volume: 0.7, quality: 'auto', chatEnabled: true,
  parentalGate: false, spendCap: 0, skinTone: '#f2c9a0',
};

// Warm, inclusive skin-tone ramp (kid-safe, no realism claims).
const SKIN_TONES = ['#f2c9a0', '#e8b88a', '#cf9a6b', '#b0784e', '#8a5636', '#5f3a22'];
const SPEND_CAPS = [0, 100, 500, 1000]; // 0 = no cap; enforcement lives in shop/market modules.

// ---------- scoped styles (injected once, idempotent) ----------
const CSS = `
.uv-set-sec{margin:14px 0 4px}
.uv-set-sec h3{margin:0 0 4px;font-size:15px;color:#060c21}
.uv-set-note{margin:2px 0 8px;font-size:12.5px;color:#9a9aa2;line-height:1.45}
.uv-set-card{background:#f5f5f7;border:1px solid #e5e5ea;border-radius:10px;padding:12px 14px;margin-bottom:10px}
.uv-set-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.uv-set-slider{flex:1;min-width:140px;accent-color:#9a9aa2;height:26px;cursor:pointer}
.uv-set-val{min-width:44px;text-align:right;font-weight:600;color:#060c21;font-variant-numeric:tabular-nums}
.uv-set-seg{display:inline-flex;background:#eae4d9;border:1px solid #e5e5ea;border-radius:999px;padding:3px;gap:3px}
.uv-set-seg button{border:0;background:transparent;border-radius:999px;padding:8px 16px;font:500 13px -apple-system,system-ui,sans-serif;color:#9a9aa2;cursor:pointer}
.uv-set-seg button.on{background:#0A84FF;color:#060c21;box-shadow:0 2px 8px rgba(6,12,33,.15)}
.uv-set-switch{position:relative;width:52px;height:30px;border-radius:999px;border:1px solid #e5e5ea;background:#eae4d9;cursor:pointer;transition:background .15s;flex:none}
.uv-set-switch::after{content:'';position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#ffffff;box-shadow:0 2px 6px rgba(6,12,33,.25);transition:left .15s}
.uv-set-switch[aria-checked="true"]{background:#5a9c7a;border-color:#5a9c7a}
.uv-set-switch[aria-checked="true"]::after{left:25px}
.uv-set-label{flex:1;font-weight:500;color:#060c21}
.uv-set-chips{display:flex;gap:8px;flex-wrap:wrap}
.uv-set-chip{border:1px solid #e5e5ea;background:#ffffff;border-radius:999px;padding:8px 14px;font:500 13px -apple-system,system-ui,sans-serif;color:#9a9aa2;cursor:pointer}
.uv-set-chip.on{background:#8a6fb0;border-color:#8a6fb0;color:#ffffff}
.uv-set-swatches{display:flex;gap:10px;flex-wrap:wrap}
.uv-set-swatch{width:38px;height:38px;border-radius:50%;border:3px solid transparent;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(6,12,33,.15)}
.uv-set-swatch.on{border-color:#9a9aa2;box-shadow:0 0 0 3px rgba(208,119,94,.25)}
`;
let cssInjected = false;
function injectCss() {
  if (cssInjected) return; cssInjected = true;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
}

// ---------- settings access + live application ----------
function getSettings(ctx) {
  return { ...DEFAULTS, ...(ctx.save.get('settings', {}) || {}) };
}

// Module-level boot ref is used to detach panel listeners during teardown.
let bootCtx = null;

function applyQuality(ctx, quality) {
  return ctx?.quality?.applyPreference(quality) || null;
}

export function updateSettings(ctx, patch) {
  const next = { ...getSettings(ctx), ...patch };
  if (!ctx.save.setSettings(next)) return null;
  if ('quality' in patch) applyQuality(ctx, next.quality);
  return next;
}

function settingsSaveFailed(ctx) {
  ctx.ui.toast('Settings could not be saved on this device. Your previous selection is still active.');
}

// Apply persisted graphics quality as early as possible (renderer exists by 'boot').
registerHook('boot', (ctx) => {
  bootCtx = ctx;
  try { applyQuality(ctx, getSettings(ctx).quality); } catch (e) { console.warn('[settings] boot apply failed', e); }
}, { replay: true });
registerHook('hub', (ctx, hub) => {
  if (hub?.scene) ctx.quality?.applyScene(hub.scene);
}, { replay: true });

// ---------- small DOM builders ----------
function section(title, note) {
  const sec = document.createElement('div');
  sec.className = 'uv-set-sec';
  const h = document.createElement('h3');
  h.textContent = title;
  sec.appendChild(h);
  if (note) {
    const p = document.createElement('p');
    p.className = 'uv-set-note';
    p.textContent = note;
    sec.appendChild(p);
  }
  const card = document.createElement('div');
  card.className = 'uv-set-card';
  sec.appendChild(card);
  return { sec, card };
}

function switchRow(labelText, checked, onFlip) {
  const row = document.createElement('div');
  row.className = 'uv-set-row';
  const lab = document.createElement('span');
  lab.className = 'uv-set-label';
  lab.textContent = labelText;
  const sw = document.createElement('button');
  sw.className = 'uv-set-switch';
  sw.setAttribute('role', 'switch');
  sw.setAttribute('aria-checked', String(!!checked));
  sw.setAttribute('aria-label', labelText);
  sw.onclick = () => {
    const previous = sw.getAttribute('aria-checked') === 'true';
    const next = sw.getAttribute('aria-checked') !== 'true';
    sw.setAttribute('aria-checked', String(next));
    if (onFlip(next) === false) {
      sw.setAttribute('aria-checked', String(previous));
    }
  };
  row.append(lab, sw);
  return { row, sw };
}

// ---------- system registration ----------
let panel = null;
let busHandler = null;
let refreshers = []; // fns that re-sync a control from the settings object

registerSystem('settings', {
  open(ctx) {
    if (panel) return;
    injectCss();
    panel = ctx.ui.panel({
      title: '⚙️ Settings',
      onClose: () => {
        if (busHandler) { ctx.bus.off('settings-changed', busHandler); busHandler = null; }
        refreshers = [];
        panel = null;
      },
    });
    const body = panel.body;
    refreshers = [];
    let s = getSettings(ctx);

    // ----- Sound -----
    {
      const { sec, card } = section('🔊 Sound', 'How loud the game sounds. Music and effects follow this right away.');
      const row = document.createElement('div');
      row.className = 'uv-set-row';
      const slider = document.createElement('input');
      slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '1';
      slider.className = 'uv-set-slider';
      slider.setAttribute('aria-label', 'Volume');
      const val = document.createElement('span');
      val.className = 'uv-set-val';
      const sync = (st) => { slider.value = String(Math.round(st.volume * 100)); val.textContent = Math.round(st.volume * 100) + '%'; };
      sync(s);
      slider.addEventListener('input', () => {
        const v = Math.max(0, Math.min(100, Number(slider.value) || 0));
        val.textContent = v + '%';
        const saved = updateSettings(ctx, { volume: v / 100 });
        if (!saved) {
          sync(s);
          settingsSaveFailed(ctx);
          return;
        }
        s = saved;
      });
      refreshers.push(sync);
      row.append(slider, val);
      card.appendChild(row);
      body.appendChild(sec);
    }

    // ----- Graphics -----
    {
      const { sec, card } = section(
        '🎨 Graphics',
        'Auto safely chooses once when the game starts. High is sharper with soft shadows. Low reduces resolution, shadows, and background detail.',
      );
      const seg = document.createElement('div');
      seg.className = 'uv-set-seg';
      const btns = {};
      const resolved = document.createElement('p');
      resolved.className = 'uv-set-note';
      resolved.style.margin = '8px 0 0';
      const sync = (st) => {
        for (const q of ['auto', 'high', 'low']) {
          const selected = st.quality === q;
          btns[q].classList.toggle('on', selected);
          btns[q].setAttribute('aria-pressed', String(selected));
        }
        const active = ctx.quality?.getState();
        resolved.textContent = active
          ? `Active: ${active.tier === 'high' ? 'High' : 'Low'} · ${active.pixelRatio.toFixed(2)}x resolution · shadows ${active.shadows ? 'on' : 'off'}`
          : '';
      };
      for (const q of ['auto', 'high', 'low']) {
        const b = document.createElement('button');
        b.textContent = q === 'auto' ? 'Auto' : q === 'high' ? 'High' : 'Low';
        b.onclick = () => {
          const saved = updateSettings(ctx, { quality: q });
          if (!saved) {
            sync(s);
            settingsSaveFailed(ctx);
            return;
          }
          s = saved;
          sync(s);
          const active = ctx.quality?.getState();
          ctx.ui.toast(
            q === 'auto'
              ? `Graphics: Auto (${active?.tier === 'high' ? 'High' : 'Low'})`
              : `Graphics: ${q === 'high' ? 'High ✨' : 'Low 🚀'}`,
          );
        };
        btns[q] = b;
        seg.appendChild(b);
      }
      sync(s);
      refreshers.push(sync);
      card.append(seg, resolved);
      body.appendChild(sec);
    }

    // ----- Chat -----
    {
      const { sec, card } = section('💬 Chat', 'Filtered text chat with friends. Turn it off to hide chat completely.');
      const { row } = switchRow('Chat enabled', s.chatEnabled, (on) => {
        const saved = updateSettings(ctx, { chatEnabled: on });
        if (!saved) {
          settingsSaveFailed(ctx);
          return false;
        }
        s = saved;
        ctx.ui.toast(on ? 'Chat on 💬' : 'Chat off — stay safe! 🛡️');
        return true;
      });
      card.appendChild(row);
      body.appendChild(sec);
    }

    // ----- Parental controls -----
    {
      const { sec, card } = section('🛡️ Parental controls', 'Grown-ups: lock spending and chat changes behind a parent check.');
      const gate = switchRow('Parental gate', s.parentalGate, (on) => {
        const saved = updateSettings(ctx, { parentalGate: on });
        if (!saved) {
          settingsSaveFailed(ctx);
          return false;
        }
        s = saved;
        ctx.ui.toast(on ? 'Parental gate on 🔒' : 'Parental gate off');
        return true;
      });
      card.appendChild(gate.row);

      const capNote = document.createElement('p');
      capNote.className = 'uv-set-note';
      capNote.style.marginTop = '10px';
      capNote.textContent = 'Coin spend cap per purchase (Coins never turn back into Units):';
      card.appendChild(capNote);

      const chips = document.createElement('div');
      chips.className = 'uv-set-chips';
      const chipEls = new Map();
      const sync = (st) => {
        for (const [cap, el] of chipEls) el.classList.toggle('on', st.spendCap === cap);
      };
      for (const cap of SPEND_CAPS) {
        const c = document.createElement('button');
        c.className = 'uv-set-chip';
        c.textContent = cap === 0 ? 'No cap' : cap + ' coins';
        c.onclick = () => {
          const saved = updateSettings(ctx, { spendCap: cap });
          if (!saved) {
            sync(s);
            settingsSaveFailed(ctx);
            return;
          }
          s = saved;
          sync(s);
          ctx.ui.toast(cap === 0 ? 'Spend cap removed' : 'Spend cap: ' + cap + ' coins 🪙');
        };
        chipEls.set(cap, c);
        chips.appendChild(c);
      }
      sync(s);
      refreshers.push(sync);
      card.appendChild(chips);
      body.appendChild(sec);
    }

    // ----- Appearance -----
    {
      const { sec, card } = section('🙂 My look', 'Default skin tone for characters that use one.');
      const wrap = document.createElement('div');
      wrap.className = 'uv-set-swatches';
      const swatches = new Map();
      const sync = (st) => {
        for (const [tone, el] of swatches) el.classList.toggle('on', st.skinTone === tone);
      };
      for (const tone of SKIN_TONES) {
        const sw = document.createElement('button');
        sw.className = 'uv-set-swatch';
        sw.style.background = tone;
        sw.setAttribute('aria-label', 'Skin tone ' + tone);
        sw.onclick = () => {
          const saved = updateSettings(ctx, { skinTone: tone });
          if (!saved) {
            sync(s);
            settingsSaveFailed(ctx);
            return;
          }
          s = saved;
          sync(s);
          ctx.ui.toast('Look saved! 🙂');
        };
        swatches.set(tone, sw);
        wrap.appendChild(sw);
      }
      sync(s);
      refreshers.push(sync);
      card.appendChild(wrap);
      body.appendChild(sec);
    }

    // ----- Reset -----
    {
      const row = document.createElement('div');
      row.className = 'uv-set-row';
      row.style.marginTop = '14px';
      row.appendChild(ctx.ui.button('Reset to defaults', async () => {
        const ok = await ctx.ui.confirm('Reset all settings back to the defaults?');
        if (!ok) return;
        const saved = updateSettings(ctx, { ...DEFAULTS });
        if (!saved) {
          for (const fn of refreshers) fn(s);
          settingsSaveFailed(ctx);
          return;
        }
        s = saved;
        ctx.ui.toast('Settings reset 🌱');
      }));
      body.appendChild(row);
    }

    // Keep controls in sync if another module changes settings while we're open.
    busHandler = (st) => {
      s = { ...DEFAULTS, ...(st || {}) };
      for (const fn of refreshers) { try { fn(s); } catch (e) { console.error('[settings] refresh', e); } }
    };
    ctx.bus.on('settings-changed', busHandler);
  },

  close() {
    if (panel) { panel.close(); panel = null; } // onClose above removes the bus listener
    else if (busHandler && bootCtx) { bootCtx.bus.off('settings-changed', busHandler); busHandler = null; }
  },
});
