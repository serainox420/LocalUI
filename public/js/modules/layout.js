export function normalizeLayout(value) {
  return value === 'grid' ? 'grid' : 'stack';
}

export function setupLayout(container, globals = {}) {
  container.className = '';
  const theme = globals.theme || {};
  const layout = normalizeLayout(theme.layout);
  const gap = theme.gap ?? 8;
  const margin = theme.margins ?? 12;

  if (layout === 'grid') {
    container.classList.add('grid', 'auto-rows-min', 'sm:grid-cols-2', 'xl:grid-cols-12');
  } else {
    container.classList.add('flex', 'flex-col');
  }
  container.dataset.layout = layout;
  container.style.gap = `${gap}px`;
  container.style.padding = `${margin}px`;
  return layout;
}
