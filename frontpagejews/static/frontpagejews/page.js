// Loads data.json, and the month's file if the visitor picked a month, applies
// the visitor's choices from the query string, and fills in the page.
import { BENCHMARK_DISPLAY_SETTINGS } from "./benchmark-display-settings.js";
import { setUpControls } from "./controls.js";
import {
  benchmarkTotal,
  COMPOSITE_WEIGHTS,
  countryName,
  groupCode,
  lineChartRows,
  scatterPoints,
  withComposite,
  withCountriesCombined,
  withoutCountries,
} from "./chart-data.js";
import { choicesFromUrl, comparisonChoices } from "./choices.js";
import { withBenchmarkLinked } from "./definitions.js";
import { describePeriod, timeAgo } from "./formats.js";
import { drawHeadline } from "./headline.js";
import { drawLineChart, explainDayRangeWithoutData } from "./line-chart.js";
import { drawScatter } from "./scatter.js";
import { drawSummaryBar } from "./summary-bar.js";

const siteData = await fetchJson("data.json");
// The charts are drawn once, onto canvases, so their text is in whatever font
// has loaded by then: wait for Noto Sans.
await document.fonts.ready;
// A picked month's days take the place of the last days.
const { month } = choicesFromUrl(location.search, siteData);
const allData = month ? { ...siteData, ...(await fetchJson(`months/${month}.json`)) } : siteData;
const shownData = withoutCountries(allData, allData.home_countries);
// Read before they're combined, while the data still names each of them.
const { comparisonCountries } = choicesFromUrl(location.search, shownData);
const combinedData = withCountriesCombined(shownData, comparisonCountries);
// After leaving countries out and combining them, so the composite's shares
// are of the countries shown.
const data = withComposite(combinedData, COMPOSITE_WEIGHTS);
// Once the composite's added, so it can be the benchmark.
const { selectedOutlets, benchmark } = choicesFromUrl(location.search, data);
const comparisonCode = groupCode(comparisonCountries);
const focus = { code: data.focus, name: countryName(data, data.focus) };
const comparison = { code: comparisonCode, name: countryName(data, comparisonCode), countries: comparisonCountries };
const period = describePeriod(month, siteData.days.length);

document.getElementById("comparison-name").textContent = comparison.name;
fillBenchmarkSpans(".benchmark-noun", BENCHMARK_DISPLAY_SETTINGS[benchmark].noun);
fillBenchmarkSpans(".benchmark-share", BENCHMARK_DISPLAY_SETTINGS[benchmark].share);
// The page says "last 30 days" until a month is picked.
if (month) {
  for (const span of document.querySelectorAll(".period")) span.textContent = period;
}
if (data.last_fetched) showLastFetched(new Date(data.last_fetched));
setUpControls({
  choices: comparisonChoices(data, selectedOutlets, benchmark),
  comparison,
  selectedOutlets,
  benchmark,
  months: data.months,
  month,
  daysShown: siteData.days.length,
});
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
  const rows = lineChartRows(data, selectedOutlets, comparison.code, benchmark);
  drawLineChart({ rows, benchmarkDisplaySettings: BENCHMARK_DISPLAY_SETTINGS[benchmark], focus, comparison });
  // A period without a single day of data, like the NY Post alone in 2021,
  // has no shares to plot: the scatter is drawn empty, saying why, as the
  // line chart does over its days.
  const periodHasData = rows.some(row => row.focusMentionsPercentage !== null);
  const points = periodHasData ? scatterPoints(data, selectedOutlets, benchmark) : [];
  drawHeadline({ points, benchmarkDisplaySettings: BENCHMARK_DISPLAY_SETTINGS[benchmark], focus, comparison });
  drawScatter({
    points,
    benchmarkTotal: benchmarkTotal(data, benchmark),
    benchmarkDisplaySettings: BENCHMARK_DISPLAY_SETTINGS[benchmark],
    period,
    focus,
    comparison,
    noDataExplanation: periodHasData ? null : explainDayRangeWithoutData(rows, { firstDay: 0, lastDay: rows.length - 1 }),
  });
} else {
  document.getElementById("charts").hidden = true;
  document.getElementById("no-data").hidden = false;
}

// A dropped connection, as on a phone switching networks, gets a couple more
// tries. If they fail too, the page says so in place of the charts, and the
// error goes on to Sentry.
async function fetchJson(url) {
  const attempts = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt === attempts) {
        document.getElementById("charts").hidden = true;
        document.getElementById("load-failed").hidden = false;
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
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
