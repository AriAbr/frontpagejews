// What both charts need to agree on. Importing this also sets Chart.js's
// default text color, at the bottom.

const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name);
export const BACKGROUND = cssVar("--bg");

// The scatter colors its two highlighted dots like their coverage lines, so
// these must match across both charts. Blue and amber rather than blue and
// red, which would read as a US Democrat/Republican comparison; the pair also
// stays apart for colorblind readers.
export const COLORS = { focus: "#1d4ed8", comparison: "#d97706" };

// A short rise from the axis: shows the charts being built without the full
// second of the default.
export const ANIMATION = { duration: 500, easing: "easeOutCubic" };

Chart.defaults.color = cssVar("--muted");
