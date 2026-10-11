// Coverage and reality over time for the two countries, as shares on a log axis.
import { ANIMATION, COLORS, data } from "./chart-common.js";

// Two significant figures, written out: 150 rather than toPrecision's "1.5e+2".
const twoFigures = n => (+n.toPrecision(2)).toLocaleString();
// Log axes cannot show zero, so a day with no mentions is a gap.
const pct = value => (value ? 100 * value : null);

const canvas = document.getElementById("line-chart");
if (canvas) {
  const days = data("line-chart-data");
  const { focus, comparison } = data("countries");
  const line = (label, key, color, dashed) => ({
    label,
    data: days.map(day => pct(day[key])),
    borderColor: color,
    backgroundColor: color,
    borderDash: dashed ? [6, 4] : [],
    borderWidth: dashed ? 2 : 2.5,
    pointRadius: dashed ? 0 : 2,
    tension: 0.25,
  });
  new Chart(canvas, {
    type: "line",
    data: {
      labels: days.map(day => day.date),
      // Two shades per country: dark solid for coverage, light dashed for reality.
      datasets: [
        line(`${focus.name} coverage`, "focus_coverage", COLORS.focus, false),
        line(`${focus.name} reality`, "focus_reality", "#60a5fa", true),
        line(`${comparison.name} coverage`, "comparison_coverage", COLORS.comparison, false),
        line(`${comparison.name} reality`, "comparison_reality", "#fb923c", true),
      ],
    },
    options: {
      animation: ANIMATION,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      // Fixed range so switching countries or outlets never rescales.
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
          type: "logarithmic",
          min: 0.01,
          max: 100,
          afterBuildTicks: axis => { axis.ticks = [0.01, 0.1, 1, 10, 100].map(value => ({ value })); },
          ticks: { callback: v => `${v}%` },
        },
      },
      plugins: {
        // Draw each legend entry as a short line, so dashed reality lines read as dashed.
        legend: { labels: { usePointStyle: true, pointStyle: "line", pointStyleWidth: 32 } },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y == null ? "none" : twoFigures(ctx.parsed.y) + "%"}`,
          },
        },
      },
    },
  });
}
