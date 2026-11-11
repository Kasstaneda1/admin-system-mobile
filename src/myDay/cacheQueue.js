// One queue for every change of what the phone keeps of My day (MY_DAY_KEY): the day
// screen and the visit screen under it both write the cache, e.g. when the app comes back
// and both refresh at once. Each change reads the cache as it is now, changes it, writes
// it, and only then the next one starts, so no write is lost to another's stale read.
// Sign out clears the cache in the same queue: an answer that was on its way when the
// technician signed out must not bring the day back onto the phone.
// Without React Native: storage.js passes AsyncStorage's read, write and remove,
// cacheQueue.test.mjs passes stand-ins.
//
// makeCacheQueue({ read, write, remove }):
//   mark() — taken when the screen asks the server, before the request: which session the
//            answer belongs to;
//   update(change, mark) — change(cache) returns the new cache, or the same object (or
//            null/undefined) for nothing to write. Resolves to the cache after it; a change
//            that throws is skipped and the queue goes on. A change marked before the
//            latest clear() is dropped (resolves to null): its answer came after sign out;
//   clear() — sign out: every mark taken so far is old at once, and the cache is removed
//            after the change already running, if any. Resolves when it is gone; never throws.
export function makeCacheQueue({ read, write, remove }) {
  let tail = Promise.resolve();
  let session = { n: 0 };

  function enqueue(run) {
    const step = tail.then(run);
    // the next step waits for this one, whatever happened to it
    tail = step.catch(() => {});
    return step.catch(() => null);
  }

  function update(change, from) {
    return enqueue(async () => {
      if (from !== session) return null;
      const before = await read();
      let after;
      try {
        after = change(before);
      } catch {
        return before;
      }
      if (after && after !== before) await write(after);
      return after || before;
    });
  }

  function clear() {
    session = { n: session.n + 1 };
    return enqueue(async () => {
      await remove();
      return null;
    });
  }

  return { update, clear, mark: () => session };
}
