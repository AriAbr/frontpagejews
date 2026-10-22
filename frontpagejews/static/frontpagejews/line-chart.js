// Each country's daily share of mentions, as it is, against its share of the
// benchmark.
//
// The axis is sized for coverage and fixed, whichever benchmark is chosen, so
// the coverage lines always look the same. A benchmark share above the axis
// gets no line, which would read as a value on the axis: it is written inside
// the top of the chart instead ("▲ China GDP: 23.6%, above the chart").
import { ANIMATION, COLORS, hideTooltipOnPressElsewhere } from "./chart-common.js";
import { MIN_MENTIONS_PER_DAY } from "./chart-data.js";
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
    plugins: [aboveAxisNotes(aboveAxis), hoveredDayLine, noDataBands(rows)],
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
            // A day without data has no coverage lines in the tooltip, which
            // leaves out missing values, so this says why, once.
            footer: items => explainDayWithoutData(rows[items[0].dataIndex]),
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

// A Chart.js plugin shading the days with no coverage to show, where the
// lines break, with a "No data ⓘ" note across them, so the break reads as
// missing data rather than a gap in the chart. Hovering or tapping the note
// says why. Where the band is too narrow for the note (a single day), the note
// goes beside it, on the side with more room, as a half see-through badge,
// with a line pointing back to the band. The notes are buttons in the page
// over the canvas, so they can be focused and tapped.
function noDataBands(rows) {
  // Each run of days without data, by its first and last day's index.
  const runs = [];
  rows.forEach((row, dayIndex) => {
    if (row.focusMentionsPercentage !== null) return;
    const previousRun = runs.at(-1);
    if (previousRun && previousRun.lastDay === dayIndex - 1) previousRun.lastDay = dayIndex;
    else runs.push({ firstDay: dayIndex, lastDay: dayIndex });
  });
  // From the last day with data before the run to the first one after, where
  // the lines stop and start again, or to the plot's edge.
  const bandEdges = (x, chartArea, { firstDay, lastDay }) => ({
    left: firstDay > 0 ? x.getPixelForValue(firstDay - 1) : chartArea.left,
    right: lastDay < rows.length - 1 ? x.getPixelForValue(lastDay + 1) : chartArea.right,
  });
  // Room between a narrow band and its badge.
  const BADGE_GAP = 16;
  let notes;
  return {
    id: "noDataBands",
    // The shading under the lines, and a narrow band's line to its badge.
    beforeDatasetsDraw({ ctx, chartArea, scales: { x } }) {
      ctx.save();
      ctx.fillStyle = Chart.defaults.borderColor;
      ctx.globalAlpha = 0.5;
      for (const run of runs) {
        const { left, right } = bandEdges(x, chartArea, run);
        ctx.fillRect(left, chartArea.top, right - left, chartArea.height);
      }
      ctx.restore();
    },
    afterDatasetsDraw({ canvas, ctx, chartArea, scales: { x } }) {
      notes ??= runs.map(run => noDataNoteElement(canvas, explainDayRangeWithoutData(rows, run)));
      const middle = chartArea.top + chartArea.height / 2;
      runs.forEach((run, i) => {
        const { left, right } = bandEdges(x, chartArea, run);
        const note = notes[i];
        note.style.top = `${middle}px`;
        const fits = note.offsetWidth + 16 <= right - left;
        note.classList.toggle("beside", !fits);
        if (fits) {
          note.style.left = `${(left + right) / 2}px`;
          note.dataset.side = "center";
          return;
        }
        const toRight = chartArea.right - right >= left - chartArea.left;
        note.style.left = `${toRight ? right + BADGE_GAP : left - BADGE_GAP}px`;
        note.dataset.side = toRight ? "right" : "left";
        ctx.save();
        ctx.strokeStyle = Chart.defaults.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo((left + right) / 2, middle);
        ctx.lineTo(toRight ? right + BADGE_GAP : left - BADGE_GAP, middle);
        ctx.stroke();
        ctx.restore();
      });
    },
  };
}

// A "No data ⓘ" button over the chart, whose explanation shows while it's
// hovered or focused: tapping it focuses it on a phone, and tapping elsewhere
// hides it again.
// Room between a note's explanation and the window's edge, as for tooltips.
const WINDOW_GAP = 12;

function noDataNoteElement(canvas, explanation) {
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
  canvas.after(note);
  return note;
}

// Why a run of days has no coverage to show, for its "No data" note. No dates:
// the note sits on them.
function explainDayRangeWithoutData(rows, { firstDay, lastDay }) {
  const gdeltMissing = rows.slice(firstDay, lastDay + 1).every(row => !row.gdeltHasDay);
  if (gdeltMissing) {
    return "GDELT, the database these article counts come from, had an outage and has no articles from any outlet for these days.";
  }
  return `GDELT picked up fewer than ${MIN_MENTIONS_PER_DAY} country mentions a day on these days for the selected outlets, most likely a gap in its data collection. Too few for meaningful analysis.`;
}

// Why a day has no coverage to show, for its popup, or "" for a day that has.
function explainDayWithoutData(row) {
  if (row.focusMentionsPercentage !== null) return "";
  if (!row.gdeltHasDay) {
    return "No data: GDELT, the database these article counts come from, had an outage and has no articles from any outlet for this day.";
  }
  return `No data: GDELT picked up fewer than ${MIN_MENTIONS_PER_DAY} country mentions this day for the selected outlets, most likely a gap in its data collection.`;
}
