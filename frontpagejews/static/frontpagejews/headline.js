// The page's headline: how many times its share of the benchmark each of the
// two countries gets in coverage, in big type above the charts, so the gist
// is there at a glance and in a screenshot.
import { COLORS } from "./chart-common.js";
import { multiple, percent } from "./formats.js";

// points: the scatter's points, {code, coverage, reality} with shares.
// benchmarkDisplaySettings: the benchmark's entry in BENCHMARK_DISPLAY_SETTINGS.
export function drawHeadline({ points, benchmarkDisplaySettings, focus, comparison }) {
  const headline = document.getElementById("headline");
  headline.append(...headlineLine(focus, COLORS.focus, points, benchmarkDisplaySettings));
  headline.append(...headlineLine(comparison, COLORS.comparison, points, benchmarkDisplaySettings));
}

// The country's part, as a list of one block, or of none if the country
// wasn't mentioned: its line, and under it the two shares the multiple comes
// from, or only its line where it has no figure for the benchmark.
function headlineLine(country, color, points, benchmarkDisplaySettings) {
  const point = points.find(p => p.code === country.code);
  if (!point) return [];

  const part = document.createElement("div");
  const line = document.createElement("p");
  const name = element("strong", `${country.name}:`);
  name.style.color = color;
  part.append(line);

  // A multiple of nothing means nothing.
  if (!point.benchmarkPercentage) {
    line.append(name, ` ${percent(point.mentionsPercentage)} of country mentions, no ${benchmarkDisplaySettings.noun} recorded`);
    return [part];
  }

  const times = element("strong", multiple(point.mentionsPercentage, point.benchmarkPercentage));
  line.append(name, " ", times, " expected coverage");

  // Each share is kept in one piece, with a dot between them, so where the two
  // don't fit on one line they break between them, and the dot goes:
  // "6.0% of country mentions · 0.89% composite score".
  const shares = document.createElement("div");
  shares.append(
    element("span", `${percent(point.mentionsPercentage)} of country mentions`),
    element("span", benchmarkDisplaySettings.describeShare(point.benchmarkPercentage)),
  );
  const detail = document.createElement("div");
  detail.className = "detail";
  detail.append(shares);
  part.append(detail);
  return [part];
}

function element(tag, text) {
  const created = document.createElement(tag);
  created.textContent = text;
  return created;
}
