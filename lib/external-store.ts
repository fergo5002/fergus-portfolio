/**
 * The smallest store `useSyncExternalStore` can read: a reducer, a current
 * state, and listeners. Module-level instances of this are how the drawer and
 * the terminal's history survive client navigation without being persisted
 * anywhere. Nothing here touches the DOM or storage.
 */
export type Store<S, E> = {
  get(): S;
  dispatch(event: E): void;
  subscribe(listener: () => void): () => void;
};

export function createStore<S, E>(reduce: (state: S, event: E) => S, initial: S): Store<S, E> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    dispatch(event) {
      const next = reduce(state, event);
      // Same object means nothing changed: no notification, no re-render.
      if (Object.is(next, state)) return;
      state = next;
      // Copied first, so a listener that unsubscribes another mid-loop cannot
      // change what this loop visits.
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
