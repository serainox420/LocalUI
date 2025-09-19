import { createAppState } from '../modules/state.js';
import { setupLayout } from '../modules/layout.js';
import { createOverlayManager } from '../modules/overlay.js';
import { createResultViewFactory } from '../modules/presentation.js';
import { createRenderer } from '../modules/renderers.js';

const DEFAULT_GRID_SCALE = 48;
const MIN_GRID_SCALE = 8;
const MAX_GRID_SCALE = 160;

const OBJECT_LIBRARY = [
  {
    type: 'button',
    label: 'Button',
    description: 'Trigger a command when clicked.',
    template: {
      type: 'button',
      label: 'Run command',
      sound: '',
      command: {
        server: { id: 'commandId', template: 'echo "Hello from button"' },
      },
      w: 4,
      h: 2,
    },
  },
  {
    type: 'toggle',
    label: 'Toggle',
    description: 'Two-state switch with on/off commands.',
    template: {
      type: 'toggle',
      label: 'Toggle switch',
      initial: false,
      onCommand: {
        server: { id: 'toggleOn', template: 'echo "toggle on"' },
      },
      offCommand: {
        server: { id: 'toggleOff', template: 'echo "toggle off"' },
      },
      w: 4,
      h: 2,
    },
  },
  {
    type: 'stepper',
    label: 'Stepper',
    description: 'Adjust numeric value in defined steps.',
    template: {
      type: 'stepper',
      label: 'Adjust value',
      min: 0,
      max: 100,
      step: 5,
      value: 50,
      command: {
        server: { id: 'setValue', template: 'echo ${value}' },
      },
      w: 6,
      h: 2,
    },
  },
  {
    type: 'input',
    label: 'Input',
    description: 'Text field with optional apply button.',
    template: {
      type: 'input',
      label: 'Input value',
      inputType: 'string',
      placeholder: 'Enter value',
      apply: {
        label: 'Apply',
        command: {
          server: { id: 'applyInput', template: 'echo ${value}' },
        },
      },
      w: 6,
      h: 2,
    },
  },
  {
    type: 'output',
    label: 'Output',
    description: 'Display server command results.',
    template: {
      type: 'output',
      label: 'Output window',
      mode: 'manual',
      onDemandButtonLabel: 'Refresh',
      command: {
        server: { id: 'readOutput', template: 'echo "output"' },
      },
      w: 12,
      h: 4,
    },
  },
];

export function createEditor(root, { config, baseConfig }) {
  const state = createEditorState(config, baseConfig);
  const overlay = createOverlayManager();
  state.overlay = overlay;

  const dom = buildEditorLayout(root, state);
  state.dom = dom;

  attachTopBarActions(state);
  attachCanvasInteractions(state);
  attachGlobalShortcuts(state);
  window.addEventListener('resize', () => updateGrid(state));

  render(state);
}

function createEditorState(initialConfig, baseConfig) {
  return {
    config: cloneConfig(initialConfig),
    baseConfig: cloneConfig(baseConfig),
    selection: new Set(),
    locks: new Set(),
    clipboard: [],
    history: { past: [], future: [] },
    grid: { enabled: true, scale: DEFAULT_GRID_SCALE },
    overlay: null,
    dom: null,
    registry: new Map(),
    interaction: null,
    contextMenu: null,
    contextMenuEl: null,
    commandWarnings: new Set(),
  };
}

function cloneConfig(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function buildEditorLayout(root, state) {
  root.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'editor-root flex min-h-screen flex-col bg-slate-950';

  const topBar = document.createElement('header');
  topBar.className = 'editor-topbar sticky top-0 z-50 flex w-full items-center gap-3 border-b border-slate-800 bg-slate-900/95 px-6 py-3 backdrop-blur';

  const title = document.createElement('h1');
  title.className = 'text-lg font-semibold text-slate-100';
  title.textContent = 'LocalUI Designer';
  topBar.appendChild(title);

  const controls = document.createElement('div');
  controls.className = 'flex flex-wrap items-center gap-2';
  topBar.appendChild(controls);

  const spacer = document.createElement('div');
  spacer.className = 'flex-1';
  topBar.appendChild(spacer);

  const status = document.createElement('div');
  status.className = 'editor-status text-xs text-slate-400';
  topBar.appendChild(status);

  container.appendChild(topBar);

  const workspace = document.createElement('div');
  workspace.className = 'editor-workspace relative flex min-h-0 flex-1 overflow-hidden';

  const canvasScroll = document.createElement('div');
  canvasScroll.className = 'editor-canvas flex-1 overflow-auto bg-slate-950';

  const canvas = document.createElement('div');
  canvas.className = 'editor-stage relative mx-auto flex min-h-full w-[1600px] max-w-none flex-col gap-6 px-12 pb-24 pt-6';

  const canvasHeader = document.createElement('div');
  canvasHeader.className = 'flex items-center justify-between text-xs text-slate-400';
  const canvasLabel = document.createElement('div');
  canvasLabel.textContent = 'Design surface';
  const canvasHelp = document.createElement('div');
  canvasHelp.textContent = 'Shift-click to multi-select · Double-click to drag · Right-click for actions';
  canvasHeader.append(canvasLabel, canvasHelp);

  const surfaceWrapper = document.createElement('div');
  surfaceWrapper.className = 'editor-surface-wrapper relative flex-1';

  const surface = document.createElement('div');
  surface.className = 'editor-surface relative mx-auto min-h-[720px] w-full max-w-[1200px] rounded-xl border border-slate-800 bg-slate-900 shadow-2xl';

  const gridLayer = document.createElement('div');
  gridLayer.className = 'editor-grid-layer pointer-events-none absolute inset-0 rounded-xl border border-slate-800/60';
  surface.appendChild(gridLayer);

  const uiHost = document.createElement('div');
  uiHost.className = 'editor-ui-host pointer-events-auto relative z-10 min-h-full rounded-xl';
  surface.appendChild(uiHost);

  const cursorInfo = document.createElement('div');
  cursorInfo.className = 'editor-cursor-info pointer-events-none absolute hidden rounded bg-slate-900/90 px-2 py-1 text-[11px] text-slate-200 shadow';
  surface.appendChild(cursorInfo);

  const metricsInfo = document.createElement('div');
  metricsInfo.className = 'editor-metrics pointer-events-none absolute right-3 top-3 hidden rounded bg-slate-900/90 px-3 py-1 text-[11px] text-slate-200 shadow';
  surface.appendChild(metricsInfo);

  surfaceWrapper.appendChild(surface);
  canvas.append(canvasHeader, surfaceWrapper);
  canvasScroll.appendChild(canvas);

  workspace.appendChild(canvasScroll);
  container.appendChild(workspace);

  root.appendChild(container);

  buildTopBarButtons(controls, state);

  return {
    container,
    topBar,
    controls,
    status,
    canvasScroll,
    canvas,
    surface,
    gridLayer,
    uiHost,
    cursorInfo,
    metricsInfo,
  };
}

function buildTopBarButtons(container, state) {
  container.append(
    createButton('New', () => handleNew(state)),
    createButton('Import', () => triggerImport(state)),
    createButton('Export', () => handleExport(state)),
    createToggleButton(
      () => `Grid: ${state.grid.enabled ? 'ON' : 'OFF'}`,
      () => toggleGrid(state),
    ),
    createButton('G-Scale -', () => adjustGridScale(state, -8)),
    createButton('G-Scale +', () => adjustGridScale(state, 8)),
    createButton('Add+', () => openAddWizard(state)),
    createButton('Style Editor', () => openStyleEditor(state)),
    createButton('Undo', () => undo(state)),
    createButton('Redo', () => redo(state)),
    createButton('Groups', () => openGroupsPanel(state)),
  );
}

function createButton(label, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'editor-button rounded-md border border-slate-700 bg-slate-800/80 px-3 py-1 text-sm text-slate-100 transition hover:bg-slate-700';
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function createToggleButton(labelGetter, handler) {
  const button = createButton(labelGetter(), handler);
  const update = () => {
    button.textContent = labelGetter();
  };
  button.addEventListener('click', () => {
    handler();
    update();
  });
  button.dataset.toggleButton = 'true';
  return button;
}

function attachTopBarActions(state) {
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = 'application/json';
  importInput.className = 'hidden';
  importInput.addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        applyImportedConfig(state, data);
      } catch (error) {
        console.error('Failed to import config', error);
        state.overlay?.showNotification('Unable to import configuration: invalid JSON', { tone: 'error' });
      }
      importInput.value = '';
    };
    reader.readAsText(file);
  });
  state.dom.topBar.appendChild(importInput);
  state.importInput = importInput;
}

function triggerImport(state) {
  state.importInput?.click();
}

function handleNew(state) {
  confirmAndRun(state, 'Start a new interface? Unsaved changes will be lost.', () => {
    state.config = cloneConfig(state.baseConfig);
    state.config.elements = [];
    state.selection.clear();
    state.locks.clear();
    state.history = { past: [], future: [] };
    state.commandWarnings.clear();
    render(state);
    state.overlay?.showNotification('Blank UI created', { tone: 'info', timeoutMs: 2200 });
  });
}

function handleExport(state) {
  try {
    const payload = JSON.stringify(state.config, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const name = prompt('Save file as', 'ui.designer.json') || 'ui.designer.json';
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    state.overlay?.showNotification('Configuration exported', { tone: 'success', timeoutMs: 2000 });
  } catch (error) {
    console.error('Export failed', error);
    state.overlay?.showNotification('Export failed', { tone: 'error' });
  }
}

function toggleGrid(state) {
  state.grid.enabled = !state.grid.enabled;
  updateGrid(state);
}

function adjustGridScale(state, delta) {
  const next = clamp(state.grid.scale + delta, MIN_GRID_SCALE, MAX_GRID_SCALE);
  state.grid.scale = next;
  updateGrid(state);
}

function updateGrid(state) {
  if (!state.dom) {
    return;
  }
  const { gridLayer } = state.dom;
  const scale = state.grid.scale;
  gridLayer.style.backgroundImage = state.grid.enabled
    ? `linear-gradient(to right, transparent calc(${scale}px - 1px), rgba(148, 163, 184, 0.25) calc(${scale}px - 1px)), linear-gradient(to bottom, transparent calc(${scale}px - 1px), rgba(148, 163, 184, 0.25) calc(${scale}px - 1px))`
    : 'none';
  gridLayer.style.backgroundSize = state.grid.enabled ? `${scale}px ${scale}px` : 'auto';
  gridLayer.style.opacity = state.grid.enabled ? '1' : '0';
  state.dom.metricsInfo.classList.toggle('hidden', !state.grid.enabled);
  state.dom.cursorInfo.classList.toggle('hidden', !state.grid.enabled);
  if (!state.grid.enabled) {
    state.dom.cursorInfo.textContent = '';
  }
  if (state.grid.enabled) {
    updateMetricsInfo(state);
  }
}

function updateMetricsInfo(state) {
  if (!state.dom) {
    return;
  }
  const rect = state.dom.surface.getBoundingClientRect();
  state.dom.metricsInfo.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)} px`;
}

function attachCanvasInteractions(state) {
  const { surface, uiHost, cursorInfo } = state.dom;

  surface.addEventListener('mousemove', (event) => {
    if (!state.grid.enabled) {
      return;
    }
    const rect = surface.getBoundingClientRect();
    const x = Math.max(0, event.clientX - rect.left);
    const y = Math.max(0, event.clientY - rect.top);
    cursorInfo.style.left = `${Math.min(rect.width - 80, x + 12)}px`;
    cursorInfo.style.top = `${Math.min(rect.height - 20, y + 12)}px`;
    cursorInfo.textContent = `[${Math.round(x)}, ${Math.round(y)}]px`;
  });

  surface.addEventListener('mouseleave', () => {
    if (!state.grid.enabled) {
      return;
    }
    cursorInfo.textContent = '';
  });

  surface.addEventListener('click', (event) => {
    if (event.target === surface || event.target === uiHost) {
      clearSelection(state);
    }
  });
}

function attachGlobalShortcuts(state) {
  window.addEventListener('keydown', (event) => {
    if (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) {
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (state.selection.size > 0) {
        event.preventDefault();
        removeSelected(state);
      }
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        redo(state);
      } else {
        undo(state);
      }
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo(state);
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      copySelection(state);
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x') {
      event.preventDefault();
      cutSelection(state);
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      pasteClipboard(state);
    }
  });
}

function render(state) {
  const { uiHost } = state.dom;
  uiHost.innerHTML = '';
  const appState = createAppState();
  const createResultView = createResultViewFactory(state.overlay);
  const renderer = createRenderer({
    state: appState,
    createResultView,
    playElementSound: () => {},
    server: createEditorServerStub(state),
  });

  const globals = state.config.globals || {};
  const layout = setupLayout(uiHost, globals);
  if (layout === 'grid') {
    uiHost.classList.add('editor-grid-layout');
    uiHost.style.gridTemplateColumns = 'repeat(12, minmax(0, 1fr))';
    uiHost.style.gridAutoRows = `${state.grid.scale}px`;
  } else {
    uiHost.classList.remove('editor-grid-layout');
    uiHost.style.gridTemplateColumns = '';
    uiHost.style.gridAutoRows = '';
  }

  const context = { layout, globals };
  (state.config.elements || []).forEach((element) => {
    renderer.renderEntity(element, uiHost, context);
  });

  state.registry = buildRegistry(state.config);
  applyEditorDecorations(state);
  updateGrid(state);
  updateStatus(state);
}

function createEditorServerStub(state) {
  return {
    async runServerCommand(elementId, command) {
      console.info('Command execution disabled in designer', elementId, command);
      if (elementId && !state.commandWarnings.has(elementId)) {
        state.overlay?.showNotification('Commands are disabled while editing', { tone: 'info', timeoutMs: 1800 });
        state.commandWarnings.add(elementId);
      }
      return { ok: false };
    },
    async hydrate() {
      return null;
    },
    executeClientScript() {
      return null;
    },
  };
}

function buildRegistry(config) {
  const registry = new Map();
  const traverse = (elements, parentId = null, parent = null) => {
    if (!Array.isArray(elements)) {
      return;
    }
    elements.forEach((element, index) => {
      if (!element || typeof element !== 'object') {
        return;
      }
      if (!element.id) {
        element.id = sanitizeId(`${element.type || 'entity'}_${index + 1}`);
      }
      registry.set(element.id, {
        entity: element,
        parent: elements,
        parentId,
        parentEntity: parent,
        index,
        type: element.type === 'group' ? 'group' : 'element',
      });
      if (element.type === 'group') {
        traverse(element.elements || [], element.id, element);
      }
    });
  };
  traverse(config.elements || []);
  return registry;
}

function applyEditorDecorations(state) {
  const nodes = state.dom.uiHost.querySelectorAll('[data-element-id], [data-group-id]');
  nodes.forEach((node) => decorateNode(state, node));
  updateSelectionStyles(state);
}

function decorateNode(state, node) {
  const id = node.dataset.elementId || node.dataset.groupId;
  node.classList.add('editor-entity');
  node.addEventListener('click', (event) => {
    event.stopPropagation();
    const additive = event.shiftKey;
    selectEntity(state, id, additive);
  });
  node.addEventListener('mouseenter', () => {
    node.classList.add('editor-hovered');
  });
  node.addEventListener('mouseleave', () => {
    node.classList.remove('editor-hovered');
  });
  node.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    showContextMenu(state, event, id);
  });
  node.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return;
    }
    if (state.locks.has(id)) {
      return;
    }
    if (event.target.closest('.editor-handle')) {
      return;
    }
    if (event.detail >= 2) {
      startMoveInteraction(state, event, id);
    }
  });
  addResizeHandles(state, node, id);
  if (state.locks.has(id)) {
    node.dataset.locked = 'true';
  } else {
    delete node.dataset.locked;
  }
}

function addResizeHandles(state, node, id) {
  const host = document.createElement('div');
  host.className = 'editor-handle-host pointer-events-none absolute inset-0';
  const directions = ['nw', 'ne', 'sw', 'se'];
  directions.forEach((direction) => {
    const handle = document.createElement('span');
    handle.className = `editor-handle editor-handle-${direction}`;
    handle.dataset.direction = direction;
    handle.classList.add('pointer-events-auto');
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (state.locks.has(id)) {
        return;
      }
      startResizeInteraction(state, event, id, direction);
    });
    host.appendChild(handle);
  });
  node.style.position = 'relative';
  node.appendChild(host);
}

function selectEntity(state, id, additive = false) {
  if (!additive) {
    state.selection.clear();
  }
  if (state.selection.has(id) && additive) {
    state.selection.delete(id);
  } else {
    state.selection.add(id);
  }
  updateSelectionStyles(state);
}

function clearSelection(state) {
  if (state.selection.size === 0) {
    return;
  }
  state.selection.clear();
  updateSelectionStyles(state);
}

function updateSelectionStyles(state) {
  const nodes = state.dom.uiHost.querySelectorAll('.editor-entity');
  nodes.forEach((node) => {
    const id = node.dataset.elementId || node.dataset.groupId;
    node.classList.toggle('editor-selected', state.selection.has(id));
  });
}

function updateStatus(state) {
  const total = countElements(state.config.elements || []);
  const summary = `${state.selection.size} selected · ${total} total elements`;
  state.dom.status.textContent = summary;
}

function countElements(elements) {
  let count = 0;
  (elements || []).forEach((element) => {
    if (!element) {
      return;
    }
    count += 1;
    if (element.type === 'group') {
      count += countElements(element.elements || []);
    }
  });
  return count;
}

function showContextMenu(state, event, id) {
  if (!state.selection.has(id)) {
    selectEntity(state, id, false);
  }
  const menu = ensureContextMenu(state);
  const rect = state.dom.surface.getBoundingClientRect();
  const entries = buildContextMenuEntries(state, id);
  menu.innerHTML = '';
  entries.forEach((entry) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'editor-context-item';
    item.textContent = entry.label;
    if (entry.disabled) {
      item.disabled = true;
    }
    item.addEventListener('click', () => {
      hideContextMenu(state);
      entry.action?.();
    });
    menu.appendChild(item);
  });
  menu.style.left = `${Math.min(rect.width - 200, event.clientX - rect.left)}px`;
  menu.style.top = `${Math.min(rect.height - 240, event.clientY - rect.top)}px`;
  menu.classList.remove('hidden');
  state.contextMenu = { menu, targetId: id };
}

function ensureContextMenu(state) {
  if (state.contextMenuEl) {
    return state.contextMenuEl;
  }
  const menu = document.createElement('div');
  menu.className = 'editor-context-menu hidden';
  state.dom.surface.appendChild(menu);
  const hideOnClick = (event) => {
    if (state.contextMenu?.menu && state.contextMenu.menu.contains(event.target)) {
      return;
    }
    hideContextMenu(state);
  };
  window.addEventListener('click', hideOnClick);
  const keyListener = (event) => {
    if (event.key === 'Escape') {
      hideContextMenu(state);
    }
  };
  window.addEventListener('keydown', keyListener);
  state.contextMenuEl = menu;
  return menu;
}

function hideContextMenu(state) {
  if (state.contextMenu?.menu) {
    state.contextMenu.menu.classList.add('hidden');
  }
  state.contextMenu = null;
}

function buildContextMenuEntries(state, id) {
  const selection = [...state.selection];
  const locked = selection.every((item) => state.locks.has(item));
  const entries = [];
  entries.push({
    label: locked ? 'Unlock' : 'Lock',
    action: () => toggleLock(state, selection),
  });
  entries.push({ label: 'Edit', action: () => openEditPanel(state, selection[0]) });
  entries.push({ label: 'Copy', action: () => copySelection(state, selection) });
  entries.push({ label: 'Cut', action: () => cutSelection(state, selection) });
  entries.push({ label: 'Paste', action: () => pasteClipboard(state, id), disabled: state.clipboard.length === 0 });
  entries.push({ label: 'Delete', action: () => removeEntities(state, selection) });
  if (selection.length > 1) {
    entries.push({ label: 'Group', action: () => groupSelection(state, selection) });
  }
  const hasGroup = selection.some((item) => state.registry.get(item)?.type === 'group');
  if (hasGroup) {
    entries.push({ label: 'Ungroup', action: () => ungroupSelection(state, selection) });
  }
  return entries;
}

function toggleLock(state, ids) {
  ids.forEach((id) => {
    if (state.locks.has(id)) {
      state.locks.delete(id);
    } else {
      state.locks.add(id);
    }
  });
  updateSelectionStyles(state);
  state.overlay?.showNotification('Lock state updated', { tone: 'info', timeoutMs: 1500 });
}

function copySelection(state, selection = [...state.selection]) {
  state.clipboard = selection
    .map((id) => cloneEntity(state, id))
    .filter(Boolean);
  state.overlay?.showNotification(`Copied ${state.clipboard.length} item(s)`, { tone: 'info', timeoutMs: 1500 });
}

function cutSelection(state, selection = [...state.selection]) {
  copySelection(state, selection);
  removeEntities(state, selection);
}

function pasteClipboard(state, referenceId = null) {
  if (state.clipboard.length === 0) {
    return;
  }
  const reference = referenceId ? state.registry.get(referenceId) : null;
  const parentId = reference?.parentId || null;
  const insertIndex = reference ? reference.index + 1 : (parentId ? reference.parent.length : state.config.elements.length);
  const used = collectIds(state.config);
  const clones = state.clipboard.map((item) => assignFreshIds(state, cloneConfig(item.entity), used));
  updateConfig(state, (config) => {
    const targetList = resolveList(config, parentId);
    if (!targetList) {
      return;
    }
    clones.forEach((clone, offset) => {
      targetList.splice(insertIndex + offset, 0, clone);
    });
  });
  state.overlay?.showNotification(`Pasted ${clones.length} item(s)`, { tone: 'success', timeoutMs: 1600 });
}

function cloneEntity(state, id) {
  const meta = state.registry.get(id);
  if (!meta) {
    return null;
  }
  return { entity: cloneConfig(meta.entity), type: meta.type };
}

function assignFreshIds(state, entity, usedSet) {
  if (entity && typeof entity === 'object') {
    const used = usedSet || collectIds(state.config);
    entity.id = createUniqueId(state, entity.id || entity.type || 'entity', used);
    if (entity.type === 'group' && Array.isArray(entity.elements)) {
      entity.elements = entity.elements.map((child) => assignFreshIds(state, child, used));
    }
  }
  return entity;
}

function createUniqueId(state, base, usedSet) {
  const used = usedSet || collectIds(state.config);
  const prefix = sanitizeId(base || 'entity');
  let candidate = prefix;
  let counter = 1;
  while (used.has(candidate)) {
    candidate = `${prefix}_${counter}`;
    counter += 1;
  }
  used.add(candidate);
  return candidate;
}

function collectIds(config) {
  const ids = new Set();
  const visit = (elements) => {
    (elements || []).forEach((element) => {
      if (element?.id) {
        ids.add(element.id);
      }
      if (element?.type === 'group') {
        visit(element.elements);
      }
    });
  };
  visit(config.elements || []);
  return ids;
}

function sanitizeId(value) {
  return (value || 'entity').toString().replace(/[^A-Za-z0-9_\-]/g, '_');
}

function removeSelected(state) {
  if (state.selection.size === 0) {
    return;
  }
  removeEntities(state, [...state.selection]);
}

function removeEntities(state, ids) {
  updateConfig(state, (config) => {
    ids.forEach((id) => {
      const meta = findEntityMeta(config, id);
      if (meta) {
        meta.parent.splice(meta.index, 1);
      }
    });
  });
  ids.forEach((id) => state.selection.delete(id));
  render(state);
}

function resolveList(config, parentId) {
  if (!parentId) {
    return config.elements;
  }
  const meta = findEntityMeta(config, parentId);
  if (meta && meta.entity.type === 'group') {
    meta.entity.elements = meta.entity.elements || [];
    return meta.entity.elements;
  }
  return config.elements;
}

function findEntityMeta(config, id) {
  let found = null;
  const walk = (elements, parentEntity) => {
    if (!Array.isArray(elements) || found) {
      return;
    }
    elements.forEach((element, index) => {
      if (found) {
        return;
      }
      if (element?.id === id) {
        found = { entity: element, parent: elements, parentEntity, index };
        return;
      }
      if (element?.type === 'group') {
        walk(element.elements || [], element);
      }
    });
  };
  walk(config.elements || [], null);
  return found;
}

function updateConfig(state, mutator) {
  const snapshot = cloneConfig(state.config);
  mutator(state.config);
  state.history.past.push(snapshot);
  state.history.future = [];
  render(state);
}

function undo(state) {
  if (state.history.past.length === 0) {
    return;
  }
  const current = cloneConfig(state.config);
  const previous = state.history.past.pop();
  state.history.future.push(current);
  state.config = previous;
  render(state);
}

function redo(state) {
  if (state.history.future.length === 0) {
    return;
  }
  const current = cloneConfig(state.config);
  const next = state.history.future.pop();
  state.history.past.push(current);
  state.config = next;
  render(state);
}

function groupSelection(state, ids) {
  const metas = ids.map((id) => state.registry.get(id)).filter(Boolean);
  if (metas.length < 2) {
    return;
  }
  const parent = metas[0].parent;
  if (!metas.every((meta) => meta.parent === parent)) {
    state.overlay?.showNotification('Elements must share a parent to group', { tone: 'error' });
    return;
  }
  const title = prompt('Group label', 'Group');
  if (title === null) {
    return;
  }
  updateConfig(state, (config) => {
    const baseMeta = findEntityMeta(config, ids[0]);
    if (!baseMeta) {
      return;
    }
    const group = {
      id: createUniqueId(state, title || 'group'),
      type: 'group',
      label: title || undefined,
      layout: 'grid',
      columns: 1,
      elements: [],
    };
    const parentList = baseMeta.parent;
    const selected = ids
      .map((id) => findEntityMeta(config, id))
      .filter(Boolean)
      .sort((a, b) => a.index - b.index);
    selected.forEach((meta, offset) => {
      group.elements.push(meta.parent.splice(meta.index - offset, 1)[0]);
    });
    parentList.splice(baseMeta.index, 0, group);
  });
  state.overlay?.showNotification('Grouped elements', { tone: 'success', timeoutMs: 1500 });
}

function ungroupSelection(state, ids) {
  updateConfig(state, (config) => {
    ids.forEach((id) => {
      const meta = findEntityMeta(config, id);
      if (!meta || meta.entity.type !== 'group') {
        return;
      }
      const children = meta.entity.elements || [];
      meta.parent.splice(meta.index, 1, ...children);
    });
  });
  state.overlay?.showNotification('Ungrouped', { tone: 'info', timeoutMs: 1500 });
}

function openGroupsPanel(state) {
  const groups = [...state.registry.values()].filter((meta) => meta.type === 'group');
  const body = document.createElement('div');
  body.className = 'flex flex-col gap-3';
  if (groups.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-sm text-slate-300';
    empty.textContent = 'No groups yet. Use the context menu or toolbar to create groups.';
    body.appendChild(empty);
  } else {
    groups.forEach((meta) => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between rounded border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm';
      const label = document.createElement('div');
      label.className = 'flex flex-col';
      label.innerHTML = `<strong class="text-slate-100">${meta.entity.label || meta.entity.id}</strong><span class="text-xs text-slate-400">${meta.entity.elements?.length || 0} items</span>`;
      const actions = document.createElement('div');
      actions.className = 'flex items-center gap-2';
      const selectBtn = createButton('Select', () => {
        hideModal?.();
        state.selection = new Set([meta.entity.id]);
        updateSelectionStyles(state);
        updateStatus(state);
      });
      const ungroupBtn = createButton('Ungroup', () => {
        hideModal?.();
        ungroupSelection(state, [meta.entity.id]);
      });
      actions.append(selectBtn, ungroupBtn);
      row.append(label, actions);
      body.appendChild(row);
    });
  }
  let hideModal = null;
  hideModal = showModal(state, 'Groups', body);
}

function startMoveInteraction(state, event, id) {
  if (!state.selection.has(id)) {
    selectEntity(state, id, false);
  }
  const movable = [...state.selection].filter((item) => !state.locks.has(item));
  if (movable.length === 0) {
    state.overlay?.showNotification('Selection is locked', { tone: 'info', timeoutMs: 1500 });
    return;
  }
  event.preventDefault();
  const { layer, ghosts } = createGhostLayer(state, movable);
  const initialPositions = new Map();
  movable.forEach((item) => {
    const meta = state.registry.get(item);
    if (meta) {
      initialPositions.set(item, {
        x: Number(meta.entity.x) || 0,
        y: Number(meta.entity.y) || 0,
      });
    }
  });
  const interaction = {
    type: 'move',
    ids: movable,
    startX: event.clientX,
    startY: event.clientY,
    deltaX: 0,
    deltaY: 0,
    ghosts,
    layer,
    pointerId: event.pointerId,
    initialPositions,
  };
  state.interaction = interaction;

  const handleMove = (evt) => {
    if (state.interaction !== interaction) {
      return;
    }
    const dx = evt.clientX - interaction.startX;
    const dy = evt.clientY - interaction.startY;
    interaction.deltaX = dx;
    interaction.deltaY = dy;
    interaction.ghosts.forEach((ghost) => {
      ghost.node.style.transform = `translate(${dx}px, ${dy}px)`;
    });
  };

  const captureTarget = event.currentTarget;

  const handleUp = () => {
    if (state.interaction !== interaction) {
      return;
    }
    endInteraction(state, interaction);
    window.removeEventListener('pointermove', handleMove);
    captureTarget?.releasePointerCapture?.(interaction.pointerId);
  };

  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', handleUp, { once: true });
  event.currentTarget?.setPointerCapture?.(interaction.pointerId);
}

function startResizeInteraction(state, event, id, direction) {
  if (!state.selection.has(id)) {
    selectEntity(state, id, false);
  }
  const resizable = [...state.selection].filter((item) => !state.locks.has(item));
  if (resizable.length === 0) {
    state.overlay?.showNotification('Selection is locked', { tone: 'info', timeoutMs: 1500 });
    return;
  }
  event.preventDefault();
  const { layer, ghosts } = createGhostLayer(state, resizable);
  const initialSizes = new Map();
  resizable.forEach((item) => {
    const meta = state.registry.get(item);
    if (meta) {
      initialSizes.set(item, {
        x: Number(meta.entity.x) || 0,
        y: Number(meta.entity.y) || 0,
        w: Number(meta.entity.w) || 1,
        h: Number(meta.entity.h) || 1,
      });
    }
  });
  const captureTarget = event.target;
  const interaction = {
    type: 'resize',
    ids: resizable,
    startX: event.clientX,
    startY: event.clientY,
    deltaX: 0,
    deltaY: 0,
    ghosts,
    layer,
    pointerId: event.pointerId,
    initialSizes,
    direction,
  };
  state.interaction = interaction;

  const handleMove = (evt) => {
    if (state.interaction !== interaction) {
      return;
    }
    const dx = evt.clientX - interaction.startX;
    const dy = evt.clientY - interaction.startY;
    interaction.deltaX = dx;
    interaction.deltaY = dy;
    interaction.ghosts.forEach((ghost) => {
      const { rect } = ghost;
      const frame = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      const updated = adjustGhostFrame(frame, dx, dy, direction);
      ghost.node.style.left = `${updated.left}px`;
      ghost.node.style.top = `${updated.top}px`;
      ghost.node.style.width = `${Math.max(24, updated.width)}px`;
      ghost.node.style.height = `${Math.max(24, updated.height)}px`;
    });
  };

  const handleUp = () => {
    if (state.interaction !== interaction) {
      return;
    }
    endInteraction(state, interaction);
    window.removeEventListener('pointermove', handleMove);
    captureTarget?.releasePointerCapture?.(interaction.pointerId);
  };

  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', handleUp, { once: true });
  captureTarget?.setPointerCapture?.(interaction.pointerId);
}

function createGhostLayer(state, ids) {
  const layer = document.createElement('div');
  layer.className = 'editor-ghost-layer pointer-events-none absolute inset-0 z-50';
  const rect = state.dom.surface.getBoundingClientRect();
  const ghosts = [];
  ids.forEach((id) => {
    const selectorId = cssEscape(id);
    const node = state.dom.uiHost.querySelector(`[data-element-id="${selectorId}"], [data-group-id="${selectorId}"]`);
    if (!node) {
      return;
    }
    const bounds = node.getBoundingClientRect();
    const relative = {
      left: bounds.left - rect.left,
      top: bounds.top - rect.top,
      width: bounds.width,
      height: bounds.height,
    };
    const ghost = document.createElement('div');
    ghost.className = 'editor-ghost';
    ghost.style.left = `${relative.left}px`;
    ghost.style.top = `${relative.top}px`;
    ghost.style.width = `${relative.width}px`;
    ghost.style.height = `${relative.height}px`;
    layer.appendChild(ghost);
    ghosts.push({ id, node: ghost, rect: relative });
  });
  state.dom.surface.appendChild(layer);
  return { layer, ghosts };
}

function adjustGhostFrame(frame, dx, dy, direction) {
  const result = { ...frame };
  switch (direction) {
    case 'se':
      result.width += dx;
      result.height += dy;
      break;
    case 'ne':
      result.width += dx;
      result.height -= dy;
      result.top += dy;
      break;
    case 'sw':
      result.width -= dx;
      result.left += dx;
      result.height += dy;
      break;
    case 'nw':
      result.width -= dx;
      result.left += dx;
      result.height -= dy;
      result.top += dy;
      break;
    default:
      break;
  }
  result.width = Math.max(16, result.width);
  result.height = Math.max(16, result.height);
  result.left = Math.max(0, result.left);
  result.top = Math.max(0, result.top);
  return result;
}

function endInteraction(state, interaction) {
  interaction.layer.remove();
  if (interaction.type === 'move') {
    const deltaXUnits = Math.round(interaction.deltaX / state.grid.scale);
    const deltaYUnits = Math.round(interaction.deltaY / state.grid.scale);
    if (deltaXUnits === 0 && deltaYUnits === 0) {
      state.interaction = null;
      return;
    }
    updateConfig(state, (config) => {
      interaction.ids.forEach((id) => {
        const meta = findEntityMeta(config, id);
        const base = interaction.initialPositions.get(id) || { x: 0, y: 0 };
        if (!meta) {
          return;
        }
        meta.entity.x = clamp((base.x || 0) + deltaXUnits, 0, 999);
        meta.entity.y = clamp((base.y || 0) + deltaYUnits, 0, 999);
      });
    });
  } else if (interaction.type === 'resize') {
    const dxUnits = Math.round(interaction.deltaX / state.grid.scale);
    const dyUnits = Math.round(interaction.deltaY / state.grid.scale);
    if (dxUnits === 0 && dyUnits === 0) {
      state.interaction = null;
      return;
    }
    updateConfig(state, (config) => {
      interaction.ids.forEach((id) => {
        const meta = findEntityMeta(config, id);
        const base = interaction.initialSizes.get(id) || { x: 0, y: 0, w: 1, h: 1 };
        if (!meta) {
          return;
        }
        const result = applyResize(base, dxUnits, dyUnits, interaction.direction);
        meta.entity.x = result.x;
        meta.entity.y = result.y;
        meta.entity.w = result.w;
        meta.entity.h = result.h;
      });
    });
  }
  state.interaction = null;
}

function applyResize(base, dxUnits, dyUnits, direction) {
  const next = { ...base };
  switch (direction) {
    case 'se':
      next.w = Math.max(1, base.w + dxUnits);
      next.h = Math.max(1, base.h + dyUnits);
      break;
    case 'ne':
      next.w = Math.max(1, base.w + dxUnits);
      next.h = Math.max(1, base.h - dyUnits);
      next.y = Math.max(0, base.y + dyUnits);
      break;
    case 'sw':
      next.w = Math.max(1, base.w - dxUnits);
      next.h = Math.max(1, base.h + dyUnits);
      next.x = Math.max(0, base.x + dxUnits);
      break;
    case 'nw':
      next.w = Math.max(1, base.w - dxUnits);
      next.h = Math.max(1, base.h - dyUnits);
      next.x = Math.max(0, base.x + dxUnits);
      next.y = Math.max(0, base.y + dyUnits);
      break;
    default:
      break;
  }
  next.x = Math.max(0, Math.round(next.x || 0));
  next.y = Math.max(0, Math.round(next.y || 0));
  next.w = Math.max(1, Math.round(next.w || 1));
  next.h = Math.max(1, Math.round(next.h || 1));
  return next;
}

function openAddWizard(state) {
  const content = document.createElement('div');
  content.className = 'flex flex-col gap-4';
  const intro = document.createElement('p');
  intro.className = 'text-sm text-slate-300';
  intro.textContent = 'Choose what to add to the layout.';
  const choices = document.createElement('div');
  choices.className = 'grid grid-cols-2 gap-3';
  const paneButton = createButton('Pane', () => {
    close();
    openPaneForm(state);
  });
  const objectButton = createButton('Object', () => {
    close();
    openObjectChooser(state);
  });
  paneButton.classList.add('py-4', 'text-base', 'font-semibold');
  objectButton.classList.add('py-4', 'text-base', 'font-semibold');
  choices.append(paneButton, objectButton);
  content.append(intro, choices);
  const close = showModal(state, 'Add element', content);
}

function openPaneForm(state) {
  const form = document.createElement('form');
  form.className = 'flex flex-col gap-4';
  const idInput = createTextInput('');
  idInput.placeholder = 'pane_id';
  const labelInput = createTextInput('');
  const layoutSelect = createSelect(['grid', 'stack'], 'grid');
  const columnsInput = createNumberInput(1, 1);
  const gapInput = createNumberInput(state.grid.scale, 0);
  const backgroundInput = createTextInput('');
  const borderInput = createTextInput('');

  form.append(
    createField('Identifier', idInput, 'Unique id for the group'),
    createField('Label', labelInput, 'Optional caption shown above the pane'),
    createField('Layout', layoutSelect, 'Choose how children are arranged'),
    createField('Columns', columnsInput, 'Number of columns when using grid layout'),
    createField('Gap (px)', gapInput, 'Spacing between child elements'),
    createField('Background', backgroundInput, 'CSS color or gradient'),
    createField('Border', borderInput, 'CSS border declaration'),
  );

  const actions = document.createElement('div');
  actions.className = 'flex justify-end gap-2';
  const cancel = createButton('Cancel', () => close());
  const submit = createButton('Create', () => {});
  submit.type = 'submit';
  actions.append(cancel, submit);
  form.appendChild(actions);

  const close = showModal(state, 'New pane', form);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const used = collectIds(state.config);
    let generatedId = sanitizeId(idInput.value);
    if (!generatedId) {
      generatedId = createUniqueId(state, 'pane', used);
    } else if (used.has(generatedId)) {
      generatedId = createUniqueId(state, generatedId, used);
    } else {
      used.add(generatedId);
    }
    const gapValue = Number(gapInput.value);
    const columnsValue = Math.max(1, Number(columnsInput.value) || 1);
    const group = {
      id: generatedId,
      type: 'group',
      label: labelInput.value || undefined,
      layout: layoutSelect.value,
      columns: columnsValue,
      gap: Number.isFinite(gapValue) ? gapValue : undefined,
      background: backgroundInput.value || undefined,
      border: borderInput.value || undefined,
      elements: [],
    };
    insertEntity(state, group);
    close();
    state.overlay?.showNotification('Pane added', { tone: 'success', timeoutMs: 1500 });
  });
}

function insertEntity(state, entity) {
  const selection = [...state.selection];
  const targetMeta = selection.length === 1 ? state.registry.get(selection[0]) : null;
  const parentId = targetMeta?.type === 'group' ? targetMeta.entity.id : targetMeta?.parentId || null;
  updateConfig(state, (config) => {
    const targetList = resolveList(config, parentId);
    targetList.push(entity);
  });
}

function openObjectChooser(state) {
  const list = document.createElement('div');
  list.className = 'grid grid-cols-1 gap-3';
  OBJECT_LIBRARY.forEach((option) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'editor-card-option rounded-lg border border-slate-700 bg-slate-800/60 p-4 text-left text-sm text-slate-100 hover:bg-slate-700/70';
    item.innerHTML = `<div class="text-base font-semibold">${option.label}</div><div class="mt-1 text-xs text-slate-300">${option.description}</div>`;
    item.addEventListener('click', () => {
      close();
      const template = cloneConfig(option.template);
      template.id = createUniqueId(state, option.type, collectIds(state.config));
      openEditPanel(state, template, {
        title: `Add ${option.label}`,
        onSubmit: (updated) => {
          insertEntity(state, updated);
          state.overlay?.showNotification(`${option.label} added`, { tone: 'success', timeoutMs: 1600 });
        },
      });
    });
    list.appendChild(item);
  });
  const close = showModal(state, 'Add object', list);
}

function openStyleEditor(state) {
  const globals = cloneConfig(state.config.globals || {});
  const theme = globals.theme || {};
  const palette = theme.palette || {};
  const defaults = globals.defaults || {};

  const form = document.createElement('form');
  form.className = 'flex flex-col gap-4';

  const fontInput = createTextInput(theme.font || '');
  const marginInput = createNumberInput(theme.margins ?? 12, 0);
  const gapInput = createNumberInput(theme.gap ?? 8, 0);
  const layoutSelect = createSelect(['grid', 'stack'], theme.layout || 'grid');
  const colors = ['primary', 'accent', 'surface', 'muted', 'danger'];
  colors.forEach((key) => {
    const input = createTextInput(palette[key] || '');
    input.dataset.paletteKey = key;
    form.appendChild(createField(`${key} color`, input));
  });

  form.append(
    createField('Font stack', fontInput),
    createField('Margins (px)', marginInput),
    createField('Gap (px)', gapInput),
    createField('Layout', layoutSelect),
  );

  const defaultsSection = document.createElement('div');
  defaultsSection.className = 'rounded-lg border border-slate-700 bg-slate-800/40 p-4';
  const defaultsTitle = document.createElement('h3');
  defaultsTitle.className = 'mb-2 text-sm font-semibold uppercase tracking-wider text-slate-300';
  defaultsTitle.textContent = 'Element defaults';
  const defaultWidth = createNumberInput(defaults.w ?? 12, 1);
  const defaultHeight = createNumberInput(defaults.h ?? 2, 1);
  const defaultClasses = createTextInput(defaults.classes || '');
  defaultsSection.append(
    defaultsTitle,
    createField('Default width', defaultWidth),
    createField('Default height', defaultHeight),
    createField('Default classes', defaultClasses),
  );
  form.appendChild(defaultsSection);

  const customCss = createTextArea(theme.customCss || '', 5);
  customCss.placeholder = 'Optional raw CSS/Tailwind snippets to include globally';
  form.appendChild(createField('Custom CSS / Tailwind helpers', customCss));

  const actions = document.createElement('div');
  actions.className = 'flex justify-end gap-2';
  const cancel = createButton('Cancel', () => close());
  const apply = createButton('Apply', () => {});
  apply.type = 'submit';
  actions.append(cancel, apply);
  form.appendChild(actions);

  const close = showModal(state, 'Style editor', form);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    updateConfig(state, (config) => {
      config.globals = config.globals || {};
      config.globals.theme = config.globals.theme || {};
      config.globals.defaults = config.globals.defaults || {};
      const nextTheme = config.globals.theme;
      nextTheme.font = fontInput.value;
      nextTheme.margins = Number(marginInput.value) || 0;
      nextTheme.gap = Number(gapInput.value) || 0;
      nextTheme.layout = layoutSelect.value;
      nextTheme.palette = nextTheme.palette || {};
      colors.forEach((key) => {
        const input = form.querySelector(`[data-palette-key="${key}"]`);
        if (input) {
          nextTheme.palette[key] = input.value || undefined;
        }
      });
      nextTheme.customCss = customCss.value || undefined;
      config.globals.defaults.w = Number(defaultWidth.value) || 1;
      config.globals.defaults.h = Number(defaultHeight.value) || 1;
      config.globals.defaults.classes = defaultClasses.value || '';
    });
    close();
    state.overlay?.showNotification('Styles updated', { tone: 'success', timeoutMs: 1600 });
  });
}

function openEditPanel(state, target, options = {}) {
  const isNew = typeof target !== 'string';
  const title = options.title || (isNew ? 'New element' : 'Edit element');
  const entity = isNew ? cloneConfig(target) : cloneConfig(state.registry.get(target)?.entity || {});
  if (!entity) {
    return;
  }
  const form = document.createElement('form');
  form.className = 'flex flex-col gap-4';
  const fieldset = document.createElement('div');
  fieldset.className = 'flex flex-col gap-3';

  Object.entries(entity).forEach(([key, value]) => {
    fieldset.appendChild(createPropertyEditor(key, value));
  });

  const addRow = document.createElement('div');
  addRow.className = 'flex items-center gap-2';
  const newKeyInput = createTextInput('');
  newKeyInput.placeholder = 'newKey';
  const typeSelect = createSelect(['string', 'number', 'boolean', 'json'], 'string');
  const addButton = createButton('Add property', () => {
    const key = newKeyInput.value.trim();
    if (!key) {
      state.overlay?.showNotification('Property name required', { tone: 'error', timeoutMs: 1500 });
      return;
    }
    if (fieldset.querySelector(`[data-key="${cssEscape(key)}"]`)) {
      state.overlay?.showNotification('Property already exists', { tone: 'error', timeoutMs: 1500 });
      return;
    }
    let defaultValue;
    switch (typeSelect.value) {
      case 'number':
        defaultValue = 0;
        break;
      case 'boolean':
        defaultValue = false;
        break;
      case 'json':
        defaultValue = {};
        break;
      default:
        defaultValue = '';
    }
    fieldset.appendChild(createPropertyEditor(key, defaultValue));
    newKeyInput.value = '';
  });
  addRow.append(newKeyInput, typeSelect, addButton);

  form.append(fieldset, addRow);

  const actions = document.createElement('div');
  actions.className = 'flex justify-end gap-2';
  const cancel = createButton('Cancel', () => close());
  const apply = createButton(isNew ? 'Create' : 'Save', () => {});
  apply.type = 'submit';
  actions.append(cancel, apply);
  form.appendChild(actions);

  const close = showModal(state, title, form);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = {};
    const fields = form.querySelectorAll('[data-editor-field]');
    try {
      fields.forEach((field) => {
        const key = field.dataset.key;
        const type = field.dataset.type;
        if (!key) {
          return;
        }
        if (type === 'boolean') {
          result[key] = field.checked;
        } else if (type === 'number') {
          result[key] = Number(field.value);
        } else if (type === 'json') {
          result[key] = field.value ? JSON.parse(field.value) : {};
        } else {
          result[key] = field.value;
        }
      });
    } catch (error) {
      state.overlay?.showNotification(`Invalid JSON: ${error.message}`, { tone: 'error', timeoutMs: 2000 });
      return;
    }

    if (isNew) {
      options.onSubmit?.(result);
    } else {
      updateConfig(state, (config) => {
        const meta = findEntityMeta(config, target);
        if (!meta) {
          return;
        }
        Object.keys(meta.entity).forEach((key) => {
          delete meta.entity[key];
        });
        Object.assign(meta.entity, result);
      });
      state.overlay?.showNotification('Element updated', { tone: 'success', timeoutMs: 1500 });
    }
    close();
  });
}

function createPropertyEditor(key, value) {
  let input;
  let type;
  if (typeof value === 'boolean') {
    input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    type = 'boolean';
  } else if (typeof value === 'number') {
    input = createNumberInput(value, 0);
    type = 'number';
  } else if (typeof value === 'string') {
    input = createTextInput(value);
    type = 'string';
  } else {
    input = createTextArea(JSON.stringify(value, null, 2), 6);
    type = 'json';
  }
  input.dataset.editorField = 'true';
  input.dataset.key = key;
  input.dataset.type = type;
  const field = createField(key, input);
  if (type === 'boolean') {
    field.classList.add('editor-boolean-field');
  }
  return field;
}

function createField(label, input, hint = '') {
  const wrapper = document.createElement('label');
  wrapper.className = 'flex flex-col gap-1 text-xs text-slate-300';
  const title = document.createElement('span');
  title.className = 'text-sm font-semibold text-slate-100';
  title.textContent = label;
  wrapper.appendChild(title);
  wrapper.appendChild(input);
  if (hint) {
    const helper = document.createElement('span');
    helper.className = 'text-[11px] text-slate-400';
    helper.textContent = hint;
    wrapper.appendChild(helper);
  }
  return wrapper;
}

function createTextInput(value) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.className = 'editor-input';
  return input;
}

function createNumberInput(value, min) {
  const input = document.createElement('input');
  input.type = 'number';
  if (min != null) {
    input.min = String(min);
  }
  input.value = Number.isFinite(value) ? value : 0;
  input.className = 'editor-input';
  return input;
}

function createSelect(options, value) {
  const select = document.createElement('select');
  select.className = 'editor-input';
  options.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option;
    opt.textContent = option;
    if (option === value) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
  return select;
}

function createTextArea(value, rows = 4) {
  const textarea = document.createElement('textarea');
  textarea.className = 'editor-input h-auto';
  textarea.rows = rows;
  textarea.value = value;
  return textarea;
}

function showModal(state, title, content, options = {}) {
  const scrim = document.createElement('div');
  scrim.className = 'editor-modal fixed inset-0 z-[4000] flex items-center justify-center bg-slate-950/70 backdrop-blur';
  const panel = document.createElement('div');
  panel.className = 'editor-modal-panel w-[min(680px,90vw)] max-h-[90vh] overflow-auto rounded-xl border border-slate-700 bg-slate-900 p-6 text-sm text-slate-200 shadow-2xl';
  const header = document.createElement('div');
  header.className = 'mb-4 flex items-center justify-between';
  const heading = document.createElement('h2');
  heading.className = 'text-lg font-semibold text-slate-100';
  heading.textContent = title;
  const closeBtn = createButton('Close', () => close());
  header.append(heading, closeBtn);
  panel.appendChild(header);
  if (content instanceof Node) {
    panel.appendChild(content);
  }
  scrim.appendChild(panel);
  state.dom.container.appendChild(scrim);
  const close = () => {
    scrim.remove();
    options.onClose?.();
  };
  scrim.addEventListener('click', (event) => {
    if (event.target === scrim) {
      close();
    }
  });
  return close;
}

function confirmAndRun(state, message, action) {
  if (window.confirm(message)) {
    action();
  }
}

function applyImportedConfig(state, data) {
  if (!data || typeof data !== 'object') {
    state.overlay?.showNotification('Invalid configuration file', { tone: 'error' });
    return;
  }
  confirmAndRun(state, 'Replace current editor state with imported configuration?', () => {
    state.config = cloneConfig(data);
    state.selection.clear();
    state.locks.clear();
    state.history = { past: [], future: [] };
    state.commandWarnings.clear();
    render(state);
    state.overlay?.showNotification('Configuration imported', { tone: 'success', timeoutMs: 1600 });
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function cssEscape(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return String(value).replace(/[^A-Za-z0-9_-]/g, (match) => `\\${match}`);
}
