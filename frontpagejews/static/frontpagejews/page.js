// Loads data.json, and the month's file if the visitor picked a month, applies
// the visitor's choices from the query string, and fills in the page.
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
import { withBenchmarkLinked } from "./definitions.js";
import { describePeriod, timeAgo } from "./formats.js";
import { drawHeadline } from "./headline.js";
import { drawLineChart } from "./line-chart.js";
import { drawScatter } from "./scatter.js";
import { drawSummaryBar } from "./summary-bar.js";

const siteData = await fetchJson("data.json");
// A picked month's days take the place of the last days.
const { month } = choicesFromUrl(location.search, siteData);
const allData = month ? { ...siteData, ...(await fetchJson(`months/${month}.json`)) } : siteData;
const shownData = withoutCountries(allData, allData.home_countries);
// After leaving countries out, so the composite's shares are of the countries shown.
const data = withComposite(shownData, COMPOSITE_WEIGHTS);
const { selectedOutlets, comparisonCode, benchmark } = choicesFromUrl(location.search, data);
const focus = { code: data.focus, name: countryName(data, data.focus) };
const comparison = { code: comparisonCode, name: countryName(data, comparisonCode) };
const period = describePeriod(month, siteData.days.length);

document.getElementById("comparison-name").textContent = comparison.name;
fillBenchmarkSpans(".benchmark-noun", BENCHMARK_DISPLAY_SETTINGS[benchmark].noun);
fillBenchmarkSpans(".benchmark-share", BENCHMARK_DISPLAY_SETTINGS[benchmark].share);
// The page says "last 30 days" until a month is picked.
if (month) {
  for (const span of document.querySelectorAll(".period")) span.textContent = period;
}
if (data.last_fetched) showLastFetched(new Date(data.last_fetched));
setUpControls({ choices: comparisonChoices(data, selectedOutlets, benchmark), comparison, selectedOutlets, benchmark });
drawSummaryBar({
  focus,
  comparison,
  benchmarkDisplaySettings: BENCHMARK_DISPLAY_SETTINGS[benchmark],
  selectedOutlets,
  outletCount: Object.keys(data.outlets).length,
  period,
});

if (data.days.length) {
  document.getElementById("charts").classList.remove("loading");
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
    period,
    focus,
    comparison,
  });
} else {
  document.getElementById("charts").hidden = true;
  document.getElementById("no-data").hidden = false;
}

async function fetchJson(url) {
  return (await fetch(url)).json();
}

// "Data updated 2 hours ago" in the byline, with the exact time on hover.
function showLastFetched(lastFetched) {
  const time = document.getElementById("last-fetched-time");
  time.dateTime = lastFetched.toISOString();
  time.title = lastFetched.toLocaleString();
  time.textContent = timeAgo(lastFetched, new Date());
  document.getElementById("last-fetched").hidden = false;
}

// Fills each span of the class with the benchmark's text. In the charts'
// descriptions (marked benchmark-definition), the benchmark's noun links to
// its definition, where it has one; in the headings it's plain text.
function fillBenchmarkSpans(selector, text) {
  for (const span of document.querySelectorAll(selector)) {
    if (span.classList.contains("benchmark-definition")) span.replaceChildren(...withBenchmarkLinked(text, BENCHMARK_DISPLAY_SETTINGS[benchmark]));
    else span.textContent = text;
  }
}
