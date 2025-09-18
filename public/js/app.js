import { initializeApp } from './modules/init.js';

const configEl = document.getElementById('app-config');
const root = document.getElementById('app');

if (!configEl || !root) {
  console.error('LocalUI bootstrap failed: missing app container or config');
} else {
  try {
    const config = JSON.parse(configEl.textContent || '{}');
    const app = initializeApp(root, config);
    if (app) {
      window.localUI = app;
    }
  } catch (error) {
    console.error('Invalid UI config', error);
  }
}
