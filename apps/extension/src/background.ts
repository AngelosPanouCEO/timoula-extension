/**
 * Service worker. Phase 1 keeps it minimal: the popup does the work on click.
 * (Phase 2: rules/ΛΤΠΦ refresh from the backend; phase 4: onboarding.)
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Reserved for the onboarding screen (phase 4).
  }
});
export {};
