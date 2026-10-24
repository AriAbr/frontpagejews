// Counts what visitors choose and do, as Google Analytics events, where the
// page loads it (see GA_MEASUREMENT_ID). Each event's parameters, like the
// country chosen, show in GA's reports once registered there as custom
// dimensions.
export function track(eventName, parameters = {}) {
  window.gtag?.("event", eventName, parameters);
}
