// One queue for every change of what the phone keeps of My day (MY_DAY_KEY): the day
// screen and the visit screen under it both write the cache, e.g. when the app comes back
// and both refresh at once. Each change reads the cache as it is now, changes it, writes
// it, and only then the next one starts, so no write is lost to another's stale read.
// Without React Native: storage.js passes AsyncStorage's read and write,
// cacheQueue.test.mjs passes stand-ins.
//
// makeCacheQueue({ read, write }).update(change): change(cache) returns the new cache, or
// the same object (or null/undefined) for nothing to write. Resolves to the cache after
// it; a change that throws is skipped and the queue goes on.
export function makeCacheQueue({ read, write }) {
  let tail = Promise.resolve();
  function update(change) {
    const step = tail.then(async () => {
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
    // the next change waits for this one, whatever happened to it
    tail = step.catch(() => {});
    return step.catch(() => null);
  }
  return { update };
}
