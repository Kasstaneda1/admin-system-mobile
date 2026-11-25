// A sheet with a field (Finish, Skip): while the keyboard is up, the first tap outside a field only
// puts the keyboard away — it chooses nothing, skips nothing and closes nothing (QA 25.11: the
// sheet rides up with the keyboard, and a stray tap closed the visit). The next tap does the thing.
// keyboard — React Native's Keyboard ({ isVisible(), dismiss() }); kept apart for the tests.
export function keyboardFirst(keyboard, fn) {
  return (...args) => {
    if (keyboard && typeof keyboard.isVisible === 'function' && keyboard.isVisible()) {
      keyboard.dismiss();
      return undefined;
    }
    return fn(...args);
  };
}
