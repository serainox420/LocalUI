import { scheduleFadeOut } from './fade.js';
import { normalizeTimeout } from './presentation.js';

export function createOverlayManager() {
  const notificationHost = document.createElement('div');
  notificationHost.className = 'ui-notification-host pointer-events-none fixed top-6 right-6 z-[2000] flex w-full max-w-sm flex-col gap-3';
  document.body.appendChild(notificationHost);

  const floatingLayer = document.createElement('div');
  floatingLayer.className = 'ui-floating-layer pointer-events-none fixed inset-0 z-[2050]';
  document.body.appendChild(floatingLayer);
  ensureFloatingLayerHitbox();

  const modalScrim = document.createElement('div');
  modalScrim.className = 'ui-modal-scrim fixed inset-0 z-[2100] hidden items-center justify-center p-6';
  document.body.appendChild(modalScrim);

  let modalTimer = null;

  function showNotification(content, options = {}) {
    const tone = toneFor(options.tone);
    const timeoutMs = normalizeTimeout(options.timeoutMs);
    const surface = createSurface(content, tone, {
      closable: true,
      onClose: () => surface.remove(),
    });
    surface.classList.add('ui-notification');
    notificationHost.appendChild(surface);
    scheduleFadeOut(surface, timeoutMs, () => surface.remove());
    return surface;
  }

  function showTooltip(anchor, content, options = {}) {
    return showFloating(anchor, content, options, { variant: 'tooltip', closable: false });
  }

  function showPopover(anchor, content, options = {}) {
    return showFloating(anchor, content, options, { variant: 'popover', closable: true });
  }

  function showFloating(anchor, content, options, settings) {
    const tone = toneFor(options.tone);
    const timeoutMs = normalizeTimeout(options.timeoutMs);
    const surface = createSurface(content, tone, {
      closable: settings.closable,
      onClose: () => {
        removeFloating(surface);
      },
    });
    surface.classList.add('ui-floating');
    if (settings.variant) {
      surface.dataset.variant = settings.variant;
    }

    floatingLayer.appendChild(surface);
    ensureFloatingLayerHitbox();

    requestAnimationFrame(() => {
      positionFloating(surface, anchor, settings.variant);
    });

    if (timeoutMs > 0) {
      scheduleFadeOut(surface, timeoutMs, () => {
        removeFloating(surface);
      });
    }

    return surface;
  }

  function showModal(content, options = {}) {
    const tone = toneFor(options.tone);
    const surface = createSurface(content, tone, {
      closable: true,
      onClose: closeModal,
    });
    surface.classList.add('ui-modal');
    modalScrim.replaceChildren(surface);
    modalScrim.classList.remove('hidden');
    modalScrim.classList.add('flex');
    modalScrim.addEventListener('click', (event) => {
      if (event.target === modalScrim) {
        closeModal();
      }
    }, { once: true });
    scheduleModalDismiss(normalizeTimeout(options.timeoutMs));
    return surface;
  }

  function createSurface(content, tone, options) {
    const surface = document.createElement('div');
    surface.className = 'ui-surface pointer-events-auto rounded-xl border border-slate-700 bg-slate-900/95 p-4 text-sm text-slate-200 shadow-xl backdrop-blur-lg';
    surface.dataset.tone = tone;

    const body = document.createElement('div');
    body.className = 'flex flex-col gap-3';
    if (content instanceof Node) {
      body.appendChild(content);
    } else if (typeof content === 'string') {
      body.textContent = content;
    }

    surface.appendChild(body);

    if (options.closable) {
      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.className = 'ui-button ui-button-ghost self-end';
      closeButton.textContent = 'Close';
      closeButton.addEventListener('click', () => {
        if (typeof options.onClose === 'function') {
          options.onClose();
        }
      });
      surface.appendChild(closeButton);
    }

    return surface;
  }

  function scheduleModalDismiss(timeoutMs) {
    if (modalTimer) {
      clearTimeout(modalTimer);
    }
    if (timeoutMs > 0) {
      modalTimer = setTimeout(() => {
        closeModal();
      }, timeoutMs);
    }
  }

  function closeModal() {
    if (modalTimer) {
      clearTimeout(modalTimer);
      modalTimer = null;
    }
    modalScrim.classList.add('hidden');
    modalScrim.classList.remove('flex');
    modalScrim.replaceChildren();
  }

  function positionFloating(surface, anchor, variant) {
    const reference = anchor && typeof anchor.getBoundingClientRect === 'function'
      ? anchor.getBoundingClientRect()
      : null;

    if (!reference) {
      removeFloating(surface);
      return;
    }

    const margin = 16;
    const rect = surface.getBoundingClientRect();

    let top;
    let left;
    if (variant === 'tooltip') {
      top = reference.top - rect.height - margin;
      left = reference.left + reference.width / 2 - rect.width / 2;
    } else {
      top = reference.top + reference.height + margin;
      left = reference.left + reference.width / 2 - rect.width / 2;
    }

    top = clamp(top, margin, window.innerHeight - rect.height - margin);
    left = clamp(left, margin, window.innerWidth - rect.width - margin);

    surface.style.top = `${top}px`;
    surface.style.left = `${left}px`;
  }

  function toneFor(value) {
    return ['success', 'error', 'info'].includes(value) ? value : 'info';
  }

  function removeFloating(surface) {
    if (surface && typeof surface.remove === 'function') {
      surface.remove();
    }
    ensureFloatingLayerHitbox();
  }

  function ensureFloatingLayerHitbox() {
    // Keep the floating layer transparent to pointer events so only the
    // visible surfaces receive focus and clicks. This allows the rest of the
    // UI to remain interactive when popups are present.
    floatingLayer.classList.add('pointer-events-none');
    floatingLayer.style.pointerEvents = 'none';
  }

  return { showNotification, showTooltip, showPopover, showModal };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
