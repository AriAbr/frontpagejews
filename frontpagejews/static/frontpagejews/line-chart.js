// Each country's daily share of mentions, as it is, against its share of the
// benchmark.
//
// The axis is sized for coverage and fixed, whichever benchmark is chosen, so
// the coverage lines always look the same. A benchmark share above the axis
// gets no line, which would read as a value on the axis: it is written inside
// the top of the chart instead ("▲ China GDP: 23.6%, above the chart").
import { ANIMATION, COLORS, hideTooltipOnPressElsewhere } from "./chart-common.js";
import { multiple, percent } from "./formats.js";

// Just past the highest daily coverage share at any one outlet in the 30 days
// to October 11, 2026 (Israel at the New York Post, 14.1%), so a visitor who
// ticks a single outlet still sees its whole line. Even, so the axis ends on
// one of its 2% ticks.
const AXIS_MAX = 0.16;

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
    // The tooltip gives the share as the coverage lines do, and as the
    // headline does: "0.12% population".
    tooltipLabel: share == null ? `no ${benchmarkDisplaySettings.noun} recorded` : `${percent(share)} ${benchmarkDisplaySettings.noun}`,
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
    const tooltipGroup = {
      name: country.name,
      color,
      footer: dayIndex => expectedCoverage(rows[dayIndex][mentionsPercentageKey], rows[dayIndex][benchmarkPercentageKey]),
    };
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
    plugins: [aboveAxisNotes(aboveAxis), hoveredDayLine],
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
        // No labels, only its border, which closes the plot on the right where
        // Chart.js leaves out the last day's grid line to make room for the labels.
        right: { position: "right", display: true, ticks: { display: false }, grid: { drawOnChartArea: false, drawTicks: false } },
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
          // At the top, beside the line down the hovered day. See drawTooltip
          // in chart-common.js.
          atTopBesideDay: true,
          // Each country's benchmark before its coverage, as in the scatter's
          // tooltip; the countries stay in the datasets' order.
          itemSort(a, b) {
            if (a.dataset.tooltipGroup !== b.dataset.tooltipGroup) return a.datasetIndex - b.datasetIndex;
            return Boolean(b.dataset.isBenchmark) - Boolean(a.dataset.isBenchmark);
          },
          callbacks: {
            // "June 14, 2023" rather than "2023-06-14", with the month in full as elsewhere on the page.
            title: items => {
              const date = new Date(`${items[0].label}T00:00:00Z`);
              return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
            },
            // Number first, as in the headline: "6.0% share of coverage". The
            // swatch, not the words, ties the row to its line. Benchmark lines'
            // tooltip labels already give their share.
            label: ({ dataset, parsed }) =>
              dataset.isBenchmark
                ? dataset.tooltipLabel
                : parsed.y == null ? `no ${dataset.tooltipLabel}` : `${percent(parsed.y / 100)} ${dataset.tooltipLabel}`,
          },
        },
      },
    },
  });
  hideTooltipOnPressElsewhere(lineChart);
}

// The day's multiple, as in the headline: "6.5× expected coverage". None on a
// day the country wasn't mentioned, or where it has no figure for the
// benchmark: a multiple of nothing means nothing.
function expectedCoverage(mentionsPercentage, benchmarkPercentage) {
  if (!mentionsPercentage || !benchmarkPercentage) return null;
  const times = document.createElement("strong");
  times.textContent = multiple(mentionsPercentage, benchmarkPercentage);
  const footer = document.createDocumentFragment();
  footer.append(times, " expected coverage");
  return footer;
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

// A Chart.js plugin putting a line down the hovered day, which ties the
// tooltip at the top to its day. An element behind the canvas rather than
// drawn on it, so it fades and glides with the tooltip, by the same CSS, and
// sits under the lines.
const hoveredDayLine = {
  id: "hoveredDayLine",
  afterDraw({ canvas, chartArea, tooltip }) {
    let dayLine = canvas.parentElement.querySelector(".day-line");
    if (!dayLine) {
      dayLine = document.createElement("div");
      dayLine.className = "day-line";
      canvas.before(dayLine);
    }
    const hovered = tooltip.getActiveElements()[0];
    if (!hovered || tooltip.opacity === 0) {
      dayLine.classList.remove("shown");
      return;
    }
    dayLine.style.top = `${chartArea.top}px`;
    dayLine.style.height = `${chartArea.bottom - chartArea.top}px`;
    // It glides from one day to the next, but where it was hidden, it fades
    // in at the new day, as the tooltip does.
    dayLine.classList.toggle("gliding", dayLine.classList.contains("shown"));
    dayLine.classList.add("shown");
    dayLine.style.transform = `translateX(${Math.round(hovered.element.x)}px)`;
  },
};
