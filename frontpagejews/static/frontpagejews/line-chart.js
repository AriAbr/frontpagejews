// Each country's daily share of mentions, as it is, against its share of the
// benchmark.
//
// The axis is sized for coverage and fixed, whichever benchmark is chosen, so
// the coverage lines always look the same. A benchmark share above the axis
// gets no line, which would read as a value on the axis: it is written inside
// the top of the chart instead ("▲ China GDP: 23.6%, above the chart").
import { ANIMATION, COLORS, hideTooltipOnPressElsewhere } from "./chart-common.js";
import { percent } from "./formats.js";

// Just past the highest daily coverage share at any one outlet in the 30 days
// to October 11, 2026 (Israel at the New York Post, 14.1%), so a visitor who
// ticks a single outlet still sees its whole line. Even, so the axis ends on
// one of its 2% ticks.
const AXIS_MAX = 0.16;

// Two significant figures, written out: 150 rather than toPrecision's "1.5e+2".
const twoFigures = n => (+n.toPrecision(2)).toLocaleString();
// A share as a percentage, or a gap where there is no figure.
const percentOrGap = value => (value == null ? null : 100 * value);

// rows: one per day, from `lineChartRows` in chart-data.js.
// benchmarkDisplaySettings: the benchmark's entry in BENCHMARK_DISPLAY_SETTINGS,
// which names the benchmark lines: "Israel population".
export function drawLineChart({ rows, benchmarkDisplaySettings, focus, comparison }) {
  // The tooltip lists each country's lines under its name, so their labels
  // there leave it out.
  const coverageLine = (country, key, color, tooltipGroup) => ({
    label: `${country.name} coverage`,
    tooltipLabel: "share of coverage",
    tooltipGroup,
    data: rows.map(row => percentOrGap(row[key])),
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2.5,
    pointRadius: 2,
  });
  // The benchmark is the same every day, so its share is a flat line.
  const benchmarkLine = (label, share, color, tooltipGroup) => ({
    label: `${label} (${share == null ? "no figure" : percent(share)})`,
    // The tooltip gives the share as the coverage lines do: "population: 0.12%".
    tooltipLabel: `${benchmarkDisplaySettings.noun}: ${share == null ? "no figure" : percent(share)}`,
    tooltipGroup,
    data: rows.map(() => percentOrGap(share)),
    isBenchmark: true,
    borderColor: color,
    backgroundColor: color,
    borderDash: [6, 4],
    borderWidth: 2,
    pointRadius: 0,
  });

  const datasets = [];
  // Benchmark shares too big for the axis, written in by `aboveAxisNotes`.
  const aboveAxis = [];
  const countries = [
    { country: focus, color: COLORS.focus, mentionsPercentageKey: "focusMentionsPercentage", benchmarkPercentageKey: "focusBenchmarkPercentage" },
    { country: comparison, color: COLORS.comparison, mentionsPercentageKey: "comparisonMentionsPercentage", benchmarkPercentageKey: "comparisonBenchmarkPercentage" },
  ];
  for (const { country, color, mentionsPercentageKey, benchmarkPercentageKey } of countries) {
    const tooltipGroup = { name: country.name, color };
    datasets.push(coverageLine(country, mentionsPercentageKey, color, tooltipGroup));
    const label = `${country.name} ${benchmarkDisplaySettings.noun}`;
    const share = rows[0][benchmarkPercentageKey];
    if (share > AXIS_MAX) {
      aboveAxis.push({ text: `▲ ${label}: ${percent(share)}, above the chart`, color });
    } else {
      datasets.push(benchmarkLine(label, share, color, tooltipGroup));
    }
  }

  const lineChart = new Chart(document.getElementById("line-chart"), {
    type: "line",
    data: { labels: rows.map(row => row.date), datasets },
    plugins: [aboveAxisNotes(aboveAxis)],
    options: {
      animation: ANIMATION,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: {
          // "Sep 22" rather than "2026-09-22", so the labels fit without tilting.
          ticks: {
            maxRotation: 0,
            callback(value) {
              const date = new Date(`${this.getLabelForValue(value)}T00:00:00Z`);
              return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
            },
          },
        },
        y: {
          type: "linear",
          min: 0,
          // Rounded: 100 * 0.14 is 14.000000000000002, which would be the top label.
          max: Math.round(100 * AXIS_MAX),
          ticks: { callback: v => `${v}%` },
        },
      },
      plugins: {
        // Draw each legend entry as a short line, dashed for the benchmark lines:
        // a zero-height box is just its outline, which Chart.js strokes with the
        // dataset's dash. (Point-style legends ignore the dash.)
        legend: { labels: { boxWidth: 32, boxHeight: 0 } },
        tooltip: {
          callbacks: {
            // Benchmark lines' tooltip labels already give their share.
            label: ({ dataset, parsed }) =>
              dataset.isBenchmark
                ? dataset.tooltipLabel
                : `${dataset.tooltipLabel}: ${parsed.y == null ? "none" : twoFigures(parsed.y) + "%"}`,
          },
        },
      },
    },
  });
  hideTooltipOnPressElsewhere(lineChart);
}

// A Chart.js plugin writing each note inside the top left of the plot area,
// one under the other, in its country's color.
function aboveAxisNotes(notes) {
  return {
    id: "aboveAxisNotes",
    afterDraw({ ctx, chartArea }) {
      ctx.save();
      ctx.font = `600 13px ${Chart.defaults.font.family}`;
      ctx.textBaseline = "top";
      notes.forEach(({ text, color }, i) => {
        ctx.fillStyle = color;
        ctx.fillText(text, chartArea.left + 8, chartArea.top + 6 + i * 18);
      });
      ctx.restore();
    },
  };
}
