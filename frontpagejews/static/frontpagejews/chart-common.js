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
// From the line drawn down the hovered day to the tooltip's edge.
const DAY_LINE_GAP = 8;
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
    // A dataset's tooltipGroup, {name, color, footer}, puts its line under a
    // heading shared with the datasets next to it in the same group: the
    // country, in the line chart. Its footer, given the point's index, returns
    // what goes under the group's last line, or null for nothing.
    const { tooltipGroup } = tooltip.dataPoints[i].dataset;
    if (tooltipGroup && tooltipGroup !== tooltip.dataPoints[i - 1]?.dataset.tooltipGroup) {
      const heading = document.createElement("div");
      heading.className = "group";
      heading.style.color = tooltipGroup.color;
      heading.textContent = tooltipGroup.name;
      rows.push(heading);
    }
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
    if (tooltipGroup?.footer && tooltipGroup !== tooltip.dataPoints[i + 1]?.dataset.tooltipGroup) {
      const footer = tooltipGroup.footer(tooltip.dataPoints[i].dataIndex);
      if (footer) {
        const row = document.createElement("div");
        row.className = "group-footer";
        row.append(footer);
        rows.push(row);
      }
    }
  });
  // The footer callback's lines, under everything: the line chart's note on a
  // day without data.
  for (const text of tooltip.footer) {
    if (!text) continue;
    const row = document.createElement("div");
    row.className = "footer";
    row.textContent = text;
    rows.push(row);
  }
  tooltipElement.replaceChildren(...rows);

  // To the right of the point, or to its left where it would run off the
  // window; centered on it vertically, but kept inside the window. The caret
  // is on the side facing the point, level with it.
  //
  // On a phone, a point in the middle can have room on neither side, and a
  // box pushed back inside the window covers it. A chart whose tooltip sets
  // `aboveOrBelowIfNoRoomBeside` (the scatter, where the point is the
  // country) puts it above the point there instead, or below where there's no
  // room above, centered on it but kept inside the window, with the caret on
  // the edge facing the point, in line with it.
  //
  // A chart whose tooltip sets `atTopBesideDay` (the line chart, whose tooltip
  // is for a day, not a point) puts it at the top of the plot, beside the line
  // drawn down that day, with no caret: the line ties them. It stays at the
  // top as the day changes rather than following the lines up and down.
  const canvas = chart.canvas.getBoundingClientRect();
  const atTopBesideDay = tooltip.options.atTopBesideDay;
  const pointX = canvas.left + tooltip.caretX;
  const pointY = canvas.top + (atTopBesideDay ? chart.chartArea.top : tooltip.caretY);
  const gap = atTopBesideDay ? DAY_LINE_GAP : POINT_GAP;
  const { width, height } = tooltipElement.getBoundingClientRect();
  // The window less any scrollbar, which innerWidth and innerHeight include.
  const { clientWidth: windowWidth, clientHeight: windowHeight } = document.documentElement;
  // The summary bar covers the window's top once the page is scrolled down,
  // and is drawn over the tooltip, so the room starts below it.
  const summaryBar = document.getElementById("summary-bar");
  const windowTop = summaryBar?.classList.contains("shown") ? summaryBar.getBoundingClientRect().bottom : 0;
  const keptInside = (start, size, windowStart, windowEnd) =>
    Math.min(Math.max(windowStart + TOOLTIP_GAP, start), windowEnd - TOOLTIP_GAP - size);
  const fitsRight = pointX + gap + width <= windowWidth - TOOLTIP_GAP;
  const fitsLeft = pointX - gap - width >= TOOLTIP_GAP;
  let side;
  let left;
  let top;
  if (fitsRight || fitsLeft || !tooltip.options.aboveOrBelowIfNoRoomBeside) {
    side = fitsRight ? "right" : "left";
    left = Math.round(Math.max(TOOLTIP_GAP, fitsRight ? pointX + gap : pointX - gap - width));
    top = Math.round(keptInside(atTopBesideDay ? pointY : pointY - height / 2, height, windowTop, windowHeight));
    const caretY = Math.min(Math.max(CARET_INSET, pointY - top), height - CARET_INSET);
    tooltipElement.style.setProperty("--caret-y", `${caretY}px`);
  } else {
    side = pointY - POINT_GAP - height >= windowTop + TOOLTIP_GAP ? "above" : "below";
    top = Math.round(side === "above" ? pointY - POINT_GAP - height : pointY + POINT_GAP);
    left = Math.round(keptInside(pointX - width / 2, width, 0, windowWidth));
    const caretX = Math.min(Math.max(CARET_INSET, pointX - left), width - CARET_INSET);
    tooltipElement.style.setProperty("--caret-x", `${caretX}px`);
  }
  tooltipElement.classList.toggle("no-caret", Boolean(atTopBesideDay));
  tooltipElement.classList.toggle("caret-right", side === "left");
  tooltipElement.classList.toggle("caret-below", side === "above");
  tooltipElement.classList.toggle("caret-above", side === "below");
  // It glides from one point to the next, but where it was hidden, it fades
  // in at the new point rather than gliding over from where it last was.
  tooltipElement.classList.toggle("gliding", tooltipElement.classList.contains("shown"));
  tooltipElement.classList.add("shown");
  // Whole pixels, so the text is sharp once it stops. Rounded before the
  // caret is placed, so the caret, at its exact place, points at the point.
  const pageX = Math.round(left + window.scrollX);
  const pageY = Math.round(top + window.scrollY);
  tooltipElement.style.transform = `translate(${pageX}px, ${pageY}px)`;
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

// Room between a note's explanation and the window's edge, as for tooltips.
const WINDOW_GAP = 12;

// A "No data ⓘ" button over a chart, added to `parent`, whose explanation
// shows while it's hovered or focused: tapping it focuses it on a phone, and
// tapping elsewhere hides it again.
export function noDataNoteElement(parent, explanation) {
  const note = document.createElement("div");
  note.className = "no-data-note";
  const button = document.createElement("button");
  button.type = "button";
  button.innerHTML =
    'No data <svg class="info" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="M8 7.5v4M8 4.75v.5"/></svg>';
  const popover = document.createElement("div");
  popover.className = "explanation";
  popover.id = `no-data-${crypto.randomUUID()}`;
  popover.setAttribute("role", "tooltip");
  popover.textContent = explanation;
  button.setAttribute("aria-describedby", popover.id);
  note.append(button, popover);
  // Shifted sideways as it opens, if it would run off the window: on a
  // phone, a note near the plot's edge would otherwise push it off.
  const keepInWindow = () => {
    popover.style.marginLeft = "";
    const { left, right } = popover.getBoundingClientRect();
    const windowWidth = document.documentElement.clientWidth;
    const shift = Math.max(WINDOW_GAP - left, 0) - Math.max(right - (windowWidth - WINDOW_GAP), 0);
    popover.style.marginLeft = `${shift}px`;
  };
  note.addEventListener("mouseenter", keepInWindow);
  note.addEventListener("focusin", keepInWindow);
  parent.append(note);
  return note;
}
