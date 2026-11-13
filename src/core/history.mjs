// Undo and redo for one JSON value (the body of an article). Pure: the Studio calls `checkpoint`
// right before it changes something and `undo` / `redo` when the person asks.
//
// Typing in one field produces a stream of changes; they are merged into a single step while they
// share a `key` and arrive close together, so one Ctrl+Z undoes a burst of typing, not one letter.

export function createHistory({ limit = 100, mergeMs = 900, now = () => Date.now() } = {}) {
  let past = [];
  let future = [];
  let lastKey = null;
  let lastAt = 0;
  const snap = (value) => JSON.stringify(value);

  return {
    /**
     * Record the state as it is now, before a change is applied.
     * @param {unknown} value the current value (it is copied)
     * @param {string} [key] changes with the same key close together are one step
     */
    checkpoint(value, key = null) {
      const at = now();
      const merge = key !== null && key === lastKey && at - lastAt < mergeMs && past.length > 0;
      lastKey = key; lastAt = at;
      if (merge) return;
      const s = snap(value);
      if (past.at(-1) === s) return;
      past.push(s);
      if (past.length > limit) past = past.slice(past.length - limit);
      future = [];
    },
    /** @returns {unknown|undefined} the previous state, or undefined when there is nothing to undo */
    undo(current) {
      if (!past.length) return undefined;
      future.push(snap(current));
      lastKey = null;
      return JSON.parse(past.pop());
    },
    redo(current) {
      if (!future.length) return undefined;
      past.push(snap(current));
      lastKey = null;
      return JSON.parse(future.pop());
    },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    /** Break the merge: the next checkpoint starts a new step. */
    seal() { lastKey = null; },
    clear() { past = []; future = []; lastKey = null; },
    get size() { return past.length; },
  };
}
