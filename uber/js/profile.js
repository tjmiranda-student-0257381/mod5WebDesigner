// Not a real account -- there is no server, no password, nothing is sent
// anywhere on its own. This just remembers a name/email on this device so
// the app can pre-address the backup email draft for you.
window.UberTracker = window.UberTracker || {};
window.UberTracker.profile = (() => {
  const KEY = 'uber_financials_profile_v1';

  function get() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  }

  function save(patch) {
    const merged = { ...get(), ...patch };
    localStorage.setItem(KEY, JSON.stringify(merged));
    return merged;
  }

  function isSet() {
    return !!get().email;
  }

  function markPromptSeen() {
    save({ promptSeen: true });
  }

  return { get, save, isSet, markPromptSeen };
})();
