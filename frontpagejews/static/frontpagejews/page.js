// Loads data.json, applies the visitor's choices from the query string, and
// fills in the page.
import { BENCHMARK_DISPLAY_SETTINGS } from "./benchmark-display-settings.js";
import { setUpControls } from "./controls.js";
import {
  benchmarkTotal,
  COMPOSITE_WEIGHTS,
  countryName,
  lineChartRows,
  scatterPoints,
  withComposite,
  withoutCountries,
} from "./chart-data.js";
import { choicesFromUrl, comparisonChoices } from "./choices.js";
import { drawHeadline } from "./headline.js";
import { drawLineChart } from "./line-chart.js";
import { drawScatter } from "./scatter.js";

const allData = await (await fetch("data.json")).json();
const shownData = withoutCountries(allData, allData.home_countries);
// After leaving countries out, so the composite's shares are of the countries shown.
const data = withComposite(shownData, COMPOSITE_WEIGHTS);
const { selectedOutlets, comparisonCode, benchmark } = choicesFromUrl(location.search, data);
const focus = { code: data.focus, name: countryName(data, data.focus) };
const comparison = { code: comparisonCode, name: countryName(data, comparisonCode) };

document.getElementById("comparison-name").textContent = comparison.name;
for (const span of document.querySelectorAll(".benchmark-noun")) span.textContent = BENCHMARK_DISPLAY_SETTINGS[benchmark].noun;
for (const span of document.querySelectorAll(".benchmark-share")) span.textContent = BENCHMARK_DISPLAY_SETTINGS[benchmark].share;
setUpControls({ choices: comparisonChoices(data, selectedOutlets, benchmark), comparison, selectedOutlets, benchmark });

if (data.days.length) {
  // Shown before drawing, since Chart.js sizes charts from their containers.
  document.getElementById("charts").hidden = false;
  drawLineChart({
    rows: lineChartRows(data, selectedOutlets, comparison.code, benchmark),
    benchmarkDisplaySettings: BENCHMARK_DISPLAY_SETTINGS[benchmark],
    focus,
    comparison,
  });
  const points = scatterPoints(data, selectedOutlets, benchmark);
  drawHeadline({ points, benchmarkDisplaySettings: BENCHMARK_DISPLAY_SETTINGS[benchmark], focus, comparison });
  drawScatter({
    points,
    benchmarkTotal: benchmarkTotal(data, benchmark),
    benchmarkDisplaySettings: BENCHMARK_DISPLAY_SETTINGS[benchmark],
    days: data.days.length,
    focus,
    comparison,
  });
} else {
  document.getElementById("no-data").hidden = false;
}
