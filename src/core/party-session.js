const CSS = `
.ps-objective{position:fixed;left:50%;top:72px;z-index:54;width:min(330px,calc(100vw - 32px));
  padding:12px 14px;border:1px solid rgba(221,212,198,.9);border-radius:16px;
  background:rgba(251,248,242,.94);box-shadow:0 8px 24px rgba(60,50,35,.16);
  color:#2a2724;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;
  pointer-events:none;transform:translateX(-50%);transition:opacity .2s ease,transform .2s ease}
.ps-objective.is-leaving{opacity:0;transform:translate(-50%,-6px)}
.ps-objective-head{display:flex;gap:8px;align-items:center;margin-bottom:4px;font-size:14px;font-weight:850}
.ps-objective-kicker{font-size:10px;font-weight:850;letter-spacing:.1em;text-transform:uppercase;color:#8a6fb0}
.ps-objective-copy{font-size:13px;font-weight:700;line-height:1.35}
.ps-objective-controls{margin-top:5px;color:#655f58;font-size:11px;line-height:1.35}
.ps-result-hero{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;align-items:center;margin:2px 0 14px}
.ps-result-icon{grid-row:1 / 3;font-size:38px;line-height:1}
.ps-result-outcome{font-size:20px;font-weight:850;letter-spacing:-.02em}
.ps-result-summary{color:#655f58;line-height:1.45}
.ps-result-note{display:inline-flex;margin:0 0 14px}
.ps-result-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:14px}
.ps-result-stat{padding:10px 12px;border:1px solid #ddd4c6;border-radius:14px;background:#f4efe7}
.ps-result-stat span{display:block;color:#7a736a;font-size:10px;font-weight:850;letter-spacing:.06em;text-transform:uppercase}
.ps-result-stat strong{display:block;margin-top:3px;font-size:16px}
.ps-result-details{margin-bottom:14px}
.ps-result-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.ps-result-actions .uv-btn{width:100%}
@media(max-width:620px){
  .ps-objective{left:calc(env(safe-area-inset-left) + 10px);top:calc(env(safe-area-inset-top) + 148px);width:calc(100vw - env(safe-area-inset-left) - env(safe-area-inset-right) - 20px);padding:8px 10px;transform:none}
  .ps-objective.is-leaving{transform:translateY(-6px)}
  .ps-objective-head{gap:6px;margin-bottom:2px;font-size:13px}
  .ps-objective-copy{font-size:12px}
  .ps-objective-controls{margin-top:3px;font-size:10px}
  .ps-result-stats,.ps-result-actions{grid-template-columns:1fr}
}
@media(prefers-reduced-motion:reduce){.ps-objective{transition:none}}
`;

let injected = false;

function inject() {
  if (injected) return;
  injected = true;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
}

export function createPartySession(ctx) {
  inject();

  return {
    objective({
      icon = '🎮',
      title,
      objective,
      controls,
      kicker = 'Round objective',
      duration = 6500,
    }) {
      const el = document.createElement('section');
      el.className = 'ps-objective';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');

      const head = document.createElement('div');
      head.className = 'ps-objective-head';
      const iconEl = document.createElement('span');
      iconEl.setAttribute('aria-hidden', 'true');
      iconEl.textContent = icon;
      const heading = document.createElement('div');
      const kickerEl = document.createElement('div');
      kickerEl.className = 'ps-objective-kicker';
      kickerEl.textContent = kicker;
      const titleEl = document.createElement('div');
      titleEl.textContent = title;
      heading.append(kickerEl, titleEl);
      head.append(iconEl, heading);

      const copy = document.createElement('div');
      copy.className = 'ps-objective-copy';
      copy.textContent = objective;
      el.append(head, copy);
      if (controls) {
        const controlsEl = document.createElement('div');
        controlsEl.className = 'ps-objective-controls';
        controlsEl.textContent = controls;
        el.appendChild(controlsEl);
      }
      document.body.appendChild(el);

      let closed = false;
      let removeTimer = 0;
      const fadeTimer = window.setTimeout(() => {
        el.classList.add('is-leaving');
        removeTimer = window.setTimeout(() => el.remove(), 240);
      }, duration);
      return {
        el,
        close() {
          if (closed) return;
          closed = true;
          clearTimeout(fadeTimer);
          clearTimeout(removeTimer);
          el.remove();
        },
      };
    },

    result({
      title,
      icon = '🏁',
      outcome,
      summary,
      stats = [],
      note = 'Local practice',
      details = null,
      replayLabel = 'Play Again',
      homeLabel = 'Return to Skypark',
      onReplay = null,
      onHome,
    }) {
      let active = true;
      let action = 'home';
      const panel = ctx.ui.panel({
        title,
        closeLabel: homeLabel,
        onClose: () => {
          if (!active) return;
          active = false;
          if (action === 'replay' && onReplay) onReplay();
          else onHome?.();
        },
      });

      const hero = document.createElement('div');
      hero.className = 'ps-result-hero';
      const iconEl = document.createElement('div');
      iconEl.className = 'ps-result-icon';
      iconEl.setAttribute('aria-hidden', 'true');
      iconEl.textContent = icon;
      const outcomeEl = document.createElement('div');
      outcomeEl.className = 'ps-result-outcome';
      outcomeEl.textContent = outcome;
      const summaryEl = document.createElement('div');
      summaryEl.className = 'ps-result-summary';
      summaryEl.textContent = summary;
      hero.append(iconEl, outcomeEl, summaryEl);
      panel.body.appendChild(hero);

      if (note) {
        const noteEl = document.createElement('div');
        noteEl.className = 'uv-chip ps-result-note';
        noteEl.textContent = note;
        panel.body.appendChild(noteEl);
      }

      if (stats.length) {
        const statsEl = document.createElement('div');
        statsEl.className = 'ps-result-stats';
        for (const { label, value } of stats) {
          const stat = document.createElement('div');
          stat.className = 'ps-result-stat';
          const labelEl = document.createElement('span');
          labelEl.textContent = label;
          const valueEl = document.createElement('strong');
          valueEl.textContent = value;
          stat.append(labelEl, valueEl);
          statsEl.appendChild(stat);
        }
        panel.body.appendChild(statsEl);
      }

      if (details) {
        const detailsEl = document.createElement('div');
        detailsEl.className = 'ps-result-details';
        detailsEl.appendChild(details);
        panel.body.appendChild(detailsEl);
      }

      const actions = document.createElement('div');
      actions.className = 'ps-result-actions';
      let replayButton = null;
      if (onReplay) {
        replayButton = ctx.ui.button(replayLabel, () => {
          action = 'replay';
          panel.close();
        }, { primary: true });
        actions.appendChild(replayButton);
      }
      const homeButton = ctx.ui.button(homeLabel, () => {
        action = 'home';
        panel.close();
      }, { primary: !onReplay });
      actions.appendChild(homeButton);
      panel.body.appendChild(actions);

      queueMicrotask(() => {
        const preferred = replayButton || homeButton;
        if (active && preferred.isConnected) preferred.focus();
      });

      return {
        el: panel.el,
        body: panel.body,
        close: panel.close,
        destroy() {
          if (!active) return;
          active = false;
          panel.close();
        },
      };
    },
  };
}
