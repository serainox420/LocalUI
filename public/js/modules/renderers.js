import { normalizeLayout } from './layout.js';

export function createRenderer({ state, createResultView, playElementSound, server }) {
  const { polls, views, elementIndex } = state;
  const { runServerCommand, hydrate, executeClientScript } = server;
  const navbarHosts = new Map();
  let navbarResizeHandlerAttached = false;
  let navbarResizeObserver = null;

  function renderEntity(entity, container, context) {
    if (!entity || typeof entity !== 'object') {
      return;
    }

    if (entity.id) {
      elementIndex.set(entity.id, entity);
    }

    const parentLayout = context?.layout || 'grid';

    if (entity.type === 'navbar') {
      renderNavbar(entity, context);
      return;
    }

    if (entity.type === 'group') {
      const group = buildGroup(entity, context);
      applyPlacement(group.node, entity, parentLayout);
      container.appendChild(group.node);
      const nextContext = { layout: group.layout, globals: context?.globals, root: context?.root };
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

  function renderNavbar(navbar, context) {
    const side = normalizeNavbarSide(navbar.side);
    const orientation = side === 'left' || side === 'right' ? 'vertical' : 'horizontal';
    const nav = document.createElement('nav');
    nav.className = 'ui-navbar';
    nav.dataset.side = side;
    nav.dataset.orientation = orientation;
    if (navbar.id) {
      nav.dataset.navbarId = navbar.id;
    }
    if (navbar.classes) {
      nav.className += ` ${navbar.classes}`;
    }
    if (navbar.background) {
      nav.style.background = navbar.background;
    }
    if (navbar.color) {
      nav.style.color = navbar.color;
    }
    if (navbar.border) {
      nav.style.border = navbar.border;
    }
    if (navbar.font) {
      nav.style.fontFamily = navbar.font;
    }

    const inner = document.createElement('div');
    inner.className = 'ui-navbar-inner';
    nav.appendChild(inner);

    if (navbar.label) {
      const title = document.createElement('div');
      title.className = 'ui-navbar-title';
      title.textContent = navbar.label;
      inner.appendChild(title);
    }

    const items = document.createElement('div');
    items.className = 'ui-navbar-items';
    const gapSource = navbar.gap ?? context?.globals?.theme?.gap ?? 8;
    const gapValue = Number(gapSource);
    if (Number.isFinite(gapValue)) {
      items.style.gap = `${gapValue}px`;
    }
    const alignment = mapNavbarAlign(navbar.align);
    if (orientation === 'horizontal') {
      items.style.justifyContent = alignment;
      items.style.alignItems = 'center';
      items.style.flexWrap = 'wrap';
    } else {
      items.style.justifyContent = alignment;
      items.style.alignItems = alignment === 'flex-start' || alignment === 'center' || alignment === 'flex-end' ? alignment : 'stretch';
      items.style.flexWrap = 'nowrap';
    }
    inner.appendChild(items);

    (navbar.elements || []).forEach((child) => {
      renderNavbarItem(child, items, orientation);
    });

    mountNavbar(nav, side);
  }

  function renderNavbarItem(element, container, orientation) {
    if (!element || typeof element !== 'object') {
      return;
    }

    if (element.id) {
      elementIndex.set(element.id, element);
    }

    const item = document.createElement('div');
    item.className = 'ui-navbar-item';
    item.dataset.elementId = element.id;
    if (element.classes) {
      item.className += ` ${element.classes}`;
    }
    if (element.tooltip) {
      item.title = element.tooltip;
    }
    if (element.font) {
      item.style.fontFamily = element.font;
    }
    if (element.color) {
      item.style.color = element.color;
    }
    if (element.bg) {
      item.style.background = element.bg;
      item.style.borderRadius = '9999px';
      item.style.padding = orientation === 'vertical' ? '0.65rem 0.85rem' : '0.35rem 0.85rem';
    }
    container.appendChild(item);

    if (element.type !== 'button' && element.label) {
      const label = document.createElement('span');
      label.className = 'ui-navbar-item-label';
      label.textContent = element.label;
      item.appendChild(label);
    }

    let anchor = null;
    switch (element.type) {
      case 'button':
        anchor = renderButton(element, item);
        break;
      case 'toggle':
        anchor = renderToggle(element, item);
        break;
      case 'stepper':
        anchor = renderStepper(element, item);
        break;
      case 'input':
        anchor = renderInput(element, item);
        break;
      case 'output':
        anchor = renderOutput(element, item);
        break;
      default:
        item.textContent = `Unsupported type: ${element.type}`;
        return;
    }

    const view = createResultView(element, item, anchor || item);
    views.set(element.id, view);
    activateElement(element);
  }

  function ensureNavbarHost(side) {
    if (!navbarHosts.has(side)) {
      const host = document.createElement('div');
      host.className = `ui-navbar-host ui-navbar-host-${side}`;
      document.body.appendChild(host);
      navbarHosts.set(side, host);
      if (!navbarResizeHandlerAttached) {
        window.addEventListener('resize', updateBodyPadding);
        navbarResizeHandlerAttached = true;
      }
    }
    const host = navbarHosts.get(side);
    if (typeof ResizeObserver !== 'undefined') {
      if (!navbarResizeObserver) {
        navbarResizeObserver = new ResizeObserver(() => updateBodyPadding());
      }
      navbarResizeObserver.observe(host);
    }
    return host;
  }

  function mountNavbar(nav, side) {
    const host = ensureNavbarHost(side);
    host.appendChild(nav);
    updateBodyPadding();
  }

  function updateBodyPadding() {
    const body = document.body;
    const topHost = navbarHosts.get('top');
    const bottomHost = navbarHosts.get('bottom');
    const leftHost = navbarHosts.get('left');
    const rightHost = navbarHosts.get('right');

    const topPadding = measureHostSize(topHost, 'height');
    const bottomPadding = measureHostSize(bottomHost, 'height');
    const leftPadding = measureHostSize(leftHost, 'width');
    const rightPadding = measureHostSize(rightHost, 'width');

    body.style.paddingTop = topPadding ? `${topPadding}px` : '';
    body.style.paddingBottom = bottomPadding ? `${bottomPadding}px` : '';
    body.style.paddingLeft = leftPadding ? `${leftPadding}px` : '';
    body.style.paddingRight = rightPadding ? `${rightPadding}px` : '';
  }

  function measureHostSize(host, dimension) {
    if (!host || host.childElementCount === 0) {
      return 0;
    }
    const rect = host.getBoundingClientRect();
    return dimension === 'width' ? rect.width : rect.height;
  }

  function normalizeNavbarSide(value) {
    const side = String(value || '').toLowerCase();
    return side === 'bottom' || side === 'left' || side === 'right' ? side : 'top';
  }

  function mapNavbarAlign(value) {
    const align = String(value || '').toLowerCase();
    switch (align) {
      case 'center':
        return 'center';
      case 'end':
        return 'flex-end';
      case 'space-between':
        return 'space-between';
      case 'space-around':
        return 'space-around';
      case 'space-evenly':
        return 'space-evenly';
      case 'start':
      default:
        return 'flex-start';
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
    }

    const note = document.createElement('p');
    note.className = 'text-xs text-slate-400';
    note.textContent = `Polling every ${Math.max(Number(element.intervalMs) || 0, 1)} ms`;
    container.appendChild(note);
    return note;
  }

  function makeButton(label, ghost) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = ghost ? 'ui-button ui-button-ghost' : 'ui-button ui-button-primary';
    button.textContent = label;
    return button;
  }

  return { renderEntity };
}
