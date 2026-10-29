// Every country's share of mentions against its figure for the chosen
// benchmark, with a dashed line where its shares of the two are equal.
//
// Linear axes, drawn to scale: rather than breaking or bending an axis, the
// chart is made as wide as it needs to be for the dashed line to sit at 45
// degrees, and scrolls sideways. Most countries sit near the origin, because a
// few countries are huge and most are small.
import { ANIMATION, BACKGROUND, COLORS, hideTooltipOnPressElsewhere, noDataNoteElement } from "./chart-common.js";
import { multiple, percent } from "./formats.js";
import { arrowIcon } from "./icons.js";

// Rounded up to this, so the coverage axis ends on a round number.
const COVERAGE_AXIS_STEP = 0.01;
const OTHER_COUNTRIES_COLOR = "#a8a29e99";
// The axes for a period without data, which has no shares to size them by: a
// usual range, so the empty chart shows what would be there. The benchmark's
// is a share of its world total, and the chart's width keeps the dashed line
// at 45 degrees as always.
const WITHOUT_DATA_COVERAGE_AXIS_MAX = 0.1;
const WITHOUT_DATA_BENCHMARK_AXIS_SHARE = 0.15;

const roundUp = (n, step) => Math.ceil(n / step) * step;
// Axis ticks fall on whole percents: 0.05 → "5%".
const tickPercent = fraction => `${Math.round(fraction * 100)}%`;

// points: {code, name, mentions, mentionsPercentage, benchmarkFigure,
// benchmarkPercentage} per country, the percentages as fractions of the total.
// benchmarkTotal: the benchmark's total, so a figure over it is a share.
// benchmarkDisplaySettings: the benchmark's entry in BENCHMARK_DISPLAY_SETTINGS.
// period: the days the mentions cover, as the page names them: "last 30 days", "March 2024".
// noDataExplanation: for a period without a single day of data, why. The
// chart is drawn without dots, so it's clear what would be there, and the
// plot is shaded with the line chart's "No data ⓘ" note over it.
export function drawScatter({ points, benchmarkTotal, benchmarkDisplaySettings, period, focus, comparison, noDataExplanation }) {
  const coverageAxisMax = noDataExplanation
    ? WITHOUT_DATA_COVERAGE_AXIS_MAX
    : roundUp(Math.max(COVERAGE_AXIS_STEP, ...points.map(p => p.mentionsPercentage)), COVERAGE_AXIS_STEP);
  // The benchmark's usual end, or past it to the next grid line where a
  // country's figure is larger (Ethiopia's deaths in the Tigray war). The
  // chart's width keeps the dashed line at 45 degrees, so the scale stays the
  // same: the chart just runs further to the right.
  const largestFigure = Math.max(...points.map(p => p.benchmarkFigure));
  const benchmarkAxisMax = noDataExplanation
    ? roundUp(WITHOUT_DATA_BENCHMARK_AXIS_SHARE * benchmarkTotal, benchmarkDisplaySettings.axisStep)
    : Math.max(benchmarkDisplaySettings.axisMax, roundUp(largestFigure, benchmarkDisplaySettings.axisStep));

  // One group of dots. Each dot keeps its whole point, so the tooltip and
  // clicks can use its name and code; `parsing` says which fields to plot.
  const dots = ({ label, countries, color, radius }) => ({
    label,
    data: points.filter(countries),
    parsing: { xAxisKey: "benchmarkFigure", yAxisKey: "mentionsPercentage" },
    backgroundColor: color,
    borderColor: BACKGROUND,
    borderWidth: 2,
    pointRadius: radius,
    pointHoverRadius: radius + 2,
    pointHitRadius: 6,
  });
  const isHighlighted = p => p.code === focus.code || p.code === comparison.code;
  // A highlighted country's color, as in the legend; other countries have none.
  const colorOf = p => {
    if (p.code === focus.code) return COLORS.focus;
    if (p.code === comparison.code) return COLORS.comparison;
    return null;
  };

  // The dashed line runs from the origin until it leaves the chart, through the
  // top edge or the right one, whichever it reaches first.
  // A figure's share of the total: the line's height above it.
  const slope = 1 / benchmarkTotal;
  const lineEnd = Math.min(benchmarkAxisMax, coverageAxisMax / slope);

  // Names the countries scrolled out of view: after every layout of the chart
  // (including the widening below, which Chart.js applies a moment later),
  // whenever the scrolling area changes size, and on every scroll.
  const scrollArea = document.getElementById("scatter-scroll");
  const showOffscreen = chart => drawOffscreen(chart, scrollArea, points, colorOf);

  const scatter = new Chart(document.getElementById("scatter"), {
    type: "scatter",
    data: {
      // Chart.js draws the datasets from last to first, so earlier ones land on
      // top: the comparison country first, so the dots crowded near the origin
      // never bury it, and the dashed line last, under every dot.
      datasets: [
        dots({
          label: comparison.name,
          countries: p => p.code === comparison.code,
          color: COLORS.comparison,
          radius: 7,
        }),
        dots({ label: focus.name, countries: p => p.code === focus.code, color: COLORS.focus, radius: 7 }),
        dots({ label: "Other countries", countries: p => !isHighlighted(p), color: OTHER_COUNTRIES_COLOR, radius: 4 }),
        {
          type: "line",
          label: "Proportionate coverage",
          data: [{ x: 0, y: 0 }, { x: lineEnd, y: lineEnd * slope }],
          borderColor: Chart.defaults.color,
          borderDash: [4, 4],
          borderWidth: 1,
          pointRadius: 0,
          pointHitRadius: 0,
        },
      ],
    },
    options: {
      animation: ANIMATION,
      maintainAspectRatio: false,
      // One country per tooltip, the one under the cursor. The scatter
      // default lists every dot in range under the first one's name.
      interaction: { mode: "nearest", intersect: true },
      scales: {
        x: {
          type: "linear",
          min: 0,
          max: benchmarkAxisMax,
          ticks: {
            stepSize: benchmarkDisplaySettings.axisStep,
            callback: value => {
              // No zero: the pinned y-axis covers it, and the y-axis's "0%" marks the origin.
              if (value === 0) return "";
              const labelStep = benchmarkDisplaySettings.labelStep;
              if (labelStep && value % labelStep !== 0) return "";
              return benchmarkDisplaySettings.format(value);
            },
          },
        },
        y: {
          type: "linear",
          min: 0,
          max: coverageAxisMax,
          title: { display: true, text: `Share of coverage, ${period}` },
          ticks: { stepSize: COVERAGE_AXIS_STEP, callback: tickPercent },
        },
      },
      plugins: {
        // The legend is drawn in the page instead, above the scrolling chart, so it
        // stays in view. See drawLegend.
        legend: { display: false },
        tooltip: {
          // Only dots get a tooltip; the line's points have no name.
          filter: item => item.raw.name,
          // One country, whose dot is right there: a color swatch adds nothing.
          displayColors: false,
          // Above or below the dot where there's no room beside it, rather than
          // over it. See drawTooltip in chart-common.js.
          aboveOrBelowIfNoRoomBeside: true,
          callbacks: {
            title: items => items[0].raw.name,
            label: ({ raw: { mentions, mentionsPercentage, benchmarkFigure, benchmarkPercentage } }) => {
              // The benchmark, then coverage, as the axes go, so the share
              // of coverage sits next to its multiple of the benchmark.
              const lines = [
                benchmarkDisplaySettings.describeFigure(benchmarkFigure, benchmarkPercentage),
                `${percent(mentionsPercentage)} share of coverage (${mentions.toLocaleString()} mentions)`,
              ];
              // A multiple of nothing means nothing.
              if (benchmarkPercentage) lines.push(`${multiple(mentionsPercentage, benchmarkPercentage)} expected share`);
              return lines;
            },
          },
        },
      },
    },
    plugins: [
      pinnedAxis(document.getElementById("scatter-y-axis")),
      { id: "offscreen", afterLayout: showOffscreen },
      ...(noDataExplanation ? [shadedWithoutData(scrollArea, noDataExplanation)] : []),
    ],
  });
  hideTooltipOnPressElsewhere(scatter);

  drawLegend([
    { label: "Other countries", color: OTHER_COUNTRIES_COLOR },
    { label: comparison.name, color: COLORS.comparison },
    { label: focus.name, color: COLORS.focus },
  ]);
  // The x-axis title is in the page too, below the scrolling chart, so it stays
  // centered in view.
  document.getElementById("scatter-x-title").textContent = benchmarkDisplaySettings.label;

  // Widen the chart until the dashed line sits at 45 degrees. That happens
  // when the plot area's width-to-height ratio equals the line's rise over the
  // whole benchmark axis, divided by the coverage axis. The legend and axis
  // labels take up fixed space around the plot area, so that is measured from
  // what Chart.js actually laid out and added back on.
  const area = scatter.chartArea;
  const plotHeight = area.bottom - area.top;
  const aroundPlot = scatter.width - (area.right - area.left);
  const plotWidth = plotHeight * ((slope * benchmarkAxisMax) / coverageAxisMax);
  const chartWidth = Math.round(plotWidth + aroundPlot);
  document.getElementById("scatter-wrap").style.width = `${chartWidth}px`;
  // The scrolling area shows the chart without its y-axis, which is beside it.
  document.getElementById("scatter-scroll").style.width = `${chartWidth - axisWidth(scatter)}px`;
  // And the badges above it, over the same span.
  document.getElementById("scatter-offscreen-spacer").style.width = `${axisWidth(scatter)}px`;
  document.getElementById("scatter-offscreen").style.width = `${chartWidth - axisWidth(scatter)}px`;
  scatter.resize();

  // The scrolling area's width settles after the chart's layout (it grows when
  // the y-axis beside it shrinks to size), and changes with the window.
  new ResizeObserver(() => showOffscreen(scatter)).observe(scrollArea);
  scrollArea.addEventListener("scroll", () => showOffscreen(scatter), { passive: true });
}

// A Chart.js plugin shading the plot, as the line chart shades its days
// without data, with the note over it: in the middle of the part in view,
// since the plot can be wider than the window. Placed after every layout, as
// the chart widens itself once it's first drawn.
function shadedWithoutData(scrollArea, explanation) {
  let shade;
  let note;
  return {
    id: "shadedWithoutData",
    afterLayout(scatter) {
      if (!shade) {
        shade = document.createElement("div");
        shade.className = "scatter-without-data";
        scatter.canvas.parentElement.append(shade);
        note = noDataNoteElement(shade, explanation);
        note.dataset.side = "center";
        note.style.top = "50%";
      }
      const { left, top, width, height } = scatter.chartArea;
      shade.style.left = `${left}px`;
      shade.style.top = `${top}px`;
      shade.style.width = `${width}px`;
      shade.style.height = `${height}px`;
      note.style.left = `${Math.min(width, scrollArea.clientWidth) / 2}px`;
    },
  };
}

// Badges over the plot's edges for the countries off the left and right of the
// visible part of the plot: "China, India, and 1 other →".
function drawOffscreen(scatter, scrollArea, points, colorOf) {
  // The visible part of the plot, in the chart's pixels.
  const leftEdge = scrollArea.scrollLeft + scatter.chartArea.left;
  const rightEdge = leftEdge + scrollArea.clientWidth;

  const offLeft = [];
  const offRight = [];
  for (const point of points) {
    const x = scatter.scales.x.getPixelForValue(point.benchmarkFigure);
    if (x < leftEdge) offLeft.push(point);
    if (x > rightEdge) offRight.push(point);
  }

  const left = document.getElementById("scatter-offscreen-left");
  const right = document.getElementById("scatter-offscreen-right");
  fillBadge(left, offLeft, colorOf, "left");
  fillBadge(right, offRight, colorOf, "right");
  // One at a time: narrowing the left one can leave room for the right one.
  narrowIfWrapped(left);
  narrowIfWrapped(right);

  // Fade each edge while there's more of the chart beyond it, so dots and labels
  // cut off there don't end abruptly. Not at the y-axis: that would fade the
  // countries at zero.
  const atStart = scrollArea.scrollLeft <= 0;
  const atEnd = scrollArea.scrollLeft + scrollArea.clientWidth >= scrollArea.scrollWidth - 1;
  scrollArea.classList.toggle("fade-left", !atStart);
  scrollArea.classList.toggle("fade-right", !atEnd);
}

// A badge for the countries off one side. The highlighted countries are named,
// each with its legend dot: "● Sudan ● Israel +3 more →". Others are only
// counted: "174 countries →".
function fillBadge(badge, points, colorOf, side) {
  badge.replaceChildren();
  badge.classList.remove("narrowed");
  if (points.length === 0) return;

  // Where the text wraps, it breaks between the names and "+3 more", which are
  // each kept in one piece (a long name can still wrap, but never away from its
  // dot): "● Sudan / +3 more". With two names, "+3 more" stays with the second,
  // so it takes two lines rather than three: "● Sudan / ● Israel +3 more".
  const content = [];
  const highlighted = points.filter(point => colorOf(point));
  // In the legend's order: the comparison country, then Israel.
  const legendOrder = [COLORS.comparison, COLORS.focus];
  highlighted.sort((a, b) => legendOrder.indexOf(colorOf(a)) - legendOrder.indexOf(colorOf(b)));
  if (highlighted.length > 0) {
    for (const [index, country] of highlighted.entries()) {
      // A wider space than usual, so the names don't run into the next dot.
      if (index > 0) content.push(wideSpace());
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = colorOf(country);
      const [firstWord, ...restOfName] = country.name.split(" ");
      content.push(keptTogether(dot, firstWord));
      if (restOfName.length) content.push(` ${restOfName.join(" ")}`);
    }
    const others = points.length - highlighted.length;
    // A non-breaking space keeps "+3 more" on the last name's line.
    if (others > 0) content.push(highlighted.length > 1 ? " " : " ", keptTogether(`+${others} more`));
  } else {
    content.push(keptTogether(`${points.length} ${points.length === 1 ? "country" : "countries"}`));
  }

  // The arrow and the text are separate, so the arrow stays at the badge's
  // outer edge when the text wraps.
  const arrow = arrowIcon(side);
  const text = document.createElement("span");
  text.className = "text";
  text.append(...content);
  if (side === "left") badge.append(arrow, text);
  else badge.append(text, arrow);
}

// A wrapped badge stays as wide as the room it was squeezed into, leaving empty
// space beside its lines. Once its text has wrapped (it's taller than one
// line), narrow it to its wrapped text instead.
function narrowIfWrapped(badge) {
  const text = badge.querySelector(".text");
  if (!text) return;
  const lineHeight = parseFloat(getComputedStyle(text).lineHeight);
  if (text.offsetHeight > lineHeight * 1.5) badge.classList.add("narrowed");
}

// A space wider than usual. Where the line breaks there, it disappears like any
// space, so the dot after it still lines up with the line above.
function wideSpace() {
  const span = document.createElement("span");
  span.className = "wide-space";
  span.textContent = " ";
  return span;
}

// Text that never breaks across lines.
function keptTogether(...parts) {
  const span = document.createElement("span");
  span.className = "kept-together";
  span.append(...parts);
  return span;
}

// The legend, as a row of colored dots and labels above the chart. It sits
// outside the scrolling area, so it stays centered when the chart is wider than
// the window.
function drawLegend(items) {
  const legend = document.getElementById("scatter-legend");
  for (const { label, color } of items) {
    const item = document.createElement("span");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = color;
    item.append(dot, label);
    legend.append(item);
  }
}

// The y-axis's width: everything left of the plot area, through the axis line.
const axisWidth = chart => Math.ceil(chart.chartArea.left) + 1;

// A Chart.js plugin keeping the y-axis in view when the chart scrolls sideways.
// On every draw it copies the y-axis (its title, tick labels and line) onto
// `axisCanvas`, which sits beside the scrolling area, and shifts the chart left
// by as much so its own copy is cut off. It copies after the axes are drawn but
// before the dots, so the edges of dots at zero don't come along.
function pinnedAxis(axisCanvas) {
  return {
    id: "pinnedAxis",
    beforeDatasetsDraw(chart) {
      const ratio = chart.currentDevicePixelRatio;
      const width = axisWidth(chart);
      const height = chart.height;
      // Only down far enough to keep the "0%" label whole. Below that is the
      // x-axis labels' row, which is left blank: a copy of it would stay put
      // while the labels it shows scroll away.
      const copiedHeight = Math.ceil(chart.chartArea.bottom) + 8;

      axisCanvas.width = width * ratio;
      axisCanvas.height = height * ratio;
      axisCanvas.style.width = `${width}px`;
      axisCanvas.style.height = `${height}px`;
      chart.canvas.parentElement.style.marginLeft = `-${width}px`;

      const copiedWidthPx = width * ratio;
      const copiedHeightPx = copiedHeight * ratio;
      const ctx = axisCanvas.getContext("2d");
      ctx.drawImage(chart.canvas, 0, 0, copiedWidthPx, copiedHeightPx, 0, 0, copiedWidthPx, copiedHeightPx);
    },
  };
}
