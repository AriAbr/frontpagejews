// Every country's share of mentions against its figure for the chosen
// benchmark, with a dashed line where its shares of the two are equal.
//
// Linear axes, drawn to scale: rather than breaking or bending an axis, the
// chart is made as wide as it needs to be for the dashed line to sit at 45
// degrees, and scrolls sideways. Most countries sit near the origin, because a
// few countries are huge and most are small.
import { ANIMATION, BACKGROUND, COLORS } from "./chart-common.js";
import { multiple, percent } from "./formats.js";

// Rounded up to this, so the coverage axis ends on a round number.
const COVERAGE_AXIS_STEP = 0.01;
const OTHER_COUNTRIES_COLOR = "#a8a29e99";

const roundUp = (n, step) => Math.ceil(n / step) * step;
// Axis ticks fall on whole percents: 0.05 → "5%".
const tickPercent = fraction => `${Math.round(fraction * 100)}%`;

// points: {code, name, mentions, mentionsPercentage, benchmarkFigure,
// benchmarkPercentage} per country, the percentages as fractions of the total.
// benchmarkTotal: the benchmark's total, so a figure over it is a share.
// benchmarkDisplaySettings: the benchmark's entry in BENCHMARK_DISPLAY_SETTINGS.
// days: how many days the mentions cover.
export function drawScatter({ points, benchmarkTotal, benchmarkDisplaySettings, days, focus, comparison }) {
  const coverageAxisMax = roundUp(Math.max(COVERAGE_AXIS_STEP, ...points.map(p => p.mentionsPercentage)), COVERAGE_AXIS_STEP);

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

  // The dashed line runs from the origin until it leaves the chart, through the
  // top edge or the right one, whichever it reaches first.
  // A figure's share of the total: the line's height above it.
  const slope = 1 / benchmarkTotal;
  const lineEnd = Math.min(benchmarkDisplaySettings.axisMax, coverageAxisMax / slope);

  const scatter = new Chart(document.getElementById("scatter"), {
    type: "scatter",
    data: {
      // Later datasets draw on top, so the two highlighted countries come last.
      datasets: [
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
        dots({ label: "Other countries", countries: p => !isHighlighted(p), color: OTHER_COUNTRIES_COLOR, radius: 4 }),
        dots({
          label: comparison.name,
          countries: p => p.code === comparison.code,
          color: COLORS.comparison,
          radius: 7,
        }),
        dots({ label: focus.name, countries: p => p.code === focus.code, color: COLORS.focus, radius: 7 }),
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
          max: benchmarkDisplaySettings.axisMax,
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
          title: { display: true, text: `Share of mentions, last ${days} days` },
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
          callbacks: {
            title: items => items[0].raw.name,
            label: ({ raw: { mentions, mentionsPercentage, benchmarkFigure, benchmarkPercentage } }) => {
              const lines = [
                `${percent(mentionsPercentage)} of mentions (${mentions.toLocaleString()})`,
                `${benchmarkDisplaySettings.label}: ${benchmarkDisplaySettings.format(benchmarkFigure)}`,
              ];
              // A multiple of nothing means nothing.
              if (benchmarkPercentage) lines.push(`${multiple(mentionsPercentage, benchmarkPercentage)} its share`);
              return lines;
            },
          },
        },
      },
    },
    plugins: [pinnedAxis(document.getElementById("scatter-y-axis"))],
  });

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
  const plotWidth = plotHeight * ((slope * benchmarkDisplaySettings.axisMax) / coverageAxisMax);
  const chartWidth = Math.round(plotWidth + aroundPlot);
  document.getElementById("scatter-wrap").style.width = `${chartWidth}px`;
  // The scrolling area shows the chart without its y-axis, which is beside it.
  document.getElementById("scatter-scroll").style.width = `${chartWidth - axisWidth(scatter)}px`;
  scatter.resize();
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
