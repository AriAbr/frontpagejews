// What both charts need to agree on. Importing this also sets Chart.js's
// default text and grid colors, at the bottom.

const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name);
export const BACKGROUND = cssVar("--bg");

// The scatter colors its two highlighted dots like their coverage lines, so
// these must match across both charts. Blue and amber rather than blue and
// red, which would read as a US Democrat/Republican comparison; the pair also
// stays apart for colorblind readers. The blue is --focus in dashboard.css.
export const COLORS = { focus: cssVar("--focus").trim(), comparison: "#d97706" };

// A short rise from the axis: shows the charts being built without the full
// second of the default.
export const ANIMATION = { duration: 500, easing: "easeOutCubic" };

Chart.defaults.color = cssVar("--muted");
// Grid lines and axes in the page's border color at half strength (hex alpha
// 80): seen but not noticed. Chart.js's default is a faint black, which all but
// disappears in dark mode.
Chart.defaults.borderColor = `${cssVar("--border").trim()}80`;

// Hide the chart's tooltip when a press lands anywhere else on the page.
// Chart.js only hears events on its canvas, and hides the tooltip on the
// mouseout a phone sends the canvas when a later tap lands elsewhere. A phone
// sends that only after a tap on the canvas, not a drag, which it takes for a
// scroll: so a tooltip opened by dragging across the chart would stay open.
export function hideTooltipOnPressElsewhere(chart) {
  document.addEventListener("pointerdown", event => {
    if (event.target === chart.canvas || chart.getActiveElements().length === 0) return;
    chart.setActiveElements([]);
    chart.tooltip.setActiveElements([], { x: 0, y: 0 });
    chart.update();
  });
}
