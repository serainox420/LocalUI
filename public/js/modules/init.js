import { createAppState } from './state.js';
import { setupLayout } from './layout.js';
import { createOverlayManager } from './overlay.js';
import { createResultViewFactory } from './presentation.js';
import { createRenderer } from './renderers.js';
import { createServerActions } from './server.js';
import { playElementSound } from './sound.js';

export function initializeApp(root, initialConfig) {
  const state = createAppState();
  const overlay = createOverlayManager();
  const createResultView = createResultViewFactory(overlay);
  const server = createServerActions({ state, playElementSound });

  let currentConfig = null;
  let currentProfile = '';
  let isSwitching = false;
  let loadingLayer = null;
  let loadingText = null;

  const renderer = createRenderer({
    state,
    createResultView,
    playElementSound,
    server,
    loadConfig: handleLoadConfig,
  });

  applyConfig(initialConfig);

  window.addEventListener('beforeunload', () => {
    state.stopAllPolls();
  });

  function applyConfig(config) {
    const normalized = normalizeConfig(config);
    const globals = normalized.globals || {};
    applyTheme(globals);
    state.reset();
    if (typeof renderer.reset === 'function') {
      renderer.reset();
    }
    root.replaceChildren();
    const rootLayout = setupLayout(root, globals);
    const rootContext = { layout: rootLayout, globals, root };

    (normalized.elements || []).forEach((element) => {
      renderer.renderEntity(element, root, rootContext);
    });

    currentConfig = normalized;
    currentProfile = '';
  }

  async function handleLoadConfig(sourceElement, descriptor) {
    if (isSwitching) {
      showLoadError(sourceElement, 'Another interface is already loading.');
      return false;
    }

    const target = normalizeDescriptor(descriptor);
    if (!target) {
      showLoadError(sourceElement, 'Missing configuration reference.');
      return false;
    }

    isSwitching = true;
    showLoadingOverlay(target.loadingMessage || target.label || 'Loading interface…');

    try {
      const config = await fetchConfig(target.key);
      applyConfig(config);
      currentProfile = target.key;
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load interface.';
      showLoadError(sourceElement, message);
      return false;
    } finally {
      hideLoadingOverlay();
      isSwitching = false;
    }
  }

  function showLoadError(sourceElement, message) {
    if (sourceElement?.id) {
      const view = state.views.get(sourceElement.id);
      if (view && typeof view.showError === 'function') {
        view.showError(message);
        return;
      }
    }
    overlay.showNotification(message, { tone: 'error' });
  }

  async function fetchConfig(key) {
    const params = new URLSearchParams();
    if (key) {
      params.set('name', key);
    }
    const url = params.toString() ? `/api/config?${params}` : '/api/config';

    let response;
    try {
      response = await fetch(url, { headers: { Accept: 'application/json' } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network request failed.';
      throw new Error(message);
    }

    if (!response.ok) {
      const message = await extractError(response);
      throw new Error(message);
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      throw new Error('Unable to parse configuration response.');
    }

    if (!data || typeof data !== 'object' || typeof data.config !== 'object') {
      throw new Error('Configuration response was malformed.');
    }

    return data.config;
  }

  async function extractError(response) {
    try {
      const data = await response.json();
      if (data && typeof data === 'object' && typeof data.error === 'string') {
        return data.error;
      }
    } catch (error) {
      // ignore parsing errors
    }
    return response.statusText || 'Request failed.';
  }

  function normalizeDescriptor(descriptor) {
    if (descriptor === undefined) {
      return null;
    }

    if (descriptor === null) {
      return { key: '', label: '', loadingMessage: '' };
    }

    if (typeof descriptor === 'string') {
      const key = descriptor.trim();
      return { key, label: '', loadingMessage: '' };
    }

    if (typeof descriptor === 'object') {
      if (descriptor.useDefault === true || descriptor.default === true || descriptor.reset === true) {
        return {
          key: '',
          label: toText(descriptor.label ?? descriptor.title),
          loadingMessage: toText(descriptor.loadingMessage ?? descriptor.loading),
        };
      }

      const candidates = ['name', 'path', 'profile', 'target', 'config'];
      let key = '';
      for (const field of candidates) {
        const value = descriptor[field];
        if (typeof value === 'string' && value.trim() !== '') {
          key = value.trim();
          break;
        }
      }

      if (!key) {
        return null;
      }

      return {
        key,
        label: toText(descriptor.label ?? descriptor.title),
        loadingMessage: toText(descriptor.loadingMessage ?? descriptor.loading),
      };
    }

    return null;
  }

  function normalizeConfig(value) {
    if (!value || typeof value !== 'object') {
      return { globals: {}, elements: [], whitelist: [] };
    }
    return value;
  }

  function applyTheme(globals = {}) {
    const theme = globals.theme || {};
    const palette = theme.palette || {};
    const rootStyle = document.documentElement?.style;

    if (rootStyle) {
      setVar(rootStyle, '--primary-color', palette.primary);
      setVar(rootStyle, '--accent-color', palette.accent);
      setVar(rootStyle, '--surface-color', palette.surface);
      setVar(rootStyle, '--text-secondary', palette.muted);
      setVar(rootStyle, '--danger-color', palette.danger);
    }

    if (typeof theme.font === 'string' && theme.font.trim() !== '') {
      document.body.style.fontFamily = theme.font;
    } else {
      document.body.style.removeProperty('font-family');
    }
  }

  function setVar(style, name, value) {
    if (typeof value === 'string' && value.trim() !== '') {
      style.setProperty(name, value);
    } else {
      style.removeProperty(name);
    }
  }

  function showLoadingOverlay(message) {
    if (!loadingLayer) {
      loadingLayer = document.createElement('div');
      loadingLayer.className = 'ui-app-loading-layer';

      const spinner = document.createElement('div');
      spinner.className = 'ui-app-loading-spinner';
      loadingLayer.appendChild(spinner);

      loadingText = document.createElement('div');
      loadingText.className = 'ui-app-loading-text';
      loadingLayer.appendChild(loadingText);
    }

    if (loadingText) {
      loadingText.textContent = message || 'Loading interface…';
    }

    if (!loadingLayer.isConnected) {
      document.body.appendChild(loadingLayer);
    }
  }

  function hideLoadingOverlay() {
    if (loadingLayer && loadingLayer.parentNode) {
      loadingLayer.remove();
    }
  }

  function toText(value) {
    return typeof value === 'string' ? value : '';
  }

  return {
    loadConfig: (descriptor) => handleLoadConfig(null, descriptor),
    applyConfig,
    getCurrentConfig: () => currentConfig,
    getCurrentProfile: () => currentProfile,
    isSwitching: () => isSwitching,
  };
}
