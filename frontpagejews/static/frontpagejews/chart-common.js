// What both charts need to agree on. Importing this also sets Chart.js's
// default text and grid colors, at the bottom.

const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name);
export const BACKGROUND = cssVar("--bg");

// The scatter colors its two highlighted dots like their coverage lines, so
// these must match across both charts. Blue and amber rather than blue and
// red, which would read as a US Democrat/Republican comparison; the pair also
// stays apart for colorblind readers. The blue is a shade lighter in dark mode
// (see --focus in dashboard.css).
export const COLORS = { focus: cssVar("--focus").trim(), comparison: "#d97706" };

// A short rise from the axis: shows the charts being built without the full
// second of the default.
export const ANIMATION = { duration: 500, easing: "easeOutCubic" };

Chart.defaults.color = cssVar("--muted");
// Grid lines and axes in the page's border color at half strength (hex alpha
// 80): seen but not noticed. Chart.js's default is a faint black, which all but
// disappears in dark mode.
Chart.defaults.borderColor = `${cssVar("--border").trim()}80`;
