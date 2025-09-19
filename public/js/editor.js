import { createEditor } from './editor/main.js';

function parseConfig(id, fallback = {}) {
  const el = document.getElementById(id);
  if (!el) {
    return fallback;
  }
  try {
    return JSON.parse(el.textContent || '{}');
  } catch (error) {
    console.error(`Failed to parse config from ${id}`, error);
    return fallback;
  }
}

const root = document.getElementById('editor-app');
const config = parseConfig('editor-config', {});
const baseConfig = parseConfig('editor-base-config', { globals: {}, elements: [], whitelist: [] });

if (root) {
  createEditor(root, { config, baseConfig });
} else {
  console.error('LocalUI Editor bootstrap failed: missing root container');
}
