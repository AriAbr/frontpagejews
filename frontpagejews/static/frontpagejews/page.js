// Loads data.json, applies the visitor's choices from the query string, and
// fills in the page.
import { setUpControls } from "./controls.js";
import {
  averageMentionsPerPerson,
  choicesFromUrl,
  comparisonChoices,
  countryName,
  lineChartRows,
  scatterPoints,
} from "./coverage.js";
import { drawLineChart } from "./line-chart.js";
import { drawScatter } from "./scatter.js";

const data = await (await fetch("data.json")).json();
const { selectedOutlets, comparisonCode } = choicesFromUrl(location.search, data);
const focus = { code: data.focus, name: countryName(data, data.focus) };
const comparison = { code: comparisonCode, name: countryName(data, comparisonCode) };

document.getElementById("comparison-name").textContent = comparison.name;
setUpControls({ choices: comparisonChoices(data, selectedOutlets), comparison, selectedOutlets });

if (data.days.length) {
  // Shown before drawing, since Chart.js sizes charts from their containers.
  document.getElementById("charts").hidden = false;
  drawLineChart({ rows: lineChartRows(data, selectedOutlets, comparison.code), focus, comparison });
  drawScatter({
    points: scatterPoints(data, selectedOutlets),
    slope: averageMentionsPerPerson(data, selectedOutlets),
    days: data.days.length,
    focus,
    comparison,
  });
} else {
  document.getElementById("no-data").hidden = false;
}
