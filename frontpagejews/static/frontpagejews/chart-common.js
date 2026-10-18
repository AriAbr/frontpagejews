// What both charts need to agree on. Importing this also sets Chart.js's
// default font, text and grid colors, and tooltip, at the bottom.

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

// The page's font rather than Chart.js's Helvetica, so the ticks, tooltips and
// notes on the canvas match the HTML legend and captions around them.
Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
Chart.defaults.color = cssVar("--muted");
// Grid lines and axes in the page's border color at half strength (hex alpha
// 80): seen but not noticed. Chart.js's default is a faint black, which all but
// disappears in dark mode.
Chart.defaults.borderColor = `${cssVar("--border").trim()}80`;

// Both charts' tooltips, as an element in the page rather than drawn on the
// canvas: canvas text is drawn at the dot's fractional position, without the
// browser's subpixel smoothing, and looks soft beside the page's own text. It
// goes in the body, not by the chart, so the scatter's scrolling box neither
// clips it nor fades it at its edges.
Chart.defaults.plugins.tooltip.enabled = false;
Chart.defaults.plugins.tooltip.external = drawTooltip;

// Room between the tooltip and the window's edge.
const TOOLTIP_GAP = 12;
// From the point to the tooltip's edge: room for its caret (6px) and for the
// tip to clear the scatter's biggest dot, hovered (11px across the middle).
const POINT_GAP = 18;
// The caret stays this far inside the tooltip's top and bottom, clear of the
// rounded corners.
const CARET_INSET = 10;

let tooltipElement;

function drawTooltip({ chart, tooltip }) {
  if (!tooltipElement) {
    tooltipElement = document.createElement("div");
    tooltipElement.className = "chart-tooltip";
    tooltipElement.addEventListener("transitionend", parkTooltip);
    document.body.append(tooltipElement);
  }
  if (tooltip.opacity === 0) {
    tooltipElement.classList.remove("shown");
    // With no fade, there's no transitionend to wait for.
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) parkTooltip();
    return;
  }

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = tooltip.title.join(" ");
  const rows = [title];
  tooltip.body.forEach((bodyItem, i) => {
    bodyItem.lines.forEach((text, lineIndex) => {
      const row = document.createElement("div");
      // A short line in the series' color and dash, as in the legend, on the
      // first line of each item only.
      if (tooltip.options.displayColors && lineIndex === 0) {
        // The dash from the dataset: labelColors takes its styles from the
        // hovered point, which has none.
        const { borderColor, borderDash } = tooltip.dataPoints[i].dataset;
        const swatch = document.createElement("span");
        swatch.className = "swatch";
        swatch.style.borderTopColor = borderColor;
        if (borderDash?.length) swatch.style.borderTopStyle = "dashed";
        row.append(swatch);
      }
      row.append(text);
      rows.push(row);
    });
  });
  tooltipElement.replaceChildren(...rows);

  // To the right of the point, or to its left where it would run off the
  // window; centered on it vertically, but kept inside the window. The caret
  // is on the side facing the point, level with it.
  const canvas = chart.canvas.getBoundingClientRect();
  const pointX = canvas.left + tooltip.caretX;
  const pointY = canvas.top + tooltip.caretY;
  const { width, height } = tooltipElement.getBoundingClientRect();
  // The window less any scrollbar, which innerWidth and innerHeight include.
  const { clientWidth: windowWidth, clientHeight: windowHeight } = document.documentElement;
  let left = pointX + POINT_GAP;
  const flipped = left + width > windowWidth - TOOLTIP_GAP;
  if (flipped) left = pointX - POINT_GAP - width;
  left = Math.max(TOOLTIP_GAP, left);
  const top = Math.min(Math.max(TOOLTIP_GAP, pointY - height / 2), windowHeight - TOOLTIP_GAP - height);
  const caretY = Math.min(Math.max(CARET_INSET, pointY - top), height - CARET_INSET);
  tooltipElement.classList.toggle("caret-right", flipped);
  // It glides from one point to the next, but where it was hidden, it fades
  // in at the new point rather than gliding over from where it last was.
  tooltipElement.classList.toggle("gliding", tooltipElement.classList.contains("shown"));
  tooltipElement.classList.add("shown");
  // Whole pixels, so the text is sharp once it stops.
  const pageX = Math.round(left + window.scrollX);
  const pageY = Math.round(top + window.scrollY);
  tooltipElement.style.transform = `translate(${pageX}px, ${pageY}px)`;
  tooltipElement.style.setProperty("--caret-y", `${Math.round(caretY)}px`);
}

// Once faded out, back to the page's top left corner. Left where it was, near
// the right edge, it would widen the page once the window narrowed, since it
// is in the body but not clipped by it.
function parkTooltip() {
  if (!tooltipElement.classList.contains("shown")) tooltipElement.style.transform = "";
}

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
