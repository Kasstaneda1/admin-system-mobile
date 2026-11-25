// A sheet with a field (Finish, Skip): while the keyboard is up, the first tap outside a field only
// puts the keyboard away — it chooses nothing, skips nothing and closes nothing (QA 25.11: the
// sheet rides up with the keyboard, and a stray tap closed the visit). The next tap does the thing.
// keyboard — React Native's Keyboard ({ isVisible(), dismiss() }); focused — () => a field has the
// focus (TextInput.State.currentlyFocusedInput): the tap is swallowed only when both say so, so a
// lost «keyboard hidden» event (Android with a Modal) never leaves the buttons dead (the Teamlead
// on #106). Kept apart for the tests.
export function keyboardFirst(keyboard, fn, focused = null) {
  return (...args) => {
    const up = !!keyboard && typeof keyboard.isVisible === 'function' && keyboard.isVisible();
    const inField = typeof focused === 'function' ? !!focused() : true;
    if (up && inField) {
      keyboard.dismiss();
      return undefined;
    }
    return fn(...args);
  };
}
