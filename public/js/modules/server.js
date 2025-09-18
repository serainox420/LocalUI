export function createServerActions({ state, playElementSound }) {
  const { elementIndex, views, markUserAction, consumeUserAction } = state;

  async function runServerCommand(elementId, command, args, options = {}) {
    if (options.userTriggered) {
      markUserAction(elementId);
    }

    if (!command?.id) {
      showError(elementId, 'Command id missing');
      throw new Error('Command id missing');
    }

    const payload = {
      id: elementId,
      commandId: command.id,
      args: args || {},
    };

    let response;
    try {
      response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      showError(elementId, error.message);
      throw error;
    }

    if (!response.ok) {
      const message = await parseError(response);
      showError(elementId, message);
      throw new Error(message);
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      showError(elementId, error instanceof Error ? error.message : 'Invalid response');
      throw error;
    }
    applyResult(elementId, data);
    return data;
  }

  async function parseError(response) {
    try {
      const data = await response.json();
      return data.error || response.statusText;
    } catch (error) {
      return response.statusText;
    }
  }

  async function hydrate(elementId) {
    try {
      const response = await fetch(`/api/read?id=${encodeURIComponent(elementId)}`);
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      applyResult(elementId, data);
    } catch (error) {
      console.warn('hydrate failed', elementId, error);
    }
  }

  function shouldDisplayResult(element, hadPending) {
    if (!element) {
      return hadPending;
    }
    if (element.type === 'output' && element.mode === 'poll') {
      return true;
    }
    return hadPending;
  }

  function applyResult(elementId, payload) {
    const element = elementIndex.get(elementId);
    const view = views.get(elementId);
    const hadPending = consumeUserAction(elementId);

    if (!view || !payload || !payload.result) {
      return;
    }

    if (!shouldDisplayResult(element, hadPending)) {
      return;
    }

    view.showResult(payload);
    if (hadPending && payload.result.ok === false) {
      playElementSound(element, 'error');
    }
  }

  function showError(elementId, message) {
    const element = elementIndex.get(elementId);
    const view = views.get(elementId);
    const hadPending = consumeUserAction(elementId);

    if (!view || !shouldDisplayResult(element, hadPending)) {
      return;
    }

    view.showError(message);
    if (hadPending) {
      playElementSound(element, 'error');
    }
  }

  function executeClientScript(element, script) {
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('element', script);
      fn(element);
    } catch (error) {
      showError(element.id, error.message);
    }
  }

  return { runServerCommand, hydrate, executeClientScript };
}
