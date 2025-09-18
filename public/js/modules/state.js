export function createAppState() {
  const polls = new Map();
  const views = new Map();
  const elementIndex = new Map();
  const pendingUserActions = new Map();

  function markUserAction(elementId) {
    if (!elementId) {
      return;
    }
    const current = pendingUserActions.get(elementId) || 0;
    pendingUserActions.set(elementId, current + 1);
  }

  function consumeUserAction(elementId) {
    if (!elementId) {
      return false;
    }
    const current = pendingUserActions.get(elementId) || 0;
    if (current <= 0) {
      pendingUserActions.delete(elementId);
      return false;
    }
    if (current === 1) {
      pendingUserActions.delete(elementId);
    } else {
      pendingUserActions.set(elementId, current - 1);
    }
    return true;
  }

  function stopAllPolls() {
    polls.forEach((timer) => clearInterval(timer));
    polls.clear();
  }

  return {
    polls,
    views,
    elementIndex,
    markUserAction,
    consumeUserAction,
    stopAllPolls,
  };
}
