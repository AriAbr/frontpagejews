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

// The country's line, as a list of one paragraph, or of none if the country
// wasn't mentioned or has no figure for the benchmark.
function headlineLine(country, color, points, benchmarkDisplaySettings) {
  const point = points.find(p => p.code === country.code);
  if (!point) return [];

  const line = document.createElement("p");
  const name = element("strong", country.name);
  name.style.color = color;

  // A multiple of nothing means nothing.
  if (!point.benchmarkPercentage) {
    line.append(name, ` gets ${percent(point.mentionsPercentage)} of mentions, with no ${benchmarkDisplaySettings.noun} recorded`);
    return [line];
  }

  const times = element("strong", multiple(point.mentionsPercentage, point.benchmarkPercentage));
  const shares = `${percent(point.mentionsPercentage)} of mentions, ${benchmarkDisplaySettings.describeShare(point.benchmarkPercentage)}`;
  const detail = element("span", `(${shares})`);
  detail.className = "detail";
  line.append(name, " gets ", times, " its share of coverage ", detail);
  return [line];
}

function element(tag, text) {
  const created = document.createElement(tag);
  created.textContent = text;
  return created;
}
