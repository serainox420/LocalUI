(function () {
  const configEl = document.getElementById('app-config');
  const root = document.getElementById('app');
  if (!configEl || !root) {
    return;
  }

  let config = {};
  try {
    config = JSON.parse(configEl.textContent || '{}');
  } catch (error) {
    console.error('Invalid UI config', error);
    return;
  }

  const polls = new Map();
  const views = new Map();
  const elementIndex = new Map();
  const pendingUserActions = new Map();
  const soundCache = new Map();
  const fadeStateKey = Symbol('fadeState');
  const DEFAULT_FADE_DURATION = 400;
  const overlay = createOverlayManager();

  const globals = config.globals || {};
  const rootLayout = setupLayout(root, globals);
  const rootContext = { layout: rootLayout, globals };

  (config.elements || []).forEach((element) => {
    renderEntity(element, root, rootContext);
  });

  window.addEventListener('beforeunload', () => {
    polls.forEach((timer) => clearInterval(timer));
  });

  function markUserAction(elementId) {
    if (!elementId) {
      return;
    }
    const current = pendingUserActions.get(elementId) || 0;
    pendingUserActions.set(elementId, current + 1);
  }

  function consumeUserAction(elementId) {
    if (!elementId) {
      return false;
    }
    const current = pendingUserActions.get(elementId) || 0;
    if (current <= 0) {
      pendingUserActions.delete(elementId);
      return false;
    }
    if (current === 1) {
      pendingUserActions.delete(elementId);
    } else {
      pendingUserActions.set(elementId, current - 1);
    }
    return true;
  }

  function scheduleFadeOut(element, timeoutMs, removeFn) {
    const duration = Number(timeoutMs);
    if (!element || !Number.isFinite(duration) || duration <= 0) {
      return null;
    }
    return setTimeout(() => {
      fadeOutElement(element, removeFn);
    }, duration);
  }

  function fadeOutElement(element, removeFn) {
    if (!element) {
      if (typeof removeFn === 'function') {
        removeFn();
      }
      return;
    }

    cancelFade(element);

    const remove = typeof removeFn === 'function' ? removeFn : () => element.remove();

    if (!element.isConnected) {
      remove();
      return;
    }

    element.classList.add('ui-fadeable');
    void element.offsetWidth;
    element.classList.add('is-fading');

    let finished = false;
    let fallbackTimer = null;

    const clearState = () => {
      element.removeEventListener('transitionend', onTransitionEnd);
      if (fallbackTimer !== null) {
        clearTimeout(fallbackTimer);
      }
      delete element[fadeStateKey];
    };

    const finish = () => {
      if (finished) {
        return;
      }
      finished = true;
      clearState();
      remove();
    };

    const onTransitionEnd = (event) => {
      if (event.target !== element || event.propertyName !== 'opacity') {
        return;
      }
      finish();
    };

    element.addEventListener('transitionend', onTransitionEnd);

    const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element);
    const variableDuration = Number.parseFloat(style?.getPropertyValue('--ui-fade-duration'));
    const fallbackDuration = Number.isFinite(variableDuration) ? variableDuration : DEFAULT_FADE_DURATION;
    fallbackTimer = setTimeout(finish, fallbackDuration + 100);

    element[fadeStateKey] = {
      cancel() {
        if (finished) {
          return;
        }
        clearState();
        element.classList.remove('is-fading');
      },
    };
  }

  function cancelFade(element) {
    if (!element) {
      return;
    }
    const state = element[fadeStateKey];
    if (state && typeof state.cancel === 'function') {
      state.cancel();
    }
  }

  function playElementSound(element, ...variants) {
    if (!element) {
      return;
    }
    const source = resolveSoundSource(element.sound, variants);
    if (!source) {
      return;
    }
    playSoundFile(source);
  }

  function resolveSoundSource(config, variants = []) {
    if (!config) {
      return null;
    }
    if (typeof config === 'string') {
      const trimmed = config.trim();
      return trimmed || null;
    }
    if (typeof config !== 'object') {
      return null;
    }
    const queue = [];
    if (Array.isArray(variants)) {
      variants.forEach((key) => {
        if (typeof key === 'string' && key && !queue.includes(key)) {
          queue.push(key);
        }
      });
    }
    if (!queue.includes('default')) {
      queue.push('default');
    }
    for (const key of queue) {
      const value = config[key];
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
    return null;
  }

  function playSoundFile(filename) {
    const sanitized = String(filename || '').trim();
    if (!sanitized || typeof Audio !== 'function') {
      return;
    }
    const src = `/sound/${encodeURIComponent(sanitized)}`;
    let base = soundCache.get(src);
    if (!base) {
      base = new Audio(src);
      base.preload = 'auto';
      soundCache.set(src, base);
    }
    const instance = base.cloneNode(true);
    instance.preload = 'auto';
    instance.src = base.src;
    instance.currentTime = 0;
    instance.play().catch((error) => {
      console.warn('Unable to play sound', sanitized, error);
    });
  }

  function normalizeLayout(value) {
    return value === 'grid' ? 'grid' : 'stack';
  }

  function setupLayout(container, globals = {}) {
    container.className = '';
    const theme = globals.theme || {};
    const layout = normalizeLayout(theme.layout);
    const gap = theme.gap ?? 8;
    const margin = theme.margins ?? 12;

    if (layout === 'grid') {
      container.classList.add('grid', 'auto-rows-min', 'sm:grid-cols-2', 'xl:grid-cols-12');
    } else {
      container.classList.add('flex', 'flex-col');
    }
    container.dataset.layout = layout;
    container.style.gap = `${gap}px`;
    container.style.padding = `${margin}px`;
    return layout;
  }

  function renderEntity(entity, container, context) {
    if (!entity || typeof entity !== 'object') {
      return;
    }

    if (entity.id) {
      elementIndex.set(entity.id, entity);
    }

    const parentLayout = context?.layout || 'grid';

    if (entity.type === 'group') {
      const group = buildGroup(entity, context);
      applyPlacement(group.node, entity, parentLayout);
      container.appendChild(group.node);
      const nextContext = { layout: group.layout, globals: context?.globals };
      (entity.elements || []).forEach((child) => {
        renderEntity(child, group.body, nextContext);
      });
      return;
    }

    const card = buildCard(entity);
    applyPlacement(card, entity, parentLayout);
    container.appendChild(card);
    activateElement(entity);
  }

  function buildGroup(group, context) {
    const section = document.createElement('section');
    section.dataset.groupId = group.id;
    section.className = 'component-group flex flex-col gap-4';
    if (group.classes) {
      section.className += ` ${group.classes}`;
    }

    let pane = false;
    if (typeof group.border === 'string' && group.border.trim() !== '') {
      section.style.border = group.border.trim();
      pane = true;
    } else if (group.border) {
      pane = true;
    } else if (group.border === false) {
      section.style.border = 'none';
    }
    if (pane) {
      section.classList.add('component-group-pane');
    }

    if (group.background) {
      section.style.background = group.background;
    }
    if (group.font) {
      section.style.fontFamily = group.font;
    }
    if (group.color) {
      section.style.color = group.color;
    }

    if (group.label) {
      const header = document.createElement('header');
      header.className = 'component-group-header';
      header.textContent = group.label;
      section.appendChild(header);
    }

    const body = document.createElement('div');
    body.className = 'component-group-body';
    const layout = normalizeLayout(group.layout);
    body.dataset.layout = layout;

    if (layout === 'grid') {
      body.classList.add('grid', 'auto-rows-min');
      const columns = Math.max(1, Number(group.columns) || 0);
      body.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    } else {
      body.classList.add('flex', 'flex-col');
    }

    const gapSource = group.gap ?? context?.globals?.theme?.gap ?? 8;
    const gapValue = Number(gapSource);
    if (Number.isFinite(gapValue)) {
      body.style.gap = `${gapValue}px`;
    }

    section.appendChild(body);
    return { node: section, body, layout };
  }

  function applyPlacement(node, item, parentLayout) {
    if (!node || !item || parentLayout !== 'grid') {
      if (node) {
        node.style.removeProperty('grid-column-start');
        node.style.removeProperty('grid-column-end');
        node.style.removeProperty('grid-row-start');
        node.style.removeProperty('grid-row-end');
      }
      return;
    }

    const spanW = Math.max(1, Number(item.w) || 0);
    const spanH = Math.max(1, Number(item.h) || 0);
    node.style.gridColumnEnd = `span ${spanW}`;
    node.style.gridRowEnd = `span ${spanH}`;

    const column = Number(item.x);
    if (item.x != null && Number.isFinite(column)) {
      node.style.gridColumnStart = column + 1;
    } else {
      node.style.removeProperty('grid-column-start');
    }

    const row = Number(item.y);
    if (item.y != null && Number.isFinite(row)) {
      node.style.gridRowStart = row + 1;
    } else {
      node.style.removeProperty('grid-row-start');
    }
  }

  function activateElement(element) {
    hydrate(element.id);

    if (element.type === 'output' && element.mode === 'poll' && element.command?.server) {
      const interval = Number(element.intervalMs) || 5000;
      if (polls.has(element.id)) {
        clearInterval(polls.get(element.id));
      }
      const timer = setInterval(() => {
        runServerCommand(element.id, element.command.server, { value: element.value });
      }, interval);
      polls.set(element.id, timer);
      runServerCommand(element.id, element.command.server, { value: element.value });
    }
  }

  function buildCard(element) {
    const section = document.createElement('section');
    section.dataset.elementId = element.id;
    section.className = 'component-card flex flex-col gap-4 p-5 text-sm text-slate-200';
    if (element.classes) {
      section.className += ` ${element.classes}`;
    }
    if (element.bg) section.style.backgroundColor = element.bg;
    if (element.color) section.style.color = element.color;
    if (element.font) section.style.fontFamily = element.font;
    if (element.tooltip) section.title = element.tooltip;

    const header = document.createElement('header');
    header.className = 'text-xs font-semibold uppercase tracking-[0.18em] text-slate-400';
    header.textContent = element.label || element.id;
    section.appendChild(header);

    const body = document.createElement('div');
    body.className = 'flex flex-col gap-3 text-sm';
    section.appendChild(body);

    let anchor = null;
    switch (element.type) {
      case 'button':
        anchor = renderButton(element, body);
        break;
      case 'toggle':
        anchor = renderToggle(element, body);
        break;
      case 'stepper':
        anchor = renderStepper(element, body);
        break;
      case 'input':
        anchor = renderInput(element, body);
        break;
      case 'output':
        anchor = renderOutput(element, body);
        break;
      default:
        body.textContent = `Unsupported type: ${element.type}`;
    }

    const view = createResultView(element, section, anchor || body);
    views.set(element.id, view);

    return section;
  }

  function createResultView(element, section, anchor) {
    const presentation = normalizePresentation(element.presentation);
    const timeoutMs = normalizeTimeout(element.timeoutMs);
    const host = anchor || section;

    if (presentation === 'inline') {
      return createInlineResultView(section, timeoutMs);
    }

    return createOverlayResultView(presentation, host, timeoutMs);
  }

  function normalizePresentation(value) {
    const modes = ['inline', 'tooltip', 'notification', 'popover', 'modal'];
    return modes.includes(value) ? value : 'inline';
  }

  function normalizeTimeout(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      return 5000;
    }
    return numeric;
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

  function createOverlayResultView(presentation, host, timeoutMs) {
    return {
      showResult(payload) {
        const description = describeResult(payload);
        const content = buildFloatingContent(description);
        presentFloating(presentation, host, content, description.tone, timeoutMs);
      },
      showError(message) {
        const description = describeError(message);
        const content = buildFloatingContent(description);
        presentFloating(presentation, host, content, 'error', timeoutMs);
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

  function presentFloating(presentation, host, content, tone, timeoutMs) {
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

  function createOverlayManager() {
    const notificationHost = document.createElement('div');
    notificationHost.className = 'ui-notification-host pointer-events-none fixed top-6 right-6 z-[2000] flex w-full max-w-sm flex-col gap-3';
    document.body.appendChild(notificationHost);

    const floatingLayer = document.createElement('div');
    floatingLayer.className = 'ui-floating-layer pointer-events-none fixed inset-0 z-[2050]';
    document.body.appendChild(floatingLayer);

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
        onClose: () => surface.remove(),
      });
      surface.classList.add('ui-floating', `ui-floating-${settings.variant}`);
      floatingLayer.appendChild(surface);
      requestAnimationFrame(() => positionFloating(surface, anchor, settings.variant));
      scheduleFadeOut(surface, timeoutMs, () => surface.remove());
      return surface;
    }

    function showModal(content, options = {}) {
      const tone = toneFor(options.tone);
      const timeoutMs = normalizeTimeout(options.timeoutMs);
      closeModal();
      modalScrim.innerHTML = '';
      const surface = createSurface(content, tone, {
        closable: true,
        onClose: () => closeModal(),
      });
      surface.classList.add('ui-modal-panel');
      modalScrim.appendChild(surface);
      modalScrim.classList.remove('hidden');
      scheduleModalDismiss(timeoutMs);
      return surface;
    }

    function createSurface(content, tone, options) {
      const surface = document.createElement('div');
      surface.className = `ui-surface ui-tone-${tone}`;
      surface.classList.add('ui-fadeable');
      surface.tabIndex = -1;

      const body = document.createElement('div');
      body.className = 'ui-surface-body';
      body.appendChild(content);
      surface.appendChild(body);

      if (options?.closable) {
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'ui-surface-close';
        close.setAttribute('aria-label', 'Close');
        close.innerHTML = '&times;';
        close.addEventListener('click', (event) => {
          event.stopPropagation();
          cancelFade(surface);
          if (typeof options.onClose === 'function') {
            options.onClose();
          }
        });
        surface.appendChild(close);
      }

      return surface;
    }

    function scheduleModalDismiss(timeoutMs) {
      clearTimeout(modalTimer);
      if (timeoutMs <= 0) {
        return;
      }
      modalTimer = setTimeout(() => {
        const surface = modalScrim.querySelector('.ui-surface');
        if (surface) {
          fadeOutElement(surface, () => closeModal());
        } else {
          closeModal();
        }
      }, timeoutMs);
    }

    function closeModal() {
      clearTimeout(modalTimer);
      modalTimer = null;
      const surface = modalScrim.querySelector('.ui-surface');
      if (surface) {
        cancelFade(surface);
      }
      modalScrim.classList.add('hidden');
      modalScrim.innerHTML = '';
    }

    modalScrim.addEventListener('click', (event) => {
      if (event.target === modalScrim) {
        closeModal();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !modalScrim.classList.contains('hidden')) {
        closeModal();
      }
    });

    function positionFloating(surface, anchor, variant) {
      const reference = anchor && typeof anchor.getBoundingClientRect === 'function'
        ? anchor.getBoundingClientRect()
        : new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 0, 0);
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

    return { showNotification, showTooltip, showPopover, showModal };
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function renderButton(element, container) {
    const button = makeButton(element.label || 'Run');
    container.appendChild(button);

    button.addEventListener('click', async () => {
      playElementSound(element, 'interaction');
      try {
        if (element.command?.server) {
          await runServerCommand(element.id, element.command.server, {}, { userTriggered: true });
        }
        if (element.command?.client?.script) {
          executeClientScript(element, element.command.client.script);
        }
      } catch (error) {
        // already shown to user
      }
    });

    return button;
  }

  function renderToggle(element, container) {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-3 text-sm text-slate-200';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(element.initial);
    input.className = 'h-5 w-5 rounded border-slate-600 bg-slate-900/40 text-[var(--accent-color)] focus:ring-[var(--accent-color)] focus:ring-2 focus:ring-offset-0';

    const label = document.createElement('span');
    label.textContent = input.checked ? 'On' : 'Off';
    label.className = 'text-sm text-slate-200';

    row.appendChild(input);
    row.appendChild(label);
    container.appendChild(row);

    input.addEventListener('change', async () => {
      const nextState = input.checked;
      const command = nextState ? element.onCommand?.server : element.offCommand?.server;
      label.textContent = nextState ? 'On' : 'Off';
      playElementSound(element, nextState ? 'on' : 'off', 'interaction');
      if (!command) {
        return;
      }
      input.disabled = true;
      try {
        await runServerCommand(element.id, command, { value: nextState }, { userTriggered: true });
      } catch (error) {
        input.checked = !input.checked;
        label.textContent = input.checked ? 'On' : 'Off';
      } finally {
        input.disabled = false;
      }
    });

    return row;
  }

  function renderStepper(element, container) {
    const row = document.createElement('div');
    row.className = 'flex flex-wrap items-center gap-3 text-sm text-slate-200';

    const minus = makeButton('−', true);
    const plus = makeButton('+', true);
    const input = document.createElement('input');
    input.type = 'number';
    input.value = Number(element.value ?? element.min ?? 0);
    if (element.min !== undefined) input.min = element.min;
    if (element.max !== undefined) input.max = element.max;
    if (element.step !== undefined) input.step = element.step;
    input.className = 'w-24 rounded-xl border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0';

    const apply = makeButton('Apply');

    minus.addEventListener('click', () => {
      playElementSound(element, 'decrement', 'interaction');
      adjust(-1);
    });
    plus.addEventListener('click', () => {
      playElementSound(element, 'increment', 'interaction');
      adjust(1);
    });
    apply.addEventListener('click', async () => {
      playElementSound(element, 'interaction');
      if (!element.command?.server) {
        return;
      }
      try {
        await runServerCommand(element.id, element.command.server, { value: Number(input.value) }, { userTriggered: true });
      } catch (error) {
        // shown already
      }
    });

    row.appendChild(minus);
    row.appendChild(input);
    row.appendChild(plus);
    row.appendChild(apply);
    container.appendChild(row);

    function adjust(direction) {
      const step = Number(element.step ?? 1);
      const current = Number(input.value || 0);
      let next = current + direction * step;
      if (element.min !== undefined) next = Math.max(next, Number(element.min));
      if (element.max !== undefined) next = Math.min(next, Number(element.max));
      input.value = String(next);
    }

    return apply;
  }

  function renderInput(element, container) {
    const field = document.createElement('input');
    field.className = 'w-full rounded-xl border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-[var(--accent-color)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-0 placeholder-slate-500';
    field.type = element.inputType === 'int' ? 'number' : 'text';

    const row = document.createElement('div');
    row.className = 'flex flex-col gap-3 text-sm text-slate-200 sm:flex-row sm:items-center';

    const button = makeButton(element.apply?.label || 'Apply');

    row.appendChild(field);
    row.appendChild(button);
    container.appendChild(row);

    button.addEventListener('click', async () => {
      playElementSound(element, 'interaction');
      if (!element.apply?.command?.server) {
        return;
      }
      let value = field.value;
      if (element.inputType === 'int') {
        value = Number(value);
      } else if (element.inputType === 'bool') {
        value = value === 'true' || value === '1' || value === 'on';
      }
      try {
        await runServerCommand(element.id, element.apply.command.server, { value }, { userTriggered: true });
      } catch (error) {
        // shown already
      }
    });

    return button;
  }

  function renderOutput(element, container) {
    if (element.mode === 'manual') {
      const button = makeButton(element.onDemandButtonLabel || 'Refresh');
      container.appendChild(button);
      button.addEventListener('click', async () => {
        playElementSound(element, 'interaction');
        if (!element.command?.server) {
          return;
        }
        try {
          await runServerCommand(element.id, element.command.server, {}, { userTriggered: true });
        } catch (error) {
          // shown already
        }
      });
      return button;
    } else {
      const note = document.createElement('p');
      note.className = 'text-xs text-slate-400';
      note.textContent = `Polling every ${Math.max(Number(element.intervalMs) || 0, 1)} ms`;
      container.appendChild(note);
      return note;
    }
  }

  function makeButton(label, ghost) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = ghost ? 'ui-button ui-button-ghost' : 'ui-button ui-button-primary';
    button.textContent = label;
    return button;
  }

  async function runServerCommand(elementId, command, args, options = {}) {
    if (options?.userTriggered) {
      markUserAction(elementId);
    }

    if (!command?.id) {
      showError(elementId, 'Command id missing');
      throw new Error('Command id missing');
    }

    const payload = {
      id: elementId,
      commandId: command.id,
      args: args || {},
    };

    let response;
    try {
      response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      showError(elementId, error.message);
      throw error;
    }

    if (!response.ok) {
      const message = await parseError(response);
      showError(elementId, message);
      throw new Error(message);
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      showError(elementId, error instanceof Error ? error.message : 'Invalid response');
      throw error;
    }
    applyResult(elementId, data);
    return data;
  }

  async function parseError(response) {
    try {
      const data = await response.json();
      return data.error || response.statusText;
    } catch (error) {
      return response.statusText;
    }
  }

  async function hydrate(elementId) {
    try {
      const response = await fetch(`/api/read?id=${encodeURIComponent(elementId)}`);
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      applyResult(elementId, data);
    } catch (error) {
      console.warn('hydrate failed', elementId, error);
    }
  }

  function applyResult(elementId, payload) {
    const view = views.get(elementId);
    if (!view) {
      consumeUserAction(elementId);
      return;
    }
    if (!payload || !payload.result) {
      consumeUserAction(elementId);
      return;
    }
    view.showResult(payload);
    const hadPending = consumeUserAction(elementId);
    if (hadPending && payload.result.ok === false) {
      const element = elementIndex.get(elementId);
      playElementSound(element, 'error');
    }
  }

  function safeDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString();
  }

  function showError(elementId, message) {
    const view = views.get(elementId);
    if (!view) {
      consumeUserAction(elementId);
      return;
    }
    view.showError(message);
    if (consumeUserAction(elementId)) {
      const element = elementIndex.get(elementId);
      playElementSound(element, 'error');
    }
  }

  function executeClientScript(element, script) {
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('element', script);
      fn(element);
    } catch (error) {
      showError(element.id, error.message);
    }
  }
})();
