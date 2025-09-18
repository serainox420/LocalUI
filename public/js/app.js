(function () {
  const configEl = document.getElementById('app-config');
  const appRoot = document.getElementById('app');
  if (!configEl || !appRoot) {
    return;
  }

  let config;
  try {
    config = JSON.parse(configEl.textContent || '{}');
  } catch (err) {
    console.error('Failed to parse UI config', err);
    return;
  }

  const state = {
    config,
    views: {},
    polling: {},
    results: {},
  };

  setupLayout(appRoot, config.globals || {});

  (config.elements || []).forEach((element) => {
    try {
      renderElement(element);
      hydrateLastResult(element.id);
    } catch (err) {
      console.error('Failed to render element', element, err);
    }
  });

  window.addEventListener('beforeunload', () => {
    Object.values(state.polling).forEach((intervalId) => clearInterval(intervalId));
  });

  function setupLayout(root, globals) {
    root.className = '';
    const layout = (globals.theme && globals.theme.layout) || 'grid';
    const gap = (globals.theme && globals.theme.gap) || 8;
    const margins = (globals.theme && globals.theme.margins) || 12;

    if (layout === 'grid') {
      root.classList.add('grid', 'grid-cols-1', 'md:grid-cols-12', 'auto-rows-min');
    } else {
      root.classList.add('flex', 'flex-col');
    }
    root.classList.add('min-h-screen', 'box-border');
    root.style.padding = `${margins}px`;
    root.style.gap = `${gap}px`;
  }

  function renderElement(element) {
    const card = document.createElement('div');
    card.dataset.elementId = element.id;
    card.className = 'component-card bg-white/90 shadow-sm rounded-lg border border-slate-200 p-4 flex flex-col space-y-3 transition-all duration-150';
    card.className += element.classes ? ` ${element.classes}` : '';
    card.style.gridColumn = `span ${element.w || 12} / span ${element.w || 12}`;
    card.style.gridRow = `span ${element.h || 1} / span ${element.h || 1}`;
    if (element.bg) {
      card.style.backgroundColor = element.bg;
    }
    if (element.color) {
      card.style.color = element.color;
    }
    if (element.font) {
      card.style.fontFamily = element.font;
    }
    if (element.tooltip) {
      card.title = element.tooltip;
    }

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between';
    const title = document.createElement('h2');
    title.className = 'text-sm font-semibold tracking-wide text-slate-700 uppercase';
    title.textContent = element.label || element.id;
    header.appendChild(title);
    card.appendChild(header);

    const body = document.createElement('div');
    body.className = 'flex flex-col gap-3 text-sm text-slate-700';
    card.appendChild(body);

    const view = attachResultView(card);
    state.views[element.id] = view;

    switch (element.type) {
      case 'button':
        renderButton(element, body);
        break;
      case 'toggle':
        renderToggle(element, body);
        break;
      case 'stepper':
        renderStepper(element, body);
        break;
      case 'input':
        renderInput(element, body);
        break;
      case 'output':
        renderOutput(element, body);
        break;
      default:
        body.textContent = `Unsupported element type: ${element.type}`;
    }

    appRoot.appendChild(card);
  }

  function attachResultView(card) {
    const wrapper = document.createElement('div');
    wrapper.className = 'space-y-2 text-xs text-slate-600 hidden';

    const meta = document.createElement('div');
    meta.className = 'text-xs text-slate-500';
    wrapper.appendChild(meta);

    const stdout = document.createElement('pre');
    stdout.className = 'bg-slate-900/95 text-slate-100 p-3 rounded-md overflow-auto max-h-64 whitespace-pre-wrap break-words text-xs';
    wrapper.appendChild(stdout);

    const stderr = document.createElement('pre');
    stderr.className = 'bg-red-900/90 text-red-100 p-3 rounded-md overflow-auto max-h-48 whitespace-pre-wrap break-words text-xs hidden';
    wrapper.appendChild(stderr);

    card.appendChild(wrapper);

    return { wrapper, meta, stdout, stderr };
  }

  function renderButton(element, container) {
    const button = createButton(element.label || 'Run', 'primary');
    container.appendChild(button);

    button.addEventListener('click', async () => {
      if (element.command && element.command.server) {
        await executeServerCommand(element.id, element.command.server, button);
      }
      if (element.command && element.command.client && element.command.client.script) {
        runClientScript(element, element.command.client.script);
      }
    });
  }

  function renderToggle(element, container) {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between gap-3';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!element.initial;
    checkbox.className = 'h-5 w-5 text-[var(--accent-color)] focus:ring-[var(--accent-color)] border-slate-300 rounded';

    const status = document.createElement('span');
    status.className = 'text-sm font-medium text-slate-600';
    status.textContent = checkbox.checked ? 'On' : 'Off';

    row.appendChild(checkbox);
    row.appendChild(status);
    container.appendChild(row);

    checkbox.addEventListener('change', async () => {
      status.textContent = checkbox.checked ? 'On' : 'Off';
      const command = checkbox.checked ? element.onCommand?.server : element.offCommand?.server;
      if (!command) {
        return;
      }
      try {
        checkbox.disabled = true;
        await executeServerCommand(element.id, command, null, { value: checkbox.checked });
      } catch (err) {
        checkbox.checked = !checkbox.checked;
        status.textContent = checkbox.checked ? 'On' : 'Off';
        showError(element.id, err.message);
      } finally {
        checkbox.disabled = false;
      }
    });
  }

  function renderStepper(element, container) {
    const wrap = document.createElement('div');
    wrap.className = 'flex items-center gap-2';

    const minus = createButton('−', 'secondary');
    minus.classList.add('w-10');
    const plus = createButton('+', 'secondary');
    plus.classList.add('w-10');

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'w-24 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[var(--accent-color)] focus:ring-[var(--accent-color)]';
    input.min = element.min;
    input.max = element.max;
    input.step = element.step;
    input.value = element.value;

    const apply = createButton('Apply', 'primary');

    wrap.appendChild(minus);
    wrap.appendChild(input);
    wrap.appendChild(plus);
    wrap.appendChild(apply);
    container.appendChild(wrap);

    const clamp = (value) => {
      const min = Number(element.min);
      const max = Number(element.max);
      const step = Number(element.step) || 1;
      let next = Number.isFinite(value) ? value : min;
      if (next < min) next = min;
      if (next > max) next = max;
      next = Math.round(next / step) * step;
      if (next < min) next = min;
      if (next > max) next = max;
      return next;
    };

    const triggerCommand = async (value) => {
      if (!element.command || !element.command.server) {
        return;
      }
      await executeServerCommand(element.id, element.command.server, apply, { value });
    };

    minus.addEventListener('click', () => {
      const current = Number(input.value);
      const next = clamp(current - (Number(element.step) || 1));
      input.value = next;
      triggerCommand(next).catch((err) => showError(element.id, err.message));
    });

    plus.addEventListener('click', () => {
      const current = Number(input.value);
      const next = clamp(current + (Number(element.step) || 1));
      input.value = next;
      triggerCommand(next).catch((err) => showError(element.id, err.message));
    });

    apply.addEventListener('click', () => {
      const next = clamp(Number(input.value));
      input.value = next;
      triggerCommand(next).catch((err) => showError(element.id, err.message));
    });

    input.addEventListener('change', () => {
      const next = clamp(Number(input.value));
      input.value = next;
    });
  }

  function renderInput(element, container) {
    const wrap = document.createElement('div');
    wrap.className = 'flex flex-col gap-2';

    let inputControl;
    let valueGetter;

    switch (element.inputType) {
      case 'int':
        inputControl = document.createElement('input');
        inputControl.type = 'number';
        inputControl.className = 'rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[var(--accent-color)] focus:ring-[var(--accent-color)]';
        valueGetter = () => Number(inputControl.value || 0);
        break;
      case 'bool':
        inputControl = document.createElement('select');
        inputControl.className = 'rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[var(--accent-color)] focus:ring-[var(--accent-color)]';
        const optFalse = document.createElement('option');
        optFalse.value = 'false';
        optFalse.textContent = 'False';
        const optTrue = document.createElement('option');
        optTrue.value = 'true';
        optTrue.textContent = 'True';
        inputControl.appendChild(optFalse);
        inputControl.appendChild(optTrue);
        valueGetter = () => inputControl.value === 'true';
        break;
      default:
        inputControl = document.createElement('input');
        inputControl.type = 'text';
        inputControl.placeholder = element.placeholder || '';
        inputControl.className = 'rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[var(--accent-color)] focus:ring-[var(--accent-color)]';
        valueGetter = () => inputControl.value;
    }

    wrap.appendChild(inputControl);

    if (element.apply && element.apply.command && element.apply.command.server) {
      const button = createButton(element.apply.label || 'Apply', 'primary');
      button.addEventListener('click', () => {
        const raw = valueGetter();
        const args = { value: raw };
        executeServerCommand(element.id, element.apply.command.server, button, args).catch((err) => {
          showError(element.id, err.message);
        });
      });
      wrap.appendChild(button);
    }

    container.appendChild(wrap);
  }

  function renderOutput(element, container) {
    const controls = document.createElement('div');
    controls.className = 'flex items-center gap-2';

    if (element.mode === 'manual' && element.command && element.command.server) {
      const button = createButton(element.onDemandButtonLabel || 'Refresh', 'primary');
      controls.appendChild(button);
      button.addEventListener('click', () => {
        executeServerCommand(element.id, element.command.server, button).catch((err) => {
          showError(element.id, err.message);
        });
      });
    }

    container.appendChild(controls);

    if (element.mode === 'poll' && element.command && element.command.server) {
      const interval = Math.max(500, Number(element.intervalMs) || 5000);
      const run = () => {
        executeServerCommand(element.id, element.command.server).catch((err) => {
          showError(element.id, err.message);
        });
      };
      run();
      if (state.polling[element.id]) {
        clearInterval(state.polling[element.id]);
      }
      state.polling[element.id] = setInterval(run, interval);
    }
  }

  async function executeServerCommand(elementId, command, buttonEl, extraArgs) {
    if (!command || !command.id) {
      throw new Error('Missing command configuration');
    }
    if (buttonEl) {
      setLoading(buttonEl, true);
    }
    const payload = {
      id: elementId,
      commandId: command.id,
      args: extraArgs || {},
    };

    try {
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        const message = (data && data.error) ? data.error : `Request failed with status ${response.status}`;
        throw new Error(message);
      }
      applyResult(elementId, data);
      return data;
    } finally {
      if (buttonEl) {
        setLoading(buttonEl, false);
      }
    }
  }

  function applyResult(elementId, payload) {
    const view = state.views[elementId];
    if (!view) {
      return;
    }
    const result = payload.result || payload;
    const ok = !!payload.ok;
    state.results[elementId] = result;

    view.wrapper.classList.remove('hidden');
    view.meta.textContent = `Exit ${result.code} · ${formatTimestamp(result.ts)}`;

    if (result.stdout) {
      view.stdout.textContent = result.stdout;
      view.stdout.classList.remove('hidden');
    } else {
      view.stdout.textContent = '';
      view.stdout.classList.add('hidden');
    }

    if (result.stderr) {
      view.stderr.textContent = result.stderr;
      view.stderr.classList.remove('hidden');
    } else {
      view.stderr.textContent = '';
      view.stderr.classList.add('hidden');
    }

    const card = getCard(elementId);
    if (card) {
      card.dataset.state = ok ? 'ok' : 'error';
      card.classList.toggle('ring-2', !ok);
      card.classList.toggle('ring-red-400', !ok);
      if (ok) {
        card.classList.remove('ring-2', 'ring-red-400');
      }
    }
  }

  function showError(elementId, message) {
    const fallback = {
      ok: false,
      code: 'ERR',
      stdout: '',
      stderr: message,
      ts: new Date().toISOString(),
    };
    applyResult(elementId, { ok: false, result: fallback });
  }

  function setLoading(button, loading) {
    if (!button) return;
    if (loading) {
      if (!button.dataset.originalLabel) {
        button.dataset.originalLabel = button.textContent;
      }
      button.textContent = 'Running…';
      button.disabled = true;
    } else {
      if (button.dataset.originalLabel) {
        button.textContent = button.dataset.originalLabel;
        delete button.dataset.originalLabel;
      }
      button.disabled = false;
    }
  }

  function createButton(label, variant) {
    const button = document.createElement('button');
    button.type = 'button';
    const baseClasses = 'inline-flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition disabled:opacity-60 disabled:cursor-not-allowed';
    if (variant === 'secondary') {
      button.className = `${baseClasses} border border-slate-300 text-slate-700 hover:bg-slate-100 focus:ring-slate-400`;
    } else {
      button.className = `${baseClasses} text-white bg-slate-900 hover:bg-slate-800 focus:ring-slate-500`;
      button.style.backgroundColor = 'var(--primary-color)';
      button.style.borderColor = 'var(--primary-color)';
    }
    button.textContent = label;
    return button;
  }

  function getCard(elementId) {
    return document.querySelector(`[data-element-id="${elementId}"]`);
  }

  function formatTimestamp(ts) {
    try {
      return new Date(ts).toLocaleString();
    } catch (err) {
      return ts;
    }
  }

  function runClientScript(element, script) {
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('element', 'state', script);
      fn(element, state);
    } catch (err) {
      showError(element.id, err.message);
    }
  }

  async function hydrateLastResult(elementId) {
    try {
      const response = await fetch(`/api/read?id=${encodeURIComponent(elementId)}`);
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      if (data) {
        applyResult(elementId, data);
      }
    } catch (err) {
      console.warn('Unable to hydrate result', elementId, err);
    }
  }
})();
