import { createAppState } from './state.js';
import { setupLayout } from './layout.js';
import { createOverlayManager } from './overlay.js';
import { createResultViewFactory } from './presentation.js';
import { createRenderer } from './renderers.js';
import { createServerActions } from './server.js';
import { playElementSound } from './sound.js';

export function initializeApp(root, appConfig = {}) {
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

  const config = appConfig && typeof appConfig === 'object' ? appConfig : {};
  const globals = config.globals && typeof config.globals === 'object' ? config.globals : {};
  const rootLayout = setupLayout(root, globals);
  const rootContext = { layout: rootLayout, globals, root };

  const elements = Array.isArray(config.elements) ? config.elements : [];

  elements.forEach((element) => {
    renderer.renderEntity(element, root, rootContext);
  });

  window.addEventListener('beforeunload', () => {
    state.stopAllPolls();
  });
}
