const soundCache = new Map();

export function playElementSound(element, ...variants) {
  if (!element) {
    return;
  }
  const source = resolveSoundSource(element.sound, variants);
  if (!source) {
    return;
  }
  playSoundFile(source);
}

function resolveSoundSource(soundConfig, variants = []) {
  if (!soundConfig) {
    return null;
  }
  if (typeof soundConfig === 'string') {
    const trimmed = soundConfig.trim();
    return trimmed || null;
  }
  if (typeof soundConfig !== 'object') {
    return null;
  }

  const queue = [];
  if (Array.isArray(variants)) {
    variants.forEach((key) => {
      if (typeof key === 'string' && key && !queue.includes(key)) {
        queue.push(key);
      }
    });
  }
  if (!queue.includes('default')) {
    queue.push('default');
  }

  for (const key of queue) {
    const value = soundConfig[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return null;
}

function playSoundFile(filename) {
  const sanitized = String(filename || '').trim();
  if (!sanitized || typeof Audio !== 'function') {
    return;
  }
  const src = `/sound/${encodeURIComponent(sanitized)}`;
  let base = soundCache.get(src);
  if (!base) {
    base = new Audio(src);
    base.preload = 'auto';
    soundCache.set(src, base);
  }
  const instance = base.cloneNode(true);
  instance.preload = 'auto';
  instance.src = base.src;
  instance.currentTime = 0;
  instance.play().catch((error) => {
    console.warn('Unable to play sound', sanitized, error);
  });
}
