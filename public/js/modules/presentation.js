import { cancelFade, scheduleFadeOut } from './fade.js';

export function createResultViewFactory(overlay) {
  return function createResultView(element, section, anchor) {
    const presentation = normalizePresentation(element.presentation);
    const timeoutMs = normalizeTimeout(element.timeoutMs);
    const host = anchor || section;

    if (presentation === 'inline') {
      return createInlineResultView(section, timeoutMs);
    }

    return createOverlayResultView(presentation, host, timeoutMs, overlay);
  };
}

export function normalizeTimeout(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 5000;
  }
  return numeric;
}

function normalizePresentation(value) {
  const modes = ['inline', 'tooltip', 'notification', 'popover', 'modal'];
  return modes.includes(value) ? value : 'inline';
}

function createInlineResultView(section, timeoutMs) {
  let wrapper = null;
  let hideTimer = null;

  function ensureWrapper() {
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'result-inline flex flex-col gap-3 text-xs text-slate-300';
      wrapper.classList.add('ui-fadeable');
    }
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    cancelFade(wrapper);
    wrapper.classList.remove('is-fading');
    if (!wrapper.isConnected) {
      section.appendChild(wrapper);
    }
  }

  function scheduleHide() {
    if (timeoutMs <= 0 || !wrapper) {
      return;
    }
    if (hideTimer) {
      clearTimeout(hideTimer);
    }
    hideTimer = scheduleFadeOut(wrapper, timeoutMs, () => {
      if (wrapper) {
        wrapper.remove();
      }
      hideTimer = null;
    });
  }

  function render(description) {
    ensureWrapper();
    wrapper.replaceChildren(composeResultFragment(description));
    scheduleHide();
  }

  return {
    showResult(payload) {
      render(describeResult(payload));
    },
    showError(message) {
      render(describeError(message));
    },
  };
}

function createOverlayResultView(presentation, host, timeoutMs, overlay) {
  return {
    showResult(payload) {
      const description = describeResult(payload);
      const content = buildFloatingContent(description);
      presentFloating(overlay, presentation, host, content, description.tone, timeoutMs);
    },
    showError(message) {
      const description = describeError(message);
      const content = buildFloatingContent(description);
      presentFloating(overlay, presentation, host, content, 'error', timeoutMs);
    },
  };
}

function buildFloatingContent(description) {
  const container = document.createElement('div');
  container.className = 'flex flex-col gap-3';
  container.appendChild(composeResultFragment(description));
  return container;
}

function composeResultFragment(description) {
  const fragment = document.createDocumentFragment();

  const status = document.createElement('div');
  status.className = `text-xs font-semibold tracking-wide ${description.statusClass}`;
  status.textContent = description.statusText;
  fragment.appendChild(status);

  if (description.stdout) {
    const stdout = document.createElement('pre');
    stdout.className = 'result-block';
    stdout.textContent = description.stdout;
    fragment.appendChild(stdout);
  }

  if (description.stderr) {
    const stderr = document.createElement('pre');
    stderr.className = 'result-block result-block-error';
    stderr.textContent = description.stderr;
    fragment.appendChild(stderr);
  }

  if (description.errorText) {
    const error = document.createElement('div');
    error.className = 'result-error';
    error.textContent = description.errorText;
    fragment.appendChild(error);
  }

  return fragment;
}

function describeResult(payload) {
  const result = payload?.result || {};
  const ok = Boolean(result.ok);
  const code = result.code ?? '0';
  const stdout = (result.stdout || '').trimEnd();
  const stderr = (result.stderr || '').trimEnd();
  const when = result.ts ? safeDate(result.ts) : '';
  const prefix = ok ? 'OK' : 'Error';
  const statusText = when ? `${prefix} • exit ${code} • ${when}` : `${prefix} • exit ${code}`;
  return {
    statusText,
    statusClass: ok ? 'text-emerald-400' : 'text-rose-400',
    stdout,
    stderr,
    errorText: '',
    tone: ok ? 'success' : 'error',
  };
}

function describeError(message) {
  return {
    statusText: 'Execution failed',
    statusClass: 'text-rose-400',
    stdout: '',
    stderr: '',
    errorText: message,
    tone: 'error',
  };
}

function presentFloating(overlay, presentation, host, content, tone, timeoutMs) {
  switch (presentation) {
    case 'tooltip':
      overlay.showTooltip(host, content, { timeoutMs, tone });
      break;
    case 'notification':
      overlay.showNotification(content, { timeoutMs, tone });
      break;
    case 'popover':
      overlay.showPopover(host, content, { timeoutMs, tone });
      break;
    case 'modal':
      overlay.showModal(content, { timeoutMs, tone });
      break;
    default:
      overlay.showNotification(content, { timeoutMs, tone });
      break;
  }
}

function safeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}
