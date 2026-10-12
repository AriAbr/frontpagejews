// Every country's mentions against the chosen benchmark (population or GDP),
// with a dashed line where a country would sit if mentions followed it.
//
// Plain totals on linear axes, drawn to scale. Rather than breaking or bending
// an axis, the chart is made as wide as it needs to be for the dashed line to
// sit at 45 degrees, and scrolls sideways. Most countries sit near the origin,
// because a few countries are huge and most are small.
import { ANIMATION, BACKGROUND, COLORS } from "./chart-common.js";

// Rounded up to this, so the mentions axis ends on a round number.
const MENTIONS_AXIS_STEP = 500;
const OTHER_COUNTRIES_COLOR = "#a8a29e99";
const LINE_LABEL = "Average";

const roundUp = (n, step) => Math.ceil(n / step) * step;

// points: {code, name, mentions, reality} per country.
// slope: mentions per unit of the benchmark, which is the dashed line's slope.
// benchmarkDisplaySettings: the benchmark's entry in BENCHMARK_DISPLAY_SETTINGS.
// days: how many days the mentions cover.
export function drawScatter({ points, slope, benchmarkDisplaySettings, days, focus, comparison }) {
  const mentionsAxisMax = roundUp(Math.max(MENTIONS_AXIS_STEP, ...points.map(p => p.mentions)), MENTIONS_AXIS_STEP);

  // One group of dots. Each dot keeps its whole point, so the tooltip and
  // clicks can use its name and code; `parsing` says which fields to plot.
  const dots = ({ label, countries, color, radius }) => ({
    label,
    data: points.filter(countries),
    parsing: { xAxisKey: "reality", yAxisKey: "mentions" },
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
  const lineEnd = slope ? Math.min(benchmarkDisplaySettings.axisMax, mentionsAxisMax / slope) : 0;

  const scatter = new Chart(document.getElementById("scatter"), {
    type: "scatter",
    data: {
      // Later datasets draw on top, so the two highlighted countries come last.
      datasets: [
        {
          type: "line",
          label: LINE_LABEL,
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
          title: { display: true, text: benchmarkDisplaySettings.label },
          ticks: { stepSize: benchmarkDisplaySettings.axisStep, callback: benchmarkDisplaySettings.format },
        },
        y: {
          type: "linear",
          min: 0,
          max: mentionsAxisMax,
          title: { display: true, text: `Mentions, last ${days} days` },
        },
      },
      plugins: {
        // The page's description explains the line, so the legend lists only the dots.
        legend: { labels: { usePointStyle: true, filter: item => item.text !== LINE_LABEL } },
        tooltip: {
          // Only dots get a tooltip; the line's points have no name.
          filter: item => item.raw.name,
          callbacks: {
            title: items => items[0].raw.name,
            label: ({ raw: { mentions, reality } }) => [
              `Mentions: ${mentions.toLocaleString()}`,
              `${benchmarkDisplaySettings.label}: ${benchmarkDisplaySettings.format(reality)}`,
              benchmarkDisplaySettings.rate(mentions, reality),
            ],
          },
        },
      },
    },
  });

  // Widen the chart until the dashed line sits at 45 degrees. That happens
  // when the plot area's width-to-height ratio equals the line's rise over
  // the whole benchmark axis, divided by the mentions axis. The legend and
  // axis labels take up fixed space around the plot area, so that is measured
  // from what Chart.js actually laid out and added back on.
  if (slope) {
    const area = scatter.chartArea;
    const plotHeight = area.bottom - area.top;
    const aroundPlot = scatter.width - (area.right - area.left);
    const plotWidth = plotHeight * ((slope * benchmarkDisplaySettings.axisMax) / mentionsAxisMax);
    document.getElementById("scatter-wrap").style.width = `${Math.round(plotWidth + aroundPlot)}px`;
    scatter.resize();
  }
}
