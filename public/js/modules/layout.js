export const DEFAULT_GRID_SCALE = 48;
export const DEFAULT_SURFACE_WIDTH = 1200;
export const DEFAULT_SURFACE_HEIGHT = 720;

export function normalizeLayout(value) {
  if (value === 'stack') {
    return 'stack';
  }
  if (value === 'freeform' || value === 'free') {
    return 'freeform';
  }
  return 'freeform';
}

export function setupLayout(container, globals = {}) {
  container.className = '';
  const theme = globals.theme || {};
  const layout = normalizeLayout(theme.layout);
  const gap = theme.gap ?? 8;
  const margin = theme.margins ?? 12;
  const surface = normalizeSurface(globals.surface);

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

export function normalizeSurface(surface = {}) {
  const width = Number(surface.width);
  const height = Number(surface.height);
  const gridSize = Number(surface.gridSize);
  return {
    width: Number.isFinite(width) && width > 0 ? width : DEFAULT_SURFACE_WIDTH,
    height: Number.isFinite(height) && height > 0 ? height : DEFAULT_SURFACE_HEIGHT,
    gridSize: Number.isFinite(gridSize) && gridSize > 0 ? gridSize : DEFAULT_GRID_SCALE,
  };
}

export function getSurfaceGridSize(globals = {}, fallback = DEFAULT_GRID_SCALE) {
  const surface = normalizeSurface(globals.surface || {});
  return surface.gridSize || fallback;
}
