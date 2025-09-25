import { createAppState } from './state.js';
import { getSurfaceGridSize, normalizeSurface, setupLayout } from './layout.js';
import { createOverlayManager } from './overlay.js';
import { createResultViewFactory } from './presentation.js';
import { createRenderer } from './renderers.js';
import { createServerActions } from './server.js';
import { playElementSound } from './sound.js';

export function initializeApp(root, config) {
  const state = createAppState();
  const overlay = createOverlayManager();
  const createResultView = createResultViewFactory(overlay);
  const server = createServerActions({ state, playElementSound });
  const renderer = createRenderer({
    state,
    createResultView,
    playElementSound,
    server,
  });

  const globals = config.globals || {};
  const normalizedGlobals = {
    ...globals,
    surface: normalizeSurface(globals.surface || {}),
  };
  const rootLayout = setupLayout(root, normalizedGlobals);
  const gridSize = getSurfaceGridSize(normalizedGlobals);
  const rootContext = { layout: rootLayout, globals: normalizedGlobals, grid: gridSize };

  (config.elements || []).forEach((element) => {
    renderer.renderEntity(element, root, rootContext);
  });

  window.addEventListener('beforeunload', () => {
    state.stopAllPolls();
  });
}
