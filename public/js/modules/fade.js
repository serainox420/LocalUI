const fadeStateKey = Symbol('fadeState');
const DEFAULT_FADE_DURATION = 400;

export function scheduleFadeOut(element, timeoutMs, removeFn) {
  const duration = Number(timeoutMs);
  if (!element || !Number.isFinite(duration) || duration <= 0) {
    return null;
  }
  return setTimeout(() => {
    fadeOutElement(element, removeFn);
  }, duration);
}

export function cancelFade(element) {
  if (!element) {
    return;
  }
  const state = element[fadeStateKey];
  if (state && typeof state.cancel === 'function') {
    state.cancel();
  }
}

function fadeOutElement(element, removeFn) {
  if (!element) {
    if (typeof removeFn === 'function') {
      removeFn();
    }
    return;
  }

  cancelFade(element);

  const remove = typeof removeFn === 'function' ? removeFn : () => element.remove();

  if (!element.isConnected) {
    remove();
    return;
  }

  element.classList.add('ui-fadeable');
  void element.offsetWidth;
  element.classList.add('is-fading');

  let finished = false;
  let fallbackTimer = null;

  const clearState = () => {
    element.removeEventListener('transitionend', onTransitionEnd);
    if (fallbackTimer !== null) {
      clearTimeout(fallbackTimer);
    }
    delete element[fadeStateKey];
  };

  const finish = () => {
    if (finished) {
      return;
    }
    finished = true;
    clearState();
    remove();
  };

  const onTransitionEnd = (event) => {
    if (event.target !== element || event.propertyName !== 'opacity') {
      return;
    }
    finish();
  };

  element.addEventListener('transitionend', onTransitionEnd);

  const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element);
  const variableDuration = Number.parseFloat(style?.getPropertyValue('--ui-fade-duration'));
  const fallbackDuration = Number.isFinite(variableDuration) ? variableDuration : DEFAULT_FADE_DURATION;
  fallbackTimer = setTimeout(finish, fallbackDuration + 100);

  element[fadeStateKey] = {
    cancel() {
      if (finished) {
        return;
      }
      clearState();
      element.classList.remove('is-fading');
    },
  };
}
