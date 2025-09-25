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
  const layoutInfo = setupLayout(root, normalizedGlobals);
  const rootLayout = layoutInfo.layout;
  const gridSize = getSurfaceGridSize(normalizedGlobals);
  const themeGap = Number(normalizedGlobals?.theme?.gap);
  const fallbackGap = Number.isFinite(themeGap) && themeGap >= 0 ? themeGap : 16;
  const gapValue = Number.isFinite(layoutInfo.gap) ? layoutInfo.gap : fallbackGap;
  const rootContext = {
    layout: rootLayout,
    globals: normalizedGlobals,
    grid: gridSize,
    gap: gapValue,
    freeformGap: gapValue,
  };

  (config.elements || []).forEach((element) => {
    renderer.renderEntity(element, root, rootContext);
  });

  window.addEventListener('beforeunload', () => {
    state.stopAllPolls();
  });
}
