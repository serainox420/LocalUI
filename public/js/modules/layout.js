export const DEFAULT_SURFACE_WIDTH = 1200;
export const DEFAULT_SURFACE_HEIGHT = 720;
export const DEFAULT_SURFACE_COLUMNS = 12;
export const DEFAULT_GRID_SCALE = Math.round(DEFAULT_SURFACE_WIDTH / DEFAULT_SURFACE_COLUMNS);

export function normalizeLayout(value) {
  if (value === 'stack') {
    return 'stack';
  }
  if (value === 'freeform' || value === 'free') {
    return 'freeform';
  }
  return 'freeform';
}

function resolveSpacing(value, fallback = 0) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return numeric;
  }
  return fallback;
}

export function setupLayout(container, globals = {}) {
  container.className = '';
  const theme = globals.theme || {};
  const layout = normalizeLayout(theme.layout);
  const gap = resolveSpacing(theme.gap, 16);
  const margin = resolveSpacing(theme.margins, 24);
  const surface = normalizeSurface(globals.surface || {});

  container.dataset.layout = layout;
  container.style.padding = `${margin}px`;

  if (layout === 'stack') {
    container.classList.add('flex', 'flex-col');
    container.style.gap = `${gap}px`;
    container.style.position = '';
    container.style.width = '';
    container.style.height = '';
    container.style.removeProperty('--freeform-gap');
  } else {
    container.classList.add('ui-freeform-surface');
    container.style.position = 'relative';
    container.style.width = surface.width ? `${surface.width}px` : '';
    container.style.height = surface.height ? `${surface.height}px` : '';
    container.style.setProperty('--freeform-gap', `${gap}px`);
    container.style.gap = '';
  }

  applyThemeStyles(theme);

  return layout;
}

export function applyThemeStyles(theme = {}) {
  const palette = theme.palette || {};
  const root = document.documentElement;
  const body = document.body;

  if (root) {
    applyRootColor(root, '--primary-color', palette.primary);
    applyRootColor(root, '--accent-color', palette.accent);
    applyRootColor(root, '--surface-color', palette.surface);
    applyRootColor(root, '--muted-color', palette.muted);
    applyRootColor(root, '--danger-color', palette.danger);
  }

  if (body && theme.font) {
    body.style.fontFamily = theme.font;
  }
}

function applyRootColor(root, variable, value) {
  if (!root) {
    return;
  }
  if (value) {
    root.style.setProperty(variable, value);
  } else {
    root.style.removeProperty(variable);
  }
}

function resolveDimension(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function resolveGridSize(gridSize, widthFallback) {
  const numeric = Number(gridSize);
  if (Number.isFinite(numeric) && numeric > 0) {
    return { value: numeric, explicit: true };
  }
  const derived = Math.round(widthFallback / DEFAULT_SURFACE_COLUMNS);
  const value = Number.isFinite(derived) && derived > 0 ? derived : DEFAULT_GRID_SCALE;
  return { value, explicit: false };
}

export function normalizeSurface(surface = {}) {
  const width = resolveDimension(surface?.width, DEFAULT_SURFACE_WIDTH);
  const height = resolveDimension(surface?.height, DEFAULT_SURFACE_HEIGHT);
  const columnsCandidate = Number(surface?.columns);
  const columns = Number.isFinite(columnsCandidate) && columnsCandidate > 0 ? columnsCandidate : DEFAULT_SURFACE_COLUMNS;
  const grid = resolveGridSize(surface?.gridSize, width);
  return { width, height, gridSize: grid.value, gridExplicit: grid.explicit, columns };
}

export function getSurfaceGridSize(globals = {}, fallback = DEFAULT_GRID_SCALE) {
  const surface = normalizeSurface(globals.surface || {});
  const gap = resolveSpacing(globals?.theme?.gap, 0);
  if (!surface.gridExplicit) {
    const totalGap = gap * Math.max(0, (surface.columns || DEFAULT_SURFACE_COLUMNS) - 1);
    const availableWidth = surface.width - totalGap;
    const derived = availableWidth / Math.max(1, surface.columns || DEFAULT_SURFACE_COLUMNS);
    if (Number.isFinite(derived) && derived > 0) {
      return derived;
    }
  }
  return surface.gridSize || fallback;
}
