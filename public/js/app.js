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

  setupLayout(root, config.globals);

  (config.elements || []).forEach((element) => {
    const card = buildCard(element);
    root.appendChild(card);
    hydrate(element.id);

    if (element.type === 'output' && element.mode === 'poll' && element.command?.server) {
      const interval = Number(element.intervalMs) || 5000;
      const timer = setInterval(() => {
        runServerCommand(element.id, element.command.server, { value: element.value });
      }, interval);
      polls.set(element.id, timer);
      runServerCommand(element.id, element.command.server, { value: element.value });
    }
  });

  window.addEventListener('beforeunload', () => {
    polls.forEach((timer) => clearInterval(timer));
  });

  function setupLayout(container, globals = {}) {
    container.className = '';
    const theme = globals.theme || {};
    const layout = theme.layout || 'grid';
    const gap = theme.gap ?? 8;
    const margin = theme.margins ?? 12;

    if (layout === 'grid') {
      container.classList.add('grid', 'auto-rows-min', 'sm:grid-cols-2', 'xl:grid-cols-12');
    } else {
      container.classList.add('flex', 'flex-col');
    }
    container.style.gap = `${gap}px`;
    container.style.padding = `${margin}px`;
  }

  function buildCard(element) {
    const section = document.createElement('section');
    section.dataset.elementId = element.id;
    section.className = 'rounded-lg border border-slate-200 bg-white shadow-sm p-4 flex flex-col gap-3';
    if (element.classes) {
      section.className += ` ${element.classes}`;
    }
    const spanW = element.w || 12;
    const spanH = element.h || 1;
    section.style.gridColumn = `span ${spanW} / span ${spanW}`;
    section.style.gridRow = `span ${spanH} / span ${spanH}`;
    if (element.bg) section.style.backgroundColor = element.bg;
    if (element.color) section.style.color = element.color;
    if (element.font) section.style.fontFamily = element.font;
    if (element.tooltip) section.title = element.tooltip;

    const header = document.createElement('header');
    header.className = 'text-sm font-semibold text-slate-600 uppercase';
    header.textContent = element.label || element.id;
    section.appendChild(header);

    const body = document.createElement('div');
    body.className = 'flex flex-col gap-3 text-sm text-slate-700';
    section.appendChild(body);

    const result = createResultView();
    views.set(element.id, result);
    section.appendChild(result.wrapper);

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
        body.textContent = `Unsupported type: ${element.type}`;
    }

    return section;
  }

  function createResultView() {
    const wrapper = document.createElement('div');
    wrapper.className = 'flex flex-col gap-2 text-xs text-slate-600 hidden';

    const status = document.createElement('div');
    status.className = 'text-xs';
    wrapper.appendChild(status);

    const stdout = document.createElement('pre');
    stdout.className = 'rounded-md bg-slate-900 text-slate-100 p-3 whitespace-pre-wrap break-words max-h-64 overflow-auto';
    wrapper.appendChild(stdout);

    const stderr = document.createElement('pre');
    stderr.className = 'rounded-md bg-red-900/90 text-red-100 p-3 whitespace-pre-wrap break-words max-h-48 overflow-auto hidden';
    wrapper.appendChild(stderr);

    const error = document.createElement('div');
    error.className = 'rounded-md bg-red-50 text-red-700 border border-red-200 px-3 py-2 hidden';
    wrapper.appendChild(error);

    return { wrapper, status, stdout, stderr, error };
  }

  function renderButton(element, container) {
    const button = makeButton(element.label || 'Run');
    container.appendChild(button);

    button.addEventListener('click', async () => {
      try {
        if (element.command?.server) {
          await runServerCommand(element.id, element.command.server, {});
        }
        if (element.command?.client?.script) {
          executeClientScript(element, element.command.client.script);
        }
      } catch (error) {
        // already shown to user
      }
    });
  }

  function renderToggle(element, container) {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-3';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(element.initial);
    input.className = 'h-5 w-5 rounded border-slate-300 text-[var(--accent-color)] focus:ring-[var(--accent-color)]';

    const label = document.createElement('span');
    label.textContent = input.checked ? 'On' : 'Off';

    row.appendChild(input);
    row.appendChild(label);
    container.appendChild(row);

    input.addEventListener('change', async () => {
      const command = input.checked ? element.onCommand?.server : element.offCommand?.server;
      label.textContent = input.checked ? 'On' : 'Off';
      if (!command) {
        return;
      }
      input.disabled = true;
      try {
        await runServerCommand(element.id, command, { value: input.checked });
      } catch (error) {
        input.checked = !input.checked;
        label.textContent = input.checked ? 'On' : 'Off';
      } finally {
        input.disabled = false;
      }
    });
  }

  function renderStepper(element, container) {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2';

    const minus = makeButton('−', true);
    const plus = makeButton('+', true);
    const input = document.createElement('input');
    input.type = 'number';
    input.value = Number(element.value ?? element.min ?? 0);
    if (element.min !== undefined) input.min = element.min;
    if (element.max !== undefined) input.max = element.max;
    if (element.step !== undefined) input.step = element.step;
    input.className = 'w-24 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[var(--accent-color)] focus:ring-[var(--accent-color)]';

    const apply = makeButton('Apply');

    minus.addEventListener('click', () => adjust(-1));
    plus.addEventListener('click', () => adjust(1));
    apply.addEventListener('click', async () => {
      if (!element.command?.server) {
        return;
      }
      try {
        await runServerCommand(element.id, element.command.server, { value: Number(input.value) });
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
  }

  function renderInput(element, container) {
    const field = document.createElement('input');
    field.className = 'rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[var(--accent-color)] focus:ring-[var(--accent-color)]';
    field.type = element.inputType === 'int' ? 'number' : 'text';

    const row = document.createElement('div');
    row.className = 'flex items-center gap-2';

    const button = makeButton(element.apply?.label || 'Apply');

    row.appendChild(field);
    row.appendChild(button);
    container.appendChild(row);

    button.addEventListener('click', async () => {
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
        await runServerCommand(element.id, element.apply.command.server, { value });
      } catch (error) {
        // shown already
      }
    });
  }

  function renderOutput(element, container) {
    if (element.mode === 'manual') {
      const button = makeButton(element.onDemandButtonLabel || 'Refresh');
      container.appendChild(button);
      button.addEventListener('click', async () => {
        if (!element.command?.server) {
          return;
        }
        try {
          await runServerCommand(element.id, element.command.server, {});
        } catch (error) {
          // shown already
        }
      });
    } else {
      const note = document.createElement('p');
      note.className = 'text-xs text-slate-500';
      note.textContent = `Polling every ${Math.max(Number(element.intervalMs) || 0, 1)} ms`;
      container.appendChild(note);
    }
  }

  function makeButton(label, ghost) {
    const button = document.createElement('button');
    button.type = 'button';
    if (ghost) {
      button.className = 'inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400';
    } else {
      button.className = 'inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500';
      button.style.backgroundColor = 'var(--primary-color)';
      button.style.borderColor = 'var(--primary-color)';
    }
    button.textContent = label;
    return button;
  }

  async function runServerCommand(elementId, command, args) {
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

    const data = await response.json();
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
    if (!payload || !payload.result) {
      return;
    }
    const view = views.get(elementId);
    if (!view) {
      return;
    }

    view.wrapper.classList.remove('hidden');
    const { ok, code, stdout, stderr, ts } = payload.result;
    const when = ts ? safeDate(ts) : '';
    view.status.textContent = ok ? `OK • exit ${code} • ${when}` : `Error • exit ${code} • ${when}`;
    view.status.className = ok ? 'text-xs text-green-600' : 'text-xs text-red-600';

    view.stdout.textContent = stdout || '';
    view.stderr.textContent = stderr || '';
    view.stderr.classList.toggle('hidden', !stderr);
    view.error.classList.add('hidden');
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
      return;
    }
    view.wrapper.classList.remove('hidden');
    view.error.textContent = message;
    view.error.classList.remove('hidden');
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
